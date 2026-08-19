<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { Modal, message } from "ant-design-vue";

import {
  fetchMonitorStats,
  updateSwitch,
  type MonitorStats,
} from "../../services/monitorApi.js";
import {
  fetchCreativeAutomationStatus,
  updateCreativeAutomationControl,
  type AutomationMode,
  type AutomationStageKey,
  type CreativeAutomationStatus,
} from "../../services/creativeApi.js";

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
  { key: "long_write", description: "每日计划自动长文；仅接受账号适配=high且双评分达标的素材" },
  { key: "short_write", description: "自动短内容写作" },
  { key: "images", description: "自动写作中的 Luna 图片生成许可" },
  { key: "daily_digest", description: "自动日报" },
  { key: "reminders", description: "自动提醒" },
  { key: "notifications", description: "邮件和其他自动通知" },
];

const configDefinitions = [
  { key: "dailyLongWriteCount", backendKey: "auto_write_daily_count", label: "每日自动长文数量", description: "默认 3 篇；手动写作不计入此数量", type: "number" as const, min: 0, max: 20 },
  { key: "dailyLongWriteTime", backendKey: "auto_write_daily_time", label: "每日自动写作时间", description: "北京时间，默认 10:00", type: "time" as const, min: 0, max: 0 },
  { key: "windowHours", backendKey: "auto_write_window_hours", label: "素材回看窗口（小时）", description: "计划时间向前筛选，默认 48 小时", type: "number" as const, min: 1, max: 168 },
  { key: "baseScoreThreshold", backendKey: "auto_write_base_score_threshold", label: "基础评分阈值", description: "自动写作硬门槛；还必须账号适配=high且趋势分达标，默认 80", type: "number" as const, min: 0, max: 100 },
  { key: "trendScoreThreshold", backendKey: "trend_score_threshold", label: "趋势评分阈值", description: "自动写作硬门槛；还必须账号适配=high且基础分达标，默认 80", type: "number" as const, min: 0, max: 100 },
] as const;

type ConfigKey = (typeof configDefinitions)[number]["key"];
const configDraft = ref<Partial<Record<ConfigKey, string | number>>>({});
const configDirty = ref<ConfigKey | null>(null);

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

function stageState(key: AutomationStageKey): { enabled: boolean; effective: boolean } {
  return automation.value?.stages[key] ?? { enabled: false, effective: false };
}

function draftValue(key: ConfigKey): string | number {
  const draft = configDraft.value[key];
  if (draft !== undefined) return draft;
  return automation.value?.config[key] ?? "";
}

function planValue(key: string): string {
  const value = automation.value?.dailyPlan?.[key];
  return value === undefined || value === null ? "-" : String(value);
}

function syncConfigDraft(status: CreativeAutomationStatus): void {
  if (configDirty.value) return;
  configDraft.value = {
    dailyLongWriteCount: status.config.dailyLongWriteCount,
    dailyLongWriteTime: status.config.dailyLongWriteTime,
    windowHours: status.config.windowHours,
    baseScoreThreshold: status.config.baseScoreThreshold,
    trendScoreThreshold: status.config.trendScoreThreshold,
  };
}

async function refresh(): Promise<void> {
  loading.value = true;
  const [automationResult, monitorResult] = await Promise.allSettled([
    fetchCreativeAutomationStatus(),
    fetchMonitorStats(),
  ]);
  if (automationResult.status === "fulfilled") {
    automation.value = automationResult.value;
    syncConfigDraft(automationResult.value);
  }
  if (monitorResult.status === "fulfilled") stats.value = monitorResult.value;
  if (automationResult.status === "rejected" && monitorResult.status === "rejected") {
    message.error("统一自动化状态读取失败，请检查 Hermes 服务");
  }
  loading.value = false;
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

/** 保存每日计划参数，参数写入 Hermes，不在 HotNow 留本地副本。 */
async function saveConfig(definition: (typeof configDefinitions)[number]): Promise<void> {
  const value = configDraft.value[definition.key];
  if (value === undefined || value === "") return;
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

async function changeImageMode(value: string): Promise<void> {
  if (value === imageMode.value) return;
  await saveLegacySwitch("image_gen_mode", value);
}

async function changeImageProvider(value: string): Promise<void> {
  if (value === imageProvider.value) return;
  await saveLegacySwitch("image_provider", value);
}

onMounted(() => {
  refresh();
});
</script>

<template>
  <section class="rounded-lg border border-editorial-border bg-white p-4">
    <div class="mb-3 flex items-center justify-between">
      <div>
        <h3 class="m-0 text-sm font-semibold text-editorial-text-muted">统一自动化控制</h3>
        <p class="m-0 mt-1 text-[10px] text-editorial-text-muted/70">Hermes 是状态、队列、调度和重试的唯一真源；HotNow 只展示并发送控制意图。</p>
      </div>
      <a-button type="link" size="small" class="!p-0 !text-[11px]" :loading="loading" @click="refresh">刷新</a-button>
    </div>

    <a-spin :spinning="loading && !automation">
      <a-alert :type="statusSummary.type" :message="statusSummary.text" show-icon class="!mb-3 !py-1.5 !text-xs" />

      <div class="mb-2 text-[10px] font-medium uppercase tracking-wider text-editorial-text-muted">总模式</div>
      <div class="mb-4 flex items-center gap-2 rounded border border-editorial-border px-2.5 py-2">
        <div class="min-w-0 flex-1">
          <span class="text-xs font-medium text-editorial-text-body">自动化总模式</span>
          <span class="ml-1 text-[10px] text-editorial-text-muted/70">普通暂停允许人工写作；紧急停止取消未开始的自动任务</span>
        </div>
        <a-select :value="automation?.mode" :options="modeOptions" class="!w-28" size="small" :loading="saving === 'mode'" @change="changeMode" />
      </div>

      <div class="mb-2 text-[10px] font-medium uppercase tracking-wider text-editorial-text-muted">独立自动阶段</div>
      <div class="mb-4 space-y-1.5">
        <div v-for="definition in stageDefinitions" :key="definition.key" class="flex items-center gap-2 rounded border border-editorial-border px-2.5 py-1.5">
          <div class="min-w-0 flex-1">
            <span class="text-xs font-medium text-editorial-text-body">{{ automation?.stages[definition.key]?.label ?? definition.key }}</span>
            <span class="ml-1 text-[10px] text-editorial-text-muted/70">{{ definition.description }}</span>
          </div>
          <span class="shrink-0 text-[10px] text-editorial-text-muted/70">{{ stageState(definition.key).effective ? '当前生效' : stageState(definition.key).enabled ? '已配置，暂不生效' : '关闭' }}</span>
          <a-switch :checked="stageState(definition.key).enabled" :loading="saving === definition.key" size="small" @change="(checked: boolean) => changeStage(definition.key, checked)" />
        </div>
      </div>

      <div class="mb-2 text-[10px] font-medium uppercase tracking-wider text-editorial-text-muted">每日自动长文计划</div>
      <div class="mb-4 space-y-1.5">
        <div v-for="definition in configDefinitions" :key="definition.key" class="flex items-center gap-2 rounded border border-editorial-border px-2.5 py-1.5">
          <div class="min-w-0 flex-1">
            <div class="text-xs font-medium text-editorial-text-body">{{ definition.label }}</div>
            <div class="text-[10px] text-editorial-text-muted/70">{{ definition.description }}</div>
          </div>
          <a-input v-if="definition.type === 'time'" :value="draftValue(definition.key)" type="time" size="small" class="!w-24" :disabled="saving === definition.key" @input="(event: Event) => { configDraft[definition.key] = (event.target as HTMLInputElement).value; }" />
          <a-input-number v-else :value="draftValue(definition.key)" :min="definition.min" :max="definition.max" size="small" class="!w-20" :disabled="saving === definition.key" @change="(value: number | null) => { if (value !== null) configDraft[definition.key] = value; }" />
          <a-button size="small" :loading="saving === definition.key" @click="saveConfig(definition)">保存</a-button>
        </div>
        <div class="rounded border border-editorial-border bg-editorial-bg-page px-2.5 py-1.5 text-[10px] text-editorial-text-muted">
          <div>今日计划：{{ planValue('status') }} · 已锁定 {{ planValue('selected_count') }} / {{ planValue('target_count') }} 篇</div>
          <div class="mt-0.5">计划日期 {{ planValue('plan_date') }} · 模型快照 {{ planValue('model_snapshot') }}</div>
        </div>
        <div class="rounded border border-editorial-border bg-editorial-bg-page px-2.5 py-1.5 text-[10px] leading-5 text-editorial-text-muted">
          自动写作入列条件：账号适配必须为 <strong>high（高适配）</strong>，同时基础评分 ≥ {{ automation?.config.baseScoreThreshold ?? 80 }}、趋势评分 ≥ {{ automation?.config.trendScoreThreshold ?? 80 }}；另受 48 小时窗口、已写作/已占用排除和同日主题去重约束。
        </div>
      </div>

      <div class="mb-2 text-[10px] font-medium uppercase tracking-wider text-editorial-text-muted">旧图片实现参数（不承载自动调度）</div>
      <div class="space-y-1.5">
        <div class="flex items-center gap-2 rounded border border-editorial-border px-2.5 py-1.5">
          <div class="min-w-0 flex-1"><span class="text-xs font-medium text-editorial-text-body">旧自动生图实现</span><span class="ml-1 text-[10px] text-editorial-text-muted/70">仅选择旧服务商/Codex-auto实现；是否执行由上方“自动图片生成”阶段控制</span></div>
          <a-select :value="imageMode" :options="imageModeOptions" size="small" class="!w-28" :loading="saving === 'image_gen_mode'" @change="changeImageMode" />
        </div>
        <div class="flex items-center gap-2 rounded border border-editorial-border px-2.5 py-1.5" :class="{ 'opacity-50': !isProviderAuto }">
          <div class="min-w-0 flex-1"><span class="text-xs font-medium text-editorial-text-body">图片服务商</span><span class="ml-1 text-[10px] text-editorial-text-muted/70">仅在服务商自动模式下生效</span></div>
          <a-select :value="imageProvider" :options="imageProviderOptions.map(value => ({ value, label: value }))" size="small" class="!w-28" :disabled="!isProviderAuto" :loading="saving === 'image_provider'" @change="changeImageProvider" />
        </div>
        <div class="rounded border border-editorial-border bg-editorial-bg-page px-2.5 py-1.5 text-[10px] text-editorial-text-muted">自动任务只由 Hermes automation_tick 统一调度；如需立即推进，请使用统一控制 API，不再从此处启动独立管线。</div>
      </div>
    </a-spin>
  </section>
</template>
