import { useVisiblePolling } from "../../composables/useVisiblePolling.js";
import { computed, ref } from "vue";
import { Modal, message } from "ant-design-vue";
import { fetchMonitorStats, updateSwitch, type MonitorStats } from "../../services/monitorApi.js";
import { fetchCreativeAutomationStatus, triggerCreativeDailyPlan, updateCreativeAutomationControl, type AutomationMode, type AutomationStageKey, type CreativeAutomationStatus, type DailyPlanItem, type DailyPlanView } from "../../services/creativeApi.js";

export type MonitorSwitchesEvents = { openArticle: [articleId: number] };

/** 管理Hermes 自动化配置、草稿保护和控制提交；返回展示状态与动作，集中维护原请求、错误处理和生命周期副作用。 */
export function useMonitorSwitches() {


  const automation = ref<CreativeAutomationStatus | null>(null);
  const stats = ref<MonitorStats | null>(null);
  const loading = ref(false);
  const saving = ref<string | null>(null);

  const modeOptions: Array<{ value: AutomationMode; label: string }> = [
    { value: "running", label: "运行中" },
    { value: "paused", label: "普通暂停" },
    { value: "emergency_stopped", label: "紧急停止" },
  ];

  const stageDefinitions: Array<{ key: AutomationStageKey; description: string }> = [
    { key: "collection", description: "Hermes 自动采集新素材" },
    { key: "base_scoring", description: "基础评分、趋势评分和基础筛选" },
    { key: "account_fit", description: "账号适配评估；失败按退避上限重试" },
    { key: "long_write", description: "周期槽位自动长文；仅接受账号适配=high且双评分达标的素材" },
    { key: "short_collection", description: "采集短内容热搜并入库；不启动写作" },
    { key: "short_write", description: "当前采集批次逐篇投递，已有自动短任务时不追加" },
    { key: "images", description: "自动写作中的 Luna 图片生成许可" },
    { key: "daily_digest", description: "自动日报" },
    { key: "reminders", description: "自动提醒" },
    { key: "notifications", description: "邮件和其他自动通知" },
  ];

  const longConfigDefinitions = [
    { key: "dailyLongWriteCount", backendKey: "auto_write_daily_count", label: "每轮自动长文槽位", description: "默认 3 个；表示当前执行周期最多同时占用的任务数，成功或终态阻断后自动释放", type: "number" as const, min: 0, max: 20 },
    { key: "dailyLongWriteTime", backendKey: "auto_write_daily_time", label: "每日自动写作时间", description: "北京时间，默认 10:00", type: "time" as const, min: 0, max: 0 },
    { key: "windowHours", backendKey: "auto_write_window_hours", label: "素材回看窗口（小时）", description: "计划时间向前筛选，默认 48 小时", type: "number" as const, min: 1, max: 168 },
    { key: "baseScoreThreshold", backendKey: "auto_write_base_score_threshold", label: "基础评分阈值", description: "自动写作硬门槛；还必须账号适配=high且趋势分达标，默认 80", type: "number" as const, min: 0, max: 100 },
    { key: "trendScoreThreshold", backendKey: "trend_score_threshold", label: "趋势评分阈值", description: "自动写作硬门槛；还必须账号适配=high且基础分达标，默认 80", type: "number" as const, min: 0, max: 100 },
  ] as const;
  const shortConfigDefinitions = [
    { key: "shortCollectionInterval", backendKey: "interval_short_collection", label: "短内容采集间隔（分钟）", description: "采集后评分形成当前批次候选；默认 60 分钟，不随每篇写作重复采集", type: "number" as const, min: 1, max: 1440 },
    { key: "shortWriteCycleCount", backendKey: "auto_write_short_cycle_count", label: "每采集周期最多写作篇数", description: "统计 Hermes 已受理的自动短写任务，范围 1–20；剩余候选按下一批替换规则处理", type: "number" as const, min: 1, max: 20 },
    { key: "shortWriteInterval", backendKey: "interval_short_write", label: "单篇投递间隔（分钟）", description: "每次最多投递一篇；支持小数，实际开写仍受队列与人工任务优先级影响", type: "number" as const, min: 1, max: 1440 },
  ] as const;
  const configDefinitions = [...longConfigDefinitions, ...shortConfigDefinitions] as const;

  type ConfigKey = (typeof configDefinitions)[number]["key"];
  const configDraft = ref<Partial<Record<ConfigKey, string | number>>>({});
  const configDirty = ref<ConfigKey | null>(null);
  let refreshInFlight = false;
  let refreshErrorShown = false;

  const imageMode = computed(() => stats.value?.switches.image_gen_mode ?? "codex-auto");
  const imageProvider = computed(() => stats.value?.switches.image_provider ?? "aitechflux");
  const imageModeOptions = [
    { value: "provider-auto", label: "服务商自动" },
    { value: "codex-auto", label: "Codex 自动" },
    { value: "off", label: "关闭自动" },
  ];
  const imageProviderOptions = ["aitechflux", "packy", "nebula"];
  const isProviderAuto = computed(() => imageMode.value === "provider-auto");

  const statusSummary = computed(() => {
    const mode = automation.value?.mode;
    if (mode === "emergency_stopped") {
      return { type: "warning" as const, text: "自动化已紧急停止：自动采集、评估、写作和图片任务不再启动；手动写作仍可用" };
    }
    if (mode === "paused") {
      return { type: "info" as const, text: "自动化处于普通暂停：自动任务暂缓；人工评估入口已移除，手动写作仍可用" };
    }
    return { type: "success" as const, text: "自动化运行中；各阶段由下方独立开关控制" };
  });
  /** 读取指定自动阶段的当前开关与有效状态，缺失时沿用原关闭兜底。 */
  function stageState(key: AutomationStageKey): { enabled: boolean; effective: boolean } {
    return automation.value?.stages[key] ?? { enabled: false, effective: false };
  }
  /** 优先读取用户未保存的配置输入，否则读取当前自动化快照。 */
  function draftValue(key: ConfigKey): string | number {
    const draft = configDraft.value[key];
    if (draft !== undefined) return draft;
    return automation.value?.config[key] ?? "";
  }

  const dailyPlan = computed<DailyPlanView | null>(() => automation.value?.dailyPlan ?? null);
  const slotSummary = computed(() => dailyPlan.value?.slots ?? {
    capacity: 0,
    occupied: 0,
    vacant: 0,
    selected: 0,
    dispatching: 0,
    queued: 0,
    writing: 0,
    retry_waiting: 0,
  });
  const currentPlanItems = computed<DailyPlanItem[]>(() => dailyPlan.value?.items ?? []);
  const lastRunItems = computed<DailyPlanItem[]>(() => dailyPlan.value?.lastRun?.items ?? []);

  const itemStatusLabels: Record<string, string> = {
    selected: "已锁定，待执行",
    dispatching: "提交中",
    queued: "已入队",
    writing: "写作中",
    retry_waiting: "待重试",
    succeeded: "已成功",
    blocked: "已阻断，槽位已释放",
    retry_exhausted: "重试耗尽，需人工处理",
    cancelled: "已取消",
  };
  const planStatusLabels: Record<string, string> = {
    preparing: "准备中",
    ready: "待执行",
    observing: "执行中",
    empty: "当前无占用槽位",
    paused: "已暂停",
    waiting_stage: "等待阶段开启",
  };

  /** 将逐篇状态统一映射为页面文案，未知状态保留后端原值。 */
  function itemStatusLabel(item: DailyPlanItem): string {
    return itemStatusLabels[item.status] ?? item.status;
  }

  /** 将 Hermes 的触发来源转换成监控页可读文案。 */
  function triggerKindLabel(kind?: string | null): string {
    if (kind === "scheduled") return "定时执行";
    if (kind === "manual") return "人工执行";
    return kind || "-";
  }

  /** 统一展示周期和逐篇结果时间；异常格式保留原值便于排查。 */
  function formatDateTime(value?: string | null): string {
    if (!value) return "-";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleString("zh-CN", { hour12: false });
  }

  /** 同步 Hermes 的长短配置快照；编辑期间保留用户输入，不保存第二套调度状态。 */
  function syncConfigDraft(status: CreativeAutomationStatus): void {
    if (configDirty.value) return;
    configDraft.value = {
      dailyLongWriteCount: status.config.dailyLongWriteCount,
      dailyLongWriteTime: status.config.dailyLongWriteTime,
      windowHours: status.config.windowHours,
      baseScoreThreshold: status.config.baseScoreThreshold,
      trendScoreThreshold: status.config.trendScoreThreshold,
      shortCollectionInterval: status.config.shortCollectionInterval,
      shortWriteCycleCount: status.config.shortWriteCycleCount,
      shortWriteInterval: status.config.shortWriteInterval,
    };
  }

  /** 读取 Hermes 计划与监控状态；轮询失败时保留上一次成功快照。 */
  async function refresh(options: { silent?: boolean } = {}): Promise<void> {
    if (refreshInFlight) return;
    refreshInFlight = true;
    if (!options.silent) loading.value = true;
    const [automationResult, monitorResult] = await Promise.allSettled([
      fetchCreativeAutomationStatus(),
      fetchMonitorStats(),
    ]);
    if (!isActive()) { refreshInFlight = false; return; }
    if (automationResult.status === "fulfilled") {
      automation.value = automationResult.value;
      syncConfigDraft(automationResult.value);
      refreshErrorShown = false;
    }
    if (monitorResult.status === "fulfilled") stats.value = monitorResult.value;
    if (automationResult.status === "rejected" && monitorResult.status === "rejected" && !refreshErrorShown) {
      message.error("统一自动化状态读取失败，请检查 Hermes 服务");
      refreshErrorShown = true;
    }
    if (!options.silent) loading.value = false;
    refreshInFlight = false;
  }

  /** 修改全局模式；紧急停止由 Hermes 负责清理自动队列，不触碰人工任务。 */
  async function changeMode(mode: AutomationMode): Promise<void> {
    const current = automation.value?.mode;
    if (!current || current === mode) return;
    if (mode === "emergency_stopped") {
      const confirmed = await new Promise<boolean>((resolve) => {
        Modal.confirm({
          title: "确认紧急停止",
          content: "将取消尚未开始的自动写作任务，并阻止新的自动任务；人工写作不受影响。确认停止？",
          okText: "确认停止",
          cancelText: "取消",
          onOk: () => resolve(true),
          onCancel: () => resolve(false),
        });
      });
      if (!confirmed) return;
    }
    saving.value = "mode";
    try {
      automation.value = await updateCreativeAutomationControl({ mode });
      syncConfigDraft(automation.value);
      message.success("自动化模式已更新");
    } catch {
      message.error("自动化模式更新失败");
      await refresh();
    } finally {
      saving.value = null;
    }
  }

  /** 修改单个自动阶段；全局暂停和紧急停止不改变阶段本身的配置值。 */
  async function changeStage(stage: AutomationStageKey, enabled: boolean): Promise<void> {
    saving.value = stage;
    try {
      automation.value = await updateCreativeAutomationControl({ stage, enabled });
      syncConfigDraft(automation.value);
      message.success(`${automation.value.stages[stage].label}已${enabled ? "开启" : "关闭"}`);
    } catch {
      message.error("阶段开关更新失败");
      await refresh();
    } finally {
      saving.value = null;
    }
  }

  /** 保存长短内容参数；只在 Hermes 提供相应节奏字段时提交逐篇间隔或周期篇数上限。 */
  async function saveConfig(definition: (typeof configDefinitions)[number]): Promise<void> {
    const value = configDraft.value[definition.key];
    if (value === undefined || value === "") return;
    if (definition.key === "shortWriteInterval" && !automation.value?.config.shortWritePacingSupported) {
      message.warning("Hermes 逐篇调度版本尚未生效，暂不能保存小数间隔");
      return;
    }
    if (definition.key === "shortWriteCycleCount" && automation.value?.config.shortWriteCycleCount == null) {
      message.warning("Hermes 尚未提供每采集周期篇数配置，暂不能保存");
      return;
    }
    configDirty.value = definition.key;
    saving.value = definition.key;
    try {
      automation.value = await updateCreativeAutomationControl({ config: { [definition.backendKey]: value } });
      configDraft.value = { ...configDraft.value, [definition.key]: automation.value.config[definition.key] };
      message.success("自动化参数已更新");
    } catch {
      message.error("自动化参数更新失败");
      await refresh();
    } finally {
      configDirty.value = null;
      saving.value = null;
    }
  }

  /** 只手动执行点击瞬间的计划快照，不补入后续候选，也不启动持续自动执行。 */
  async function runDailyPlanNow(): Promise<void> {
    saving.value = "daily-plan";
    try {
      const result = await triggerCreativeDailyPlan();
      await refresh();
      if ((result.submitted ?? 0) > 0) {
        message.success(`本次快照已提交 ${result.submitted} 项：新任务 ${result.newSubmitted ?? 0} 项，重试任务 ${result.retrySubmitted ?? 0} 项`);
      } else {
        const slots = result.plan?.slots;
        message.info(`本次没有可执行槽位；当前占用 ${slots?.occupied ?? 0}/${slots?.capacity ?? 0}，空位 ${slots?.vacant ?? 0}`);
      }
    } catch {
      message.error("本轮计划执行失败");
      await refresh();
    } finally {
      saving.value = null;
    }
  }
  /** 保存兼容图片开关后重新读取状态，不创建本地自动化调度。 */
  async function saveLegacySwitch(key: string, value: string): Promise<void> {
    saving.value = key;
    try {
      await updateSwitch(key, value);
      await refresh();
      message.success("参数已更新");
    } catch {
      message.error("参数更新失败");
    } finally {
      saving.value = null;
    }
  }
  /** 将用户选择的图片模式提交到现役控制入口并保留忙碌提示。 */
  async function changeImageMode(value: string): Promise<void> {
    if (value === imageMode.value) return;
    await saveLegacySwitch("image_gen_mode", value);
  }
  /** 保存用户选择的图片服务商，不改变其他图片配置或任务。 */
  async function changeImageProvider(value: string): Promise<void> {
    if (value === imageProvider.value) return;
    await saveLegacySwitch("image_provider", value);
  }

  let firstRead = true;
  const { isActive } = useVisiblePolling(() => {
    const silent = !firstRead;
    firstRead = false;
    return refresh({ silent });
  }, 10_000);

  return {
    automation,
    loading,
    saving,
    modeOptions,
    stageDefinitions,
    longConfigDefinitions,
    shortConfigDefinitions,
    configDraft,
    imageMode,
    imageProvider,
    imageModeOptions,
    imageProviderOptions,
    isProviderAuto,
    statusSummary,
    stageState,
    draftValue,
    dailyPlan,
    slotSummary,
    currentPlanItems,
    lastRunItems,
    planStatusLabels,
    itemStatusLabel,
    triggerKindLabel,
    formatDateTime,
    refresh,
    changeMode,
    changeStage,
    saveConfig,
    runDailyPlanNow,
    changeImageMode,
    changeImageProvider,
  };
}
