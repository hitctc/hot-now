import type { SqliteDatabase } from "../db/openDatabase.js";
import { sendEmailMessage } from "../mail/sendEmailMessage.js";
import type { RuntimeConfig } from "../types/appConfig.js";
import {
  findCreativeSourceItemById,
  updateCreativeSourceItemWritingStatus,
} from "./creativeSourceItemRepository.js";

type JobType = "evaluate" | "write";
type TriggerKind = "automatic" | "manual-evaluate" | "manual-write";
type JobStatus = "pending" | "running" | "retrying" | "dispatched" | "succeeded" | "failed" | "uncertain" | "cancelled" | "expired";
type AlertKind = JobType | "queue-stall";

type AutomationJob = {
  id: number;
  job_type: JobType;
  source_item_id: number;
  trigger_kind: TriggerKind;
  status: JobStatus;
  attempts: number;
  next_run_at: string | null;
  thesis: string | null;
  force_account_fit: number;
};

export type CreativeAutomationStatus = {
  autoEvaluateEnabled: boolean;
  autoWriteEnabled: boolean;
  pendingEvaluationCount: number;
  pendingWriteCount: number;
  retryingJobCount: number;
  expiredAutomaticWriteCount: number;
  automaticWriteDispatchedToday: number;
  latestErrors: Array<{ jobType: JobType; sourceItemId: number; error: string; updatedAt: string }>;
};

export type EnqueueResult = { accepted: boolean; jobId?: number; reason?: string };

/**
 * SQLite 是唯一任务真源：进程重启后由恢复扫描继续执行，Hermes 只负责评估和实际文章生产。
 */
export class CreativeAutomationService {
  private timer: ReturnType<typeof setInterval> | null = null;
  private evaluationRunning = false;
  private writingRunning = false;
  private wakeScheduled = false;

  constructor(
    private readonly db: SqliteDatabase,
    private readonly config: RuntimeConfig | null,
    private readonly hermes: { baseUrl: string; token: string } | null,
    private readonly logger: { info: (context: unknown, message?: string) => void; error: (context: unknown, message?: string) => void } | null = null,
  ) {}

  /** 启动后立即恢复一次，并每五分钟补偿漏掉的任务。 */
  start(): void {
    if (this.timer) return;
    this.wake();
    this.timer = setInterval(() => this.wake(), 5 * 60_000);
  }

  /** 停止只是不再领取新任务，不改写数据库中的可恢复任务。 */
  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  /** 新素材和人工动作都调用此方法，避免等待下一轮五分钟扫描。 */
  wake(): void {
    if (this.wakeScheduled) return;
    this.wakeScheduled = true;
    queueMicrotask(() => {
      this.wakeScheduled = false;
      void this.runOnce().catch((error) => this.logger?.error(error, "creative automation run failed"));
    });
  }

  /** 新建长内容默认自动评估；短内容不进入本队列。 */
  enqueueAutomaticEvaluation(sourceItemId: number): EnqueueResult {
    const item = findCreativeSourceItemById(this.db, sourceItemId);
    if (!item || item.direction !== "article" || item.accountFitLevel || !isWithinAutomaticWindow(item.createdAt)) {
      return { accepted: false, reason: "not-eligible-for-automatic-evaluation" };
    }
    const result = this.insertActiveJob("evaluate", sourceItemId, "automatic");
    if (result.accepted) this.wake();
    return result;
  }

  /** 人工点击“评估”会走同一队列，但不会因此自动提交写作。 */
  enqueueManualEvaluation(sourceItemId: number): EnqueueResult {
    const result = this.insertActiveJob("evaluate", sourceItemId, "manual-evaluate");
    if (result.accepted) this.wake();
    return result;
  }

  /** 人工写作意图先经过账号适配门禁；高/中适配完成后自动续接手动写作任务。 */
  enqueueManualWrite(sourceItemId: number, thesis?: string, forceAccountFit = false): EnqueueResult {
    const item = findCreativeSourceItemById(this.db, sourceItemId);
    if (!item || item.direction !== "article") return { accepted: false, reason: "source-item-not-found" };
    if (item.accountFitLevel === "insufficient") return { accepted: false, reason: "account-fit-insufficient" };
    if (item.accountFitLevel === "low" && !forceAccountFit) return { accepted: false, reason: "account-fit-low-confirmation-required" };

    if (!item.accountFitLevel || item.accountFitLevel === "error") {
      const result = this.insertActiveJob("evaluate", sourceItemId, "manual-write", thesis, forceAccountFit);
      if (result.accepted) this.wake();
      return result;
    }

    const result = this.insertActiveJob("write", sourceItemId, "manual-write", thesis, forceAccountFit);
    if (result.accepted) {
      updateCreativeSourceItemWritingStatus(this.db, sourceItemId, "queued");
      this.wake();
    }
    return result;
  }

  /** 外部 Agent 只能创建待评估长素材，创建成功后立即补入自动评估队列。 */
  onSourceCreated(sourceItemId: number): void {
    this.enqueueAutomaticEvaluation(sourceItemId);
  }

  /** 供受控测试和运维排障主动执行一次；生产仍由 wake 与五分钟恢复调度调用。 */
  async runNow(): Promise<void> {
    await this.runOnce();
  }

  /** Hermes 回写的规则版本变化会撤销未开始自动写作，并仅重评最近 72 小时未完成长素材。 */
  recordAccountFitRuleVersion(ruleVersion: string, currentSourceItemId?: number): void {
    const previous = this.getSetting("account_fit_rule_version");
    this.db.prepare(`INSERT INTO creative_automation_settings(key, value, updated_at) VALUES ('account_fit_rule_version', ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`).run(ruleVersion);
    if (!previous || previous === ruleVersion) return;

    this.db.prepare(`UPDATE creative_automation_jobs SET status = 'cancelled', completed_at = CURRENT_TIMESTAMP, last_error = '账号适配规则已更新', updated_at = CURRENT_TIMESTAMP
      WHERE job_type = 'write' AND trigger_kind = 'automatic' AND status IN ('pending', 'retrying')`).run();
    this.db.prepare(`UPDATE creative_source_items
      SET account_fit_level = NULL, account_fit_reason = NULL, account_fit_details_json = NULL, account_fit_rule_version = NULL,
          account_fit_evaluated_at = NULL, writing_status = 'pending', updated_at = CURRENT_TIMESTAMP
      WHERE direction = 'article' AND linked_article_id IS NULL AND datetime(created_at) >= datetime('now', '-72 hours')
        AND writing_status IN ('pending', 'ready', 'queued')
        AND (? IS NULL OR id != ?)`).run(currentSourceItemId ?? null, currentSourceItemId ?? null);
    this.wake();
  }

  /** 提供素材页和监控页的最小运行状态，不把 Hermes 内部队列误当成本地真源。 */
  getStatus(): CreativeAutomationStatus {
    const setting = (key: string) => this.getSetting(key) === "true";
    const count = (where: string, ...params: unknown[]) => (this.db.prepare(`SELECT COUNT(*) AS count FROM creative_automation_jobs WHERE ${where}`).get(...params) as { count: number }).count;
    const { start, end } = shanghaiDayBounds();
    const latestErrors = this.db.prepare(`
      SELECT job_type, source_item_id, last_error, updated_at
      FROM creative_automation_jobs
      WHERE status IN ('failed', 'uncertain') AND last_error IS NOT NULL
      ORDER BY updated_at DESC LIMIT 5
    `).all() as Array<{ job_type: JobType; source_item_id: number; last_error: string; updated_at: string }>;
    return {
      autoEvaluateEnabled: setting("account_fit_auto_evaluate_enabled"),
      autoWriteEnabled: setting("account_fit_auto_write_enabled"),
      pendingEvaluationCount: count("job_type = 'evaluate' AND status IN ('pending', 'running', 'retrying')"),
      pendingWriteCount: count("job_type = 'write' AND status IN ('pending', 'running', 'retrying', 'dispatched')"),
      retryingJobCount: count("status = 'retrying'"),
      expiredAutomaticWriteCount: count("job_type = 'write' AND trigger_kind = 'automatic' AND status = 'expired'"),
      automaticWriteDispatchedToday: count("job_type = 'write' AND trigger_kind = 'automatic' AND dispatched_at >= ? AND dispatched_at < ?", start, end),
      latestErrors: latestErrors.map((row) => ({ jobType: row.job_type, sourceItemId: row.source_item_id, error: row.last_error, updatedAt: row.updated_at })),
    };
  }

  /** 两个运行期开关互不影响，关闭只暂停自动任务，既有任务仍保留。 */
  setEnabled(kind: "evaluate" | "write", enabled: boolean): void {
    const key = kind === "evaluate" ? "account_fit_auto_evaluate_enabled" : "account_fit_auto_write_enabled";
    this.db.prepare(`INSERT INTO creative_automation_settings(key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`).run(key, String(enabled));
    if (enabled) this.wake();
  }

  private async runOnce(): Promise<void> {
    this.recoverAndFillAutomaticEvaluation();
    this.recoverDispatchedWrites();
    this.expireOldAutomaticWrites();
    this.cleanupHistory();
    await Promise.all([this.runEvaluation(), this.runWrite()]);
    await this.alertWhenQueueStalled();
  }

  /** 只补 72 小时内、未评估且未产生成品的长素材；兼容接入前已写为 ready 的新素材。 */
  private recoverAndFillAutomaticEvaluation(): void {
    if (this.getSetting("account_fit_auto_evaluate_enabled") !== "true") return;
    const rows = this.db.prepare(`
      SELECT id FROM creative_source_items
      WHERE direction = 'article' AND linked_article_id IS NULL AND writing_status IN ('pending', 'ready') AND account_fit_level IS NULL
        AND datetime(created_at) >= datetime('now', '-72 hours')
      ORDER BY datetime(created_at) DESC
      LIMIT 100
    `).all() as Array<{ id: number }>;
    for (const row of rows) this.insertActiveJob("evaluate", row.id, "automatic");
  }

  /** 已成功投递给 Hermes 的任务只在明确终态失败且无成品时重试，未知响应绝不盲投。 */
  private recoverDispatchedWrites(): void {
    const jobs = this.db.prepare(`SELECT * FROM creative_automation_jobs WHERE job_type = 'write' AND status = 'dispatched'`).all() as AutomationJob[];
    for (const job of jobs) {
      const item = findCreativeSourceItemById(this.db, job.source_item_id);
      if (!item) {
        this.finish(job.id, "failed", "source-item-not-found");
      } else if (item.linkedArticleId != null || item.writingStatus === "done") {
        this.finish(job.id, "succeeded");
      } else if (item.writingStatus === "failed" && job.attempts < 3) {
        this.retry(job.id, job.attempts, "Hermes 写作任务已明确失败");
      } else if (item.writingStatus === "failed") {
        this.finish(job.id, "failed", "Hermes 写作任务已达到 3 次失败上限");
      }
    }
  }

  /** 高适配自动写作超过窗口未投递时回到人工待写，不丢弃已经得到的评估结论。 */
  private expireOldAutomaticWrites(): void {
    const jobs = this.db.prepare(`
      SELECT j.* FROM creative_automation_jobs j
      JOIN creative_source_items s ON s.id = j.source_item_id
      WHERE j.job_type = 'write' AND j.trigger_kind = 'automatic'
        AND j.status IN ('pending', 'retrying') AND datetime(s.created_at) < datetime('now', '-72 hours')
    `).all() as AutomationJob[];
    for (const job of jobs) {
      this.finish(job.id, "expired", "超过 72 小时未自动投递");
      updateCreativeSourceItemWritingStatus(this.db, job.source_item_id, "ready");
    }
  }

  private async runEvaluation(): Promise<void> {
    if (this.evaluationRunning) return;
    const job = this.claimNext("evaluate");
    if (!job) return;
    this.evaluationRunning = true;
    try {
      await this.executeEvaluation(job);
    } finally {
      this.evaluationRunning = false;
      this.wake();
    }
  }

  private async runWrite(): Promise<void> {
    if (this.writingRunning) return;
    const job = this.claimNext("write");
    if (!job) return;
    this.writingRunning = true;
    try {
      await this.executeWrite(job);
    } finally {
      this.writingRunning = false;
      this.wake();
    }
  }

  private claimNext(type: JobType): AutomationJob | null {
    const automaticEnabled = type === "evaluate" ? this.getSetting("account_fit_auto_evaluate_enabled") === "true" : this.getSetting("account_fit_auto_write_enabled") === "true";
    const row = this.db.prepare(`
      SELECT * FROM creative_automation_jobs
      WHERE job_type = ? AND status IN ('pending', 'retrying')
        AND (next_run_at IS NULL OR datetime(next_run_at) <= datetime('now'))
        AND (? OR trigger_kind != 'automatic')
      ORDER BY CASE trigger_kind WHEN 'manual-write' THEN 0 WHEN 'manual-evaluate' THEN 1 ELSE 2 END,
               datetime(created_at) ${type === "write" ? "DESC" : "ASC"}
      LIMIT 1
    `).get(type, automaticEnabled ? 1 : 0) as AutomationJob | undefined;
    if (!row) return null;
    const claimed = this.db.prepare(`UPDATE creative_automation_jobs SET status = 'running', attempts = attempts + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status IN ('pending', 'retrying')`).run(row.id);
    return claimed.changes > 0 ? { ...row, attempts: row.attempts + 1, status: "running" } : null;
  }

  private async executeEvaluation(job: AutomationJob): Promise<void> {
    const item = findCreativeSourceItemById(this.db, job.source_item_id);
    if (!item) return this.finish(job.id, "failed", "source-item-not-found");
    if (!this.hermes) return this.handleTechnicalFailure(job, "hermes-api-not-configured");
    try {
      const response = await fetch(`${this.hermes.baseUrl.replace(/\/+$/, "")}/api/evaluate-account-fit`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.hermes.token}` },
        body: JSON.stringify({ sourceItemId: job.source_item_id }),
        signal: AbortSignal.timeout(120_000),
      });
      if (!response.ok) return this.handleTechnicalFailure(job, `Hermes HTTP ${response.status}`);
      const data = await response.json() as { ok?: boolean; reason?: string; accountFit?: { level?: string; reason?: string } };
      if (!data.ok) return this.handleTechnicalFailure(job, data.reason ?? "Hermes 账号适配评估失败");
      if (data.accountFit?.level === "error") {
        return this.handleTechnicalFailure(job, data.accountFit.reason ?? "Hermes 账号适配评估返回技术错误");
      }
      const evaluated = findCreativeSourceItemById(this.db, job.source_item_id);
      if (!evaluated?.accountFitLevel) return this.handleTechnicalFailure(job, "Hermes 未回写账号适配结果");
      if (evaluated.accountFitLevel === "error") {
        return this.handleTechnicalFailure(job, evaluated.accountFitReason ?? "Hermes 账号适配评估回写技术错误");
      }
      this.finish(job.id, "succeeded");
      this.recordSuccess("evaluate");
      if (evaluated.accountFitLevel === "high") {
        updateCreativeSourceItemWritingStatus(this.db, evaluated.id, "queued");
        this.insertActiveJob("write", evaluated.id, job.trigger_kind === "manual-write" ? "manual-write" : "automatic", job.thesis ?? undefined, Boolean(job.force_account_fit));
      } else if (evaluated.accountFitLevel === "medium") {
        updateCreativeSourceItemWritingStatus(this.db, evaluated.id, "ready");
        if (job.trigger_kind === "manual-write") {
          this.insertActiveJob("write", evaluated.id, "manual-write", job.thesis ?? undefined, false);
          updateCreativeSourceItemWritingStatus(this.db, evaluated.id, "queued");
        }
      } else {
        updateCreativeSourceItemWritingStatus(this.db, evaluated.id, "excluded");
      }
    } catch (error) {
      this.handleTechnicalFailure(job, errorMessage(error));
    }
  }

  private async executeWrite(job: AutomationJob): Promise<void> {
    const item = findCreativeSourceItemById(this.db, job.source_item_id);
    if (!item) return this.finish(job.id, "failed", "source-item-not-found");
    if (job.trigger_kind === "automatic" && !isWithinAutomaticWindow(item.createdAt)) {
      this.finish(job.id, "expired", "超过 72 小时未自动投递");
      updateCreativeSourceItemWritingStatus(this.db, item.id, "ready");
      return;
    }
    if (job.trigger_kind === "automatic" && this.autoWriteQuotaReached()) {
      this.retry(job.id, job.attempts - 1, "当日自动写作 10 篇额度已用完", nextShanghaiDayStart());
      return;
    }
    if (!this.hermes) return this.handleTechnicalFailure(job, "hermes-api-not-configured");

    try {
      const body: Record<string, unknown> = { sourceItemId: job.source_item_id, automatic: job.trigger_kind === "automatic" };
      if (job.thesis) body.thesis = job.thesis;
      if (job.force_account_fit) body.forceAccountFit = true;
      const response = await fetch(`${this.hermes.baseUrl.replace(/\/+$/, "")}/api/write-article`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.hermes.token}` },
        body: JSON.stringify(body), signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) return this.handleTechnicalFailure(job, `Hermes HTTP ${response.status}`);
      const data = await response.json() as { success?: boolean; error?: string };
      if (!data.success) return this.handleTechnicalFailure(job, data.error ?? "Hermes 写作提交失败");
      this.db.prepare(`UPDATE creative_automation_jobs SET status = 'dispatched', dispatched_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(job.id);
      // Hermes 已接受不等于真正开始执行；保持 queued，等 Hermes worker 开始时再回写 writing。
      updateCreativeSourceItemWritingStatus(this.db, item.id, "queued");
      this.recordSuccess("write");
    } catch (error) {
      // 请求超时后无法判断 Hermes 是否已经接受任务，必须终态标为不确定，不能自动重投。
      const message = errorMessage(error);
      if (message.includes("timeout") || message.includes("aborted")) {
        this.finish(job.id, "uncertain", `Hermes 响应不确定：${message}`);
        return;
      }
      this.handleTechnicalFailure(job, message);
    }
  }

  private handleTechnicalFailure(job: AutomationJob, reason: string): void {
    if (job.attempts >= 3) {
      this.finish(job.id, "failed", reason);
      this.recordFailure(job.job_type, reason);
      return;
    }
    this.retry(job.id, job.attempts, reason);
    this.recordFailure(job.job_type, reason);
  }

  private retry(id: number, attempts: number, reason: string, nextRunAt = retryAt(attempts)): void {
    this.db.prepare(`UPDATE creative_automation_jobs SET status = 'retrying', next_run_at = ?, last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(nextRunAt, reason, id);
  }

  private finish(id: number, status: Extract<JobStatus, "succeeded" | "failed" | "uncertain" | "cancelled" | "expired">, error?: string): void {
    this.db.prepare(`UPDATE creative_automation_jobs SET status = ?, last_error = ?, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(status, error ?? null, id);
  }

  private insertActiveJob(type: JobType, sourceItemId: number, trigger: TriggerKind, thesis?: string, forceAccountFit = false): EnqueueResult {
    try {
      const result = this.db.prepare(`INSERT INTO creative_automation_jobs(job_type, source_item_id, trigger_kind, status, thesis, force_account_fit)
        VALUES (?, ?, ?, 'pending', ?, ?)`)
        .run(type, sourceItemId, trigger, thesis ?? null, forceAccountFit ? 1 : 0);
      return { accepted: true, jobId: Number(result.lastInsertRowid) };
    } catch (error) {
      if (String(error).includes("UNIQUE constraint failed")) return { accepted: false, reason: "job-already-active" };
      throw error;
    }
  }

  private autoWriteQuotaReached(): boolean {
    const { start, end } = shanghaiDayBounds();
    const row = this.db.prepare(`SELECT COUNT(*) AS count FROM creative_automation_jobs
      WHERE job_type = 'write' AND trigger_kind = 'automatic' AND dispatched_at >= ? AND dispatched_at < ?`).get(start, end) as { count: number };
    return row.count >= 10;
  }

  private getSetting(key: string): string | null {
    return (this.db.prepare("SELECT value FROM creative_automation_settings WHERE key = ?").get(key) as { value: string } | undefined)?.value ?? null;
  }

  private cleanupHistory(): void {
    this.db.prepare(`DELETE FROM creative_automation_jobs WHERE completed_at IS NOT NULL AND datetime(completed_at) < datetime('now', '-30 days')`).run();
  }

  /** 只有已对外告警的故障才发送恢复，避免零散失败与成功交替时通知抖动。 */
  private recordSuccess(kind: JobType): void {
    const row = this.db.prepare(`SELECT consecutive_failures,
        CASE WHEN last_alert_at IS NOT NULL
          AND (last_success_at IS NULL OR datetime(last_alert_at) > datetime(last_success_at))
          THEN 1 ELSE 0 END AS alert_open
      FROM creative_automation_alert_state WHERE failure_kind = ?`).get(kind) as { consecutive_failures: number; alert_open: number } | undefined;
    if (row?.alert_open && this.config) void this.sendAlert(kind, `${kind === "evaluate" ? "账号适配评估" : "自动写作"}已恢复`, "连续技术失败已恢复。", { recovery: true });
    this.db.prepare(`INSERT INTO creative_automation_alert_state(failure_kind, consecutive_failures, last_success_at, updated_at)
      VALUES (?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(failure_kind) DO UPDATE SET consecutive_failures = 0, last_success_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP`).run(kind);
  }

  /** 冷却判断统一交给 SQLite 按 UTC 比较，不解析无时区的时间文本。 */
  private recordFailure(kind: JobType, reason: string): void {
    const row = this.db.prepare(`SELECT consecutive_failures,
        CASE WHEN last_alert_at IS NULL OR datetime(last_alert_at) <= datetime('now', '-30 minutes')
          THEN 1 ELSE 0 END AS cooldown_elapsed
      FROM creative_automation_alert_state WHERE failure_kind = ?`).get(kind) as { consecutive_failures: number; cooldown_elapsed: number } | undefined;
    const failures = (row?.consecutive_failures ?? 0) + 1;
    this.db.prepare(`INSERT INTO creative_automation_alert_state(failure_kind, consecutive_failures, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(failure_kind) DO UPDATE SET consecutive_failures = excluded.consecutive_failures, updated_at = CURRENT_TIMESTAMP`).run(kind, failures);
    if (failures >= 3 && (row?.cooldown_elapsed ?? 1)) {
      this.db.prepare("UPDATE creative_automation_alert_state SET last_alert_at = CURRENT_TIMESTAMP WHERE failure_kind = ?").run(kind);
      void this.sendAlert(kind, `${kind === "evaluate" ? "账号适配评估" : "自动写作"}连续失败`, `已连续 ${failures} 次技术失败：${reason}`, { context: this.snapshotFailedJobs() });
    }
  }

  /** 从首次观测到无成功开始计时，队列失败清空不等于处理恢复。 */
  private async alertWhenQueueStalled(): Promise<void> {
    // 等次日写作额度的任务会把 next_run_at 推到明天，属正常顺延而非停摆；
    // 技术退避最长 30 分钟，超过 30 分钟的重试只可能是额度顺延，不计入停摆证据。
    const queued = (this.db.prepare(`SELECT COUNT(*) AS count FROM creative_automation_jobs
      WHERE status IN ('pending', 'retrying')
        AND (next_run_at IS NULL OR datetime(next_run_at) <= datetime('now', '+30 minutes'))`).get() as { count: number }).count;
    const recent = (this.db.prepare(`SELECT COUNT(*) AS count FROM creative_automation_jobs WHERE status IN ('dispatched', 'succeeded') AND datetime(updated_at) >= datetime('now', '-15 minutes')`).get() as { count: number }).count;
    const state = this.db.prepare(`SELECT consecutive_failures,
        CASE WHEN last_alert_at IS NOT NULL
          AND (last_success_at IS NULL OR datetime(last_alert_at) > datetime(last_success_at))
          THEN 1 ELSE 0 END AS alert_open,
        CASE WHEN last_alert_at IS NULL OR datetime(last_alert_at) <= datetime('now', '-30 minutes')
          THEN 1 ELSE 0 END AS cooldown_elapsed,
        CASE WHEN datetime(updated_at) <= datetime('now', '-15 minutes') THEN 1 ELSE 0 END AS stalled_long_enough
      FROM creative_automation_alert_state WHERE failure_kind = 'queue-stall'`).get() as {
        consecutive_failures: number;
        alert_open: number;
        cooldown_elapsed: number;
        stalled_long_enough: number;
      } | undefined;
    if (recent > 0) {
      if (state?.alert_open && this.config) await this.sendAlert("queue-stall", "账号适配自动队列已恢复", "队列已重新出现成功处理。", { recovery: true });
      this.db.prepare(`INSERT INTO creative_automation_alert_state(failure_kind, consecutive_failures, last_success_at, updated_at)
        VALUES ('queue-stall', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(failure_kind) DO UPDATE SET consecutive_failures = 0, last_success_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP`).run();
      return;
    }
    if (queued === 0) {
      this.db.prepare(`INSERT INTO creative_automation_alert_state(failure_kind, consecutive_failures, updated_at)
        VALUES ('queue-stall', 0, CURRENT_TIMESTAMP)
        ON CONFLICT(failure_kind) DO UPDATE SET consecutive_failures = 0, updated_at = CURRENT_TIMESTAMP`).run();
      return;
    }
    if (!state || state.consecutive_failures === 0) {
      this.db.prepare(`INSERT INTO creative_automation_alert_state(failure_kind, consecutive_failures, updated_at)
        VALUES ('queue-stall', 1, CURRENT_TIMESTAMP)
        ON CONFLICT(failure_kind) DO UPDATE SET consecutive_failures = 1, updated_at = CURRENT_TIMESTAMP`).run();
      return;
    }
    const failures = (state?.consecutive_failures ?? 0) + 1;
    this.db.prepare("UPDATE creative_automation_alert_state SET consecutive_failures = ? WHERE failure_kind = 'queue-stall'").run(failures);
    if (state.stalled_long_enough && state.cooldown_elapsed) {
      this.db.prepare("UPDATE creative_automation_alert_state SET last_alert_at = CURRENT_TIMESTAMP WHERE failure_kind = 'queue-stall'").run();
      await this.sendAlert("queue-stall", "账号适配自动队列 15 分钟无成功", `当前仍有 ${queued} 个待处理任务，请检查 Hermes 与队列错误。`, { context: this.snapshotFailedJobs() });
    }
  }

  /**
   * 每次告警先落库拿到唯一 ID 再发信；邮件主题与正文首行都携带 [HN-ID]，
   * 正文分字段（ID/类型/详情/现场/排查），凭 ID 查 creative_automation_alerts
   * 可还原告警时刻的失败任务快照。落库失败不阻断发信。
   */
  private async sendAlert(failureKind: AlertKind, subject: string, detail: string, options: { recovery?: boolean; context?: unknown } = {}): Promise<void> {
    let alertId = 0;
    let referencedFailure = "";
    let snapshotLines = "";
    try {
      const result = this.db.prepare(`INSERT INTO creative_automation_alerts(failure_kind, subject, detail, context_json, is_recovery)
        VALUES (?, ?, ?, ?, ?)`).run(failureKind, subject, detail, options.context ? JSON.stringify(options.context) : null, options.recovery ? 1 : 0);
      alertId = Number(result.lastInsertRowid);
      // 恢复类告警在正文引用其对应的最近一次故障告警，形成排查闭环
      if (options.recovery) {
        const failure = this.db.prepare(`SELECT id FROM creative_automation_alerts WHERE failure_kind = ? AND is_recovery = 0 ORDER BY id DESC LIMIT 1`).get(failureKind) as { id: number } | undefined;
        if (failure) referencedFailure = `<p><b>关联故障告警</b>：HN-${failure.id}</p>`;
      }
      // 现场快照摘要在正文直接展示前 3 条失败任务的原因，不用查库就能初判
      const jobs = Array.isArray(options.context) ? options.context as Array<{ job_type?: string; source_item_id?: number; last_error?: string }> : [];
      snapshotLines = jobs.slice(0, 3).map((job) => `<li>${escapeHtml(String(job.job_type ?? ""))} #${escapeHtml(String(job.source_item_id ?? ""))}：${escapeHtml(String(job.last_error ?? ""))}</li>`).join("");
      if (snapshotLines) snapshotLines = `<p><b>现场快照</b>（当时失败/重试任务）：</p><ul>${snapshotLines}</ul>`;
    } catch (error) {
      this.logger?.error(error, "creative automation alert log failed");
    }
    if (!this.config) return;
    try {
      const kindLabel = failureKind === "evaluate" ? "账号适配评估" : failureKind === "write" ? "自动写作" : "自动队列";
      await sendEmailMessage(this.config, {
        from: this.config.smtp.user,
        to: this.config.smtp.to,
        subject: `HotNow 告警：${subject}${alertId ? ` [HN-${alertId}]` : ""}`,
        html: `<p><b>告警ID</b>：${alertId ? `HN-${alertId}` : "未落库"}</p>`
          + `<p><b>类型</b>：${kindLabel}${options.recovery ? "（恢复）" : ""}</p>`
          + `<p><b>详情</b>：${escapeHtml(detail)}</p>`
          + referencedFailure
          + snapshotLines
          + (alertId ? `<p><b>排查</b>：sqlite3 /srv/hot-now/shared/data/hot-now.sqlite "SELECT * FROM creative_automation_alerts WHERE id = ${alertId}"</p>` : "")
          + `<p>请在 HotNow 素材库或监控页检查任务状态。</p>`,
      });
    } catch (error) {
      this.logger?.error(error, "creative automation alert email failed");
    }
  }

  /** 告警现场快照：记录发出时刻仍在失败/重试的任务及原因，随告警落库。 */
  private snapshotFailedJobs(): Array<Record<string, unknown>> {
    return this.db.prepare(`SELECT job_type, source_item_id, trigger_kind, status, attempts, last_error, next_run_at, updated_at
      FROM creative_automation_jobs
      WHERE status IN ('retrying', 'failed', 'uncertain')
      ORDER BY updated_at DESC LIMIT 10`).all() as Array<Record<string, unknown>>;
  }
}

function retryAt(attempts: number): string {
  const delayMinutes = Math.min(30, 2 ** Math.max(0, attempts - 1));
  return new Date(Date.now() + delayMinutes * 60_000).toISOString();
}

function isWithinAutomaticWindow(createdAt: string): boolean {
  const timestamp = Date.parse(createdAt.replace(" ", "T") + (createdAt.includes("Z") || createdAt.includes("+") ? "" : "Z"));
  return Number.isFinite(timestamp) && timestamp >= Date.now() - 72 * 60 * 60_000;
}

function shanghaiDayBounds(now = new Date()): { start: string; end: string } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const value = (kind: string) => Number(parts.find((part) => part.type === kind)?.value);
  const start = new Date(Date.UTC(value("year"), value("month") - 1, value("day"), -8));
  const end = new Date(start.getTime() + 24 * 60 * 60_000);
  return { start: start.toISOString(), end: end.toISOString() };
}

function nextShanghaiDayStart(): string {
  return shanghaiDayBounds(new Date(Date.now() + 24 * 60 * 60_000)).start;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
