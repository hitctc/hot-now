import { afterEach, describe, expect, it, vi } from "vitest";

import { CreativeAutomationService } from "../../src/core/creative/creativeAutomationService.js";
import {
  findCreativeSourceItemById,
  insertCreativeSourceItem,
  updateCreativeSourceItemAccountFit,
} from "../../src/core/creative/creativeSourceItemRepository.js";
import { createTestDatabase, type TestDatabaseHandle } from "../helpers/testDatabase.js";

// vi.mock 工厂被提升到模块顶部执行，共享数组必须用 vi.hoisted 创建
const sentEmails = vi.hoisted(() => [] as Array<{ subject: string; html: string }>);
vi.mock("../../src/core/mail/sendEmailMessage.js", () => ({
  sendEmailMessage: vi.fn(async (_config, message) => {
    sentEmails.push({ subject: message.subject, html: message.html });
  }),
}));

const handles: TestDatabaseHandle[] = [];
afterEach(() => {
  vi.unstubAllGlobals();
  while (handles.length) handles.pop()?.close();
});

describe("CreativeAutomationService", () => {
  it("关闭总开关会取消未开始自动任务、清零告警状态，但保留人工任务", async () => {
    const handle = await createTestDatabase("hot-now-automation-master-stop-");
    handles.push(handle);
    const evaluateItem = insertCreativeSourceItem(handle.db, {
      externalId: "master-stop-evaluate", collectorAgent: "test", title: "总开关评估", url: "https://example.com/master-stop-evaluate",
    });
    const writeItem = insertCreativeSourceItem(handle.db, {
      externalId: "master-stop-write", collectorAgent: "test", title: "总开关写作", url: "https://example.com/master-stop-write",
    });
    handle.db.prepare(`INSERT INTO creative_automation_jobs(job_type, source_item_id, trigger_kind, status)
      VALUES ('evaluate', ?, 'automatic', 'pending'), ('write', ?, 'automatic', 'retrying')`).run(evaluateItem.id, writeItem.id);
    handle.db.prepare(`INSERT INTO creative_automation_alert_state(failure_kind, consecutive_failures, last_alert_at)
      VALUES ('evaluate', 1805, CURRENT_TIMESTAMP), ('write', 4, CURRENT_TIMESTAMP), ('queue-stall', 12, CURRENT_TIMESTAMP)`).run();
    handle.db.prepare(`INSERT INTO creative_automation_alerts(failure_kind, subject, detail)
      VALUES ('evaluate', '历史告警', '保留历史')`).run();
    const service = new CreativeAutomationService(handle.db, null, { baseUrl: "https://hermes.test", token: "token" });

    service.setMasterEnabled(false);

    expect(service.getStatus().automationEnabled).toBe(false);
    expect(handle.db.prepare("SELECT status, last_error FROM creative_automation_jobs ORDER BY id").all()).toEqual([
      { status: "cancelled", last_error: "创作自动化总开关已关闭" },
      { status: "cancelled", last_error: "创作自动化总开关已关闭" },
    ]);
    expect(handle.db.prepare("SELECT failure_kind, consecutive_failures, last_alert_at FROM creative_automation_alert_state ORDER BY failure_kind").all()).toEqual([
      { failure_kind: "evaluate", consecutive_failures: 0, last_alert_at: null },
      { failure_kind: "queue-stall", consecutive_failures: 0, last_alert_at: null },
      { failure_kind: "write", consecutive_failures: 0, last_alert_at: null },
    ]);
    expect(handle.db.prepare("SELECT COUNT(*) AS count FROM creative_automation_alerts").get()).toEqual({ count: 1 });

    vi.stubGlobal("fetch", vi.fn(async () => {
      updateCreativeSourceItemAccountFit(handle.db, evaluateItem.id, {
        level: "medium", reason: "人工评估完成", details: {}, ruleVersion: "v3", updateWritingStatus: false,
      });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }));
    expect(service.enqueueManualEvaluation(evaluateItem.id).accepted).toBe(true);
    await service.runNow();
    expect(handle.db.prepare("SELECT status FROM creative_automation_jobs WHERE trigger_kind = 'manual-evaluate'").get()).toEqual({ status: "succeeded" });
  });

  it("总开关关闭期间，已开始的自动评估只自然收口，不派生写作或发送告警", async () => {
    const handle = await createTestDatabase("hot-now-automation-master-inflight-");
    handles.push(handle);
    const item = insertCreativeSourceItem(handle.db, {
      externalId: "master-inflight", collectorAgent: "test", title: "进行中的评估", url: "https://example.com/master-inflight",
    });
    let resolveFetch!: (response: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { resolveFetch = resolve; }));
    vi.stubGlobal("fetch", fetchMock);
    const service = new CreativeAutomationService(handle.db, null, { baseUrl: "https://hermes.test", token: "token" });
    const runPromise = service.enqueueAutomaticEvaluation(item.id);
    expect(runPromise.accepted).toBe(true);
    const execution = service.runNow();
    await new Promise((resolve) => setImmediate(resolve));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const emailsBeforeStop = sentEmails.length;
    service.setMasterEnabled(false);
    resolveFetch(new Response(JSON.stringify({ ok: true, accountFit: { level: "high" } }), { status: 200 }));
    await execution;

    expect(handle.db.prepare("SELECT status, last_error FROM creative_automation_jobs WHERE source_item_id = ? ORDER BY id DESC LIMIT 1").get(item.id)).toEqual({
      status: "cancelled", last_error: "创作自动化总开关已关闭",
    });
    expect(handle.db.prepare("SELECT COUNT(*) AS count FROM creative_automation_jobs WHERE source_item_id = ? AND job_type = 'write'").get(item.id)).toEqual({ count: 0 });
    expect(sentEmails).toHaveLength(emailsBeforeStop);
  });

  it("新长素材先待评估，高适配后再投递自动写作", async () => {
    const handle = await createTestDatabase("hot-now-automation-");
    handles.push(handle);
    const item = insertCreativeSourceItem(handle.db, {
      externalId: "automatic-high", collectorAgent: "test", title: "影响普通用户的更新", url: "https://example.com/high",
    });
    expect(findCreativeSourceItemById(handle.db, item.id)?.writingStatus).toBe("pending");

    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/api/evaluate-account-fit")) {
        updateCreativeSourceItemAccountFit(handle.db, item.id, {
          level: "high", reason: "有明确读者影响", details: {}, ruleVersion: "v3", updateWritingStatus: false,
        });
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response(JSON.stringify({ success: true, task_id: "normal-1" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const service = new CreativeAutomationService(handle.db, null, { baseUrl: "https://hermes.test", token: "token" });

    expect(service.enqueueAutomaticEvaluation(item.id).accepted).toBe(true);
    await service.runNow();
    expect(findCreativeSourceItemById(handle.db, item.id)?.writingStatus).toBe("queued");
    await service.runNow();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(findCreativeSourceItemById(handle.db, item.id)?.writingStatus).toBe("queued");
    expect(service.getStatus().automaticWriteDispatchedToday).toBe(1);
  });

  it("人工写作意图会在评估完成后续接，中适配不消耗自动额度", async () => {
    const handle = await createTestDatabase("hot-now-automation-");
    handles.push(handle);
    const item = insertCreativeSourceItem(handle.db, {
      externalId: "manual-medium", collectorAgent: "test", title: "中适配素材", url: "https://example.com/medium",
    });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.endsWith("/api/evaluate-account-fit")) {
        updateCreativeSourceItemAccountFit(handle.db, item.id, {
          level: "medium", reason: "需要人工判断", details: {}, ruleVersion: "v3", updateWritingStatus: false,
        });
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }));
    const service = new CreativeAutomationService(handle.db, null, { baseUrl: "https://hermes.test", token: "token" });

    expect(service.enqueueManualWrite(item.id, "保留立意").accepted).toBe(true);
    await service.runNow();
    await service.runNow();

    expect(findCreativeSourceItemById(handle.db, item.id)?.writingStatus).toBe("queued");
    expect(service.getStatus().automaticWriteDispatchedToday).toBe(0);
  });

  it("写作技术失败到达上限后收口素材状态，并允许再次人工入队", async () => {
    const handle = await createTestDatabase("hot-now-automation-write-failed-");
    handles.push(handle);
    const item = insertCreativeSourceItem(handle.db, {
      externalId: "manual-write-failed", collectorAgent: "test", title: "反代失败素材", url: "https://example.com/manual-write-failed",
    });
    updateCreativeSourceItemAccountFit(handle.db, item.id, {
      level: "high", reason: "适配", details: {}, ruleVersion: "v3", updateWritingStatus: false,
    });
    handle.db.prepare("UPDATE creative_source_items SET writing_status = 'queued' WHERE id = ?").run(item.id);
    handle.db.prepare(`INSERT INTO creative_automation_jobs(job_type, source_item_id, trigger_kind, status, attempts)
      VALUES ('write', ?, 'manual-write', 'pending', 2)`).run(item.id);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("upstream unavailable", { status: 502 })));
    const service = new CreativeAutomationService(handle.db, null, { baseUrl: "https://hermes.test", token: "token" });

    await service.runNow();

    expect(handle.db.prepare("SELECT status, last_error FROM creative_automation_jobs WHERE source_item_id = ?").get(item.id)).toEqual({
      status: "failed", last_error: "Hermes HTTP 502",
    });
    expect(findCreativeSourceItemById(handle.db, item.id)?.writingStatus).toBe("failed");
    expect(service.enqueueManualWrite(item.id).accepted).toBe(true);
  });

  it("创作自动化关闭时仍允许人工写作投递", async () => {
    const handle = await createTestDatabase("hot-now-automation-manual-write-");
    handles.push(handle);
    const item = insertCreativeSourceItem(handle.db, {
      externalId: "manual-write-while-auto-off", collectorAgent: "test", title: "自动化关闭时的人工写作", url: "https://example.com/manual-write-while-auto-off",
    });
    updateCreativeSourceItemAccountFit(handle.db, item.id, {
      level: "high", reason: "适配", details: {}, ruleVersion: "v3", updateWritingStatus: false,
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 })));
    const service = new CreativeAutomationService(handle.db, null, { baseUrl: "https://hermes.test", token: "token" });

    service.setMasterEnabled(false);
    expect(service.enqueueManualWrite(item.id).accepted).toBe(true);
    await service.runNow();

    expect(handle.db.prepare("SELECT status FROM creative_automation_jobs WHERE source_item_id = ?").get(item.id)).toEqual({ status: "dispatched" });
    expect(findCreativeSourceItemById(handle.db, item.id)?.writingStatus).toBe("queued");
  });

  it("恢复扫描会收口历史失败但仍显示排队中的写作素材", async () => {
    const handle = await createTestDatabase("hot-now-automation-write-reconcile-");
    handles.push(handle);
    const item = insertCreativeSourceItem(handle.db, {
      externalId: "stale-queued-write", collectorAgent: "test", title: "历史失败素材", url: "https://example.com/stale-queued-write",
    });
    updateCreativeSourceItemAccountFit(handle.db, item.id, {
      level: "high", reason: "适配", details: {}, ruleVersion: "v3", updateWritingStatus: false,
    });
    handle.db.prepare("UPDATE creative_source_items SET writing_status = 'queued' WHERE id = ?").run(item.id);
    handle.db.prepare(`INSERT INTO creative_automation_jobs(job_type, source_item_id, trigger_kind, status, attempts, last_error)
      VALUES ('write', ?, 'manual-write', 'failed', 3, 'Hermes HTTP 502')`).run(item.id);
    const service = new CreativeAutomationService(handle.db, null, null);

    await service.runNow();

    expect(findCreativeSourceItemById(handle.db, item.id)?.writingStatus).toBe("failed");
    expect(service.enqueueManualWrite(item.id).accepted).toBe(true);
  });

  it("自动评估只扫描最近 72 小时，历史待评估素材保持不动", async () => {
    const handle = await createTestDatabase("hot-now-automation-");
    handles.push(handle);
    const old = insertCreativeSourceItem(handle.db, {
      externalId: "old-pending", collectorAgent: "test", title: "历史素材", url: "https://example.com/old",
    });
    handle.db.prepare("UPDATE creative_source_items SET created_at = datetime('now', '-73 hours') WHERE id = ?").run(old.id);
    const service = new CreativeAutomationService(handle.db, null, null);

    await service.runNow();
    const jobs = handle.db.prepare("SELECT COUNT(*) AS count FROM creative_automation_jobs WHERE source_item_id = ?").get(old.id) as { count: number };
    expect(jobs.count).toBe(0);
    expect(findCreativeSourceItemById(handle.db, old.id)?.writingStatus).toBe("pending");
  });

  it("补偿扫描会接管窗口内已 ready 的未评估素材，但跳过已有成品的素材", async () => {
    const handle = await createTestDatabase("hot-now-automation-");
    handles.push(handle);
    const ready = insertCreativeSourceItem(handle.db, {
      externalId: "recent-ready", collectorAgent: "test", title: "接入前已就绪的新素材", url: "https://example.com/ready",
    });
    const linked = insertCreativeSourceItem(handle.db, {
      externalId: "recent-linked", collectorAgent: "test", title: "已有成品的素材", url: "https://example.com/linked",
    });
    const article = handle.db.prepare("INSERT INTO creative_finished_articles (source_item_id, content_markdown) VALUES (?, ?)").run(linked.id, "content");
    handle.db.prepare("UPDATE creative_source_items SET writing_status = 'ready', linked_article_id = ? WHERE id = ?").run(article.lastInsertRowid, linked.id);
    handle.db.prepare("UPDATE creative_source_items SET writing_status = 'ready' WHERE id = ?").run(ready.id);
    const service = new CreativeAutomationService(handle.db, null, null);

    await service.runNow();

    const jobs = handle.db.prepare("SELECT source_item_id FROM creative_automation_jobs WHERE job_type = 'evaluate' ORDER BY source_item_id").all() as Array<{ source_item_id: number }>;
    expect(jobs).toEqual([{ source_item_id: ready.id }]);
  });

  it("上海时区下仍遵守 30 分钟失败告警冷却", async () => {
    const handle = await createTestDatabase("hot-now-alert-cooldown-");
    handles.push(handle);
    const service = new CreativeAutomationService(handle.db, {} as never, null) as any;
    const alerts: string[] = [];
    service.sendAlert = async (_kind: string, subject: string) => alerts.push(subject);
    handle.db.prepare(`INSERT INTO creative_automation_alert_state(failure_kind, consecutive_failures, last_alert_at)
      VALUES ('evaluate', 3, CURRENT_TIMESTAMP)`).run();

    service.recordFailure("evaluate", "补充搜索限额耗尽");
    await new Promise((resolve) => setImmediate(resolve));
    expect(alerts).toEqual([]);

    handle.db.prepare("UPDATE creative_automation_alert_state SET last_alert_at = datetime('now', '-31 minutes') WHERE failure_kind = 'evaluate'").run();
    service.recordFailure("evaluate", "补充搜索限额耗尽");
    await new Promise((resolve) => setImmediate(resolve));
    expect(alerts).toEqual(["账号适配评估连续失败"]);
  });

  it("只有已发出故障告警后的真实成功才发送一次恢复", async () => {
    const handle = await createTestDatabase("hot-now-alert-recovery-");
    handles.push(handle);
    const service = new CreativeAutomationService(handle.db, {} as never, null) as any;
    const alerts: string[] = [];
    service.sendAlert = async (_kind: string, subject: string) => alerts.push(subject);
    handle.db.prepare(`INSERT INTO creative_automation_alert_state(failure_kind, consecutive_failures)
      VALUES ('evaluate', 2)`).run();

    service.recordSuccess("evaluate");
    await new Promise((resolve) => setImmediate(resolve));
    expect(alerts).toEqual([]);

    handle.db.prepare(`UPDATE creative_automation_alert_state
      SET consecutive_failures = 3, last_alert_at = CURRENT_TIMESTAMP, last_success_at = NULL
      WHERE failure_kind = 'evaluate'`).run();
    service.recordSuccess("evaluate");
    service.recordSuccess("evaluate");
    await new Promise((resolve) => setImmediate(resolve));
    expect(alerts).toEqual(["账号适配评估已恢复"]);
  });

  it("队列持续停滞满 15 分钟才告警，全失败清空不误报恢复", async () => {
    const handle = await createTestDatabase("hot-now-queue-stall-");
    handles.push(handle);
    const item = insertCreativeSourceItem(handle.db, {
      externalId: "queue-stall", collectorAgent: "test", title: "队列停滞", url: "https://example.com/queue-stall",
    });
    handle.db.prepare(`INSERT INTO creative_automation_jobs(job_type, source_item_id, trigger_kind, status)
      VALUES ('evaluate', ?, 'automatic', 'pending')`).run(item.id);
    const service = new CreativeAutomationService(handle.db, {} as never, null) as any;
    const alerts: string[] = [];
    service.sendAlert = async (_kind: string, subject: string) => alerts.push(subject);

    await service.alertWhenQueueStalled();
    expect(alerts).toEqual([]);

    handle.db.prepare("UPDATE creative_automation_alert_state SET updated_at = datetime('now', '-16 minutes') WHERE failure_kind = 'queue-stall'").run();
    await service.alertWhenQueueStalled();
    expect(alerts).toEqual(["账号适配自动队列 15 分钟无成功"]);

    handle.db.prepare("UPDATE creative_automation_jobs SET status = 'failed', completed_at = CURRENT_TIMESTAMP WHERE source_item_id = ?").run(item.id);
    await service.alertWhenQueueStalled();
    expect(alerts).toHaveLength(1);

    handle.db.prepare(`INSERT INTO creative_automation_jobs(job_type, source_item_id, trigger_kind, status, completed_at)
      VALUES ('evaluate', ?, 'automatic', 'succeeded', CURRENT_TIMESTAMP)`).run(item.id);
    await service.alertWhenQueueStalled();
    await service.alertWhenQueueStalled();
    expect(alerts).toEqual([
      "账号适配自动队列 15 分钟无成功",
      "账号适配自动队列已恢复",
    ]);
  });

  it("等次日写作额度的远期重试任务不算队列停摆", async () => {
    const handle = await createTestDatabase("hot-now-queue-stall-quota-");
    handles.push(handle);
    const item = insertCreativeSourceItem(handle.db, {
      externalId: "quota-deferred", collectorAgent: "test", title: "额度顺延", url: "https://example.com/quota-deferred",
    });
    // 额度顺延：next_run_at 推到次日（技术退避最长 30 分钟，不可能到明天）
    handle.db.prepare(`INSERT INTO creative_automation_jobs(job_type, source_item_id, trigger_kind, status, next_run_at, last_error)
      VALUES ('write', ?, 'automatic', 'retrying', datetime('now', '+8 hours'), '当日自动写作 10 篇额度已用完')`).run(item.id);
    const service = new CreativeAutomationService(handle.db, {} as never, null) as any;
    const alerts: string[] = [];
    service.sendAlert = async (_kind: string, subject: string) => alerts.push(subject);

    // 队列里只剩远期顺延任务：先进入观察，观察期满也不应告警
    await service.alertWhenQueueStalled();
    expect(alerts).toEqual([]);
    handle.db.prepare("UPDATE creative_automation_alert_state SET updated_at = datetime('now', '-16 minutes') WHERE failure_kind = 'queue-stall'").run();
    await service.alertWhenQueueStalled();
    await service.alertWhenQueueStalled();
    expect(alerts).toEqual([]);

    // 出现一个 30 分钟内的技术退避任务时恢复停摆监测
    handle.db.prepare(`INSERT INTO creative_automation_jobs(job_type, source_item_id, trigger_kind, status, next_run_at)
      VALUES ('evaluate', ?, 'automatic', 'retrying', datetime('now', '+2 minutes'))`).run(item.id);
    await service.alertWhenQueueStalled();
    expect(alerts).toEqual([]);
    handle.db.prepare("UPDATE creative_automation_alert_state SET updated_at = datetime('now', '-16 minutes') WHERE failure_kind = 'queue-stall'").run();
    await service.alertWhenQueueStalled();
    expect(alerts).toEqual(["账号适配自动队列 15 分钟无成功"]);
  });

  it("告警先落库再发信：主题带 HN-ID、快照入库、恢复引用故障 ID", async () => {
    const handle = await createTestDatabase("hot-now-alert-id-");
    handles.push(handle);
    sentEmails.length = 0;
    const item = insertCreativeSourceItem(handle.db, {
      externalId: "alert-id", collectorAgent: "test", title: "告警编号", url: "https://example.com/alert-id",
    });
    handle.db.prepare(`INSERT INTO creative_automation_jobs(job_type, source_item_id, trigger_kind, status, attempts, last_error)
      VALUES ('evaluate', ?, 'automatic', 'retrying', 2, 'LLM调用失败: 测试失败原因')`).run(item.id);
    const service = new CreativeAutomationService(handle.db, { smtp: { user: "from@test", to: "to@test" } } as never, null) as any;

    // 连续失败告警：落库、主题尾部带 [HN-1]、现场快照包含失败任务原因
    handle.db.prepare(`INSERT INTO creative_automation_alert_state(failure_kind, consecutive_failures, last_alert_at)
      VALUES ('evaluate', 3, datetime('now', '-31 minutes'))`).run();
    service.recordFailure("evaluate", "测试失败原因");
    await new Promise((resolve) => setImmediate(resolve));

    const logged = handle.db.prepare("SELECT id, failure_kind, subject, detail, context_json, is_recovery FROM creative_automation_alerts ORDER BY id").all() as Array<{ id: number; failure_kind: string; subject: string; detail: string; context_json: string | null; is_recovery: number }>;
    expect(logged).toHaveLength(1);
    expect(logged[0].failure_kind).toBe("evaluate");
    expect(logged[0].is_recovery).toBe(0);
    expect(JSON.parse(logged[0].context_json ?? "[]")).toEqual(
      expect.arrayContaining([expect.objectContaining({ last_error: "LLM调用失败: 测试失败原因" })]),
    );
    expect(sentEmails[0].subject).toBe("HotNow 告警：账号适配评估连续失败 [HN-1]");
    expect(sentEmails[0].html).toContain("<b>告警ID</b>：HN-1");
    expect(sentEmails[0].html).toContain("LLM调用失败: 测试失败原因");

    // 恢复告警：另行落库标记 is_recovery，正文引用故障 HN-1
    handle.db.prepare(`UPDATE creative_automation_alert_state
      SET consecutive_failures = 3, last_alert_at = CURRENT_TIMESTAMP, last_success_at = NULL
      WHERE failure_kind = 'evaluate'`).run();
    service.recordSuccess("evaluate");
    await new Promise((resolve) => setImmediate(resolve));

    const recovery = handle.db.prepare("SELECT is_recovery FROM creative_automation_alerts WHERE id = 2").get() as { is_recovery: number };
    expect(recovery.is_recovery).toBe(1);
    expect(sentEmails[1].subject).toBe("HotNow 告警：账号适配评估已恢复 [HN-2]");
    expect(sentEmails[1].html).toContain("<b>关联故障告警</b>：HN-1");
  });

  it("Hermes 回写 error 时保留真实技术失败原因", async () => {
    const handle = await createTestDatabase("hot-now-evaluation-error-");
    handles.push(handle);
    const item = insertCreativeSourceItem(handle.db, {
      externalId: "evaluation-error", collectorAgent: "test", title: "需要补充搜索", url: "https://example.com/evaluation-error",
    });
    handle.db.prepare(`INSERT INTO creative_automation_jobs(job_type, source_item_id, trigger_kind, status)
      VALUES ('evaluate', ?, 'automatic', 'pending')`).run(item.id);
    vi.stubGlobal("fetch", vi.fn(async () => {
      updateCreativeSourceItemAccountFit(handle.db, item.id, {
        level: "error", reason: "补充搜索失败：每周使用上限", details: {}, ruleVersion: "v3", updateWritingStatus: false,
      });
      return new Response(JSON.stringify({
        ok: true,
        accountFit: { level: "error", reason: "补充搜索失败：每周使用上限" },
      }), { status: 200 });
    }));
    const service = new CreativeAutomationService(handle.db, null, { baseUrl: "https://hermes.test", token: "token" });

    await service.runNow();

    const job = handle.db.prepare("SELECT status, last_error FROM creative_automation_jobs WHERE source_item_id = ?").get(item.id) as { status: string; last_error: string };
    expect(job).toEqual({ status: "retrying", last_error: "补充搜索失败：每周使用上限" });
  });
});
