<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { Modal, message } from "ant-design-vue";
import { fetchMonitorStats, updateSwitch } from "../../services/monitorApi.js";
import { usePipelineStatus } from "../../composables/usePipelineStatus.js";

const { pipelineOn, writeOn, refresh: refreshGlobal } = usePipelineStatus();

const switches = ref<Record<string, string>>({});
const loading = ref(false);
const saving = ref<string | null>(null);

// 当前自动生图模式（三选一，与手动独立）
const imageMode = computed(() => switches.value.image_gen_mode ?? "codex-auto");
const isProviderAuto = computed(() => imageMode.value === "provider-auto");
// 只读生效时间
const providerAutoSince = computed(() => switches.value.provider_auto_since ?? "");
const codexAutoSince = computed(() => switches.value.codex_auto_since ?? "");

const imageModeOptions = [
  { value: "provider-auto", label: "服务商自动" },
  { value: "codex-auto", label: "Codex 自动" },
  { value: "off", label: "关闭自动" },
];

// 第一组：管线控制
const pipelineGroup = [
  {
    key: "pipeline",
    label: "管线紧急制动",
    type: "onoff" as const,
    description: "关闭后采集、评分、写作全部停止",
    confirmMessages: {
      onToOff: { title: "紧急制动", content: "关闭管线后，采集、评分、写作将全部停止。正在写作的文章会被中止并回退。确认关闭？" },
      offToOn: { title: "恢复管线", content: "管线将恢复运行，下一轮调度到来时正常执行。确认恢复？" },
    },
  },
  {
    key: "write",
    label: "自动写作",
    type: "onoff" as const,
    description: "关闭后只暂停自动写作，采集评分照常；手动写作不受影响",
    confirmMessages: {
      onToOff: { title: "关闭自动写作", content: "自动写作将暂停，但采集和评分继续运行。手动写作不受影响。确认关闭？" },
      offToOn: { title: "开启自动写作", content: "下一轮管线执行时将正常提交写作任务。确认开启？" },
    },
  },
];

// 第二组：业务开关（隐藏旧开关 auto_generate_images / codex_image_task）
const businessGroup = [
  { key: "draft_push", label: "草稿推送", type: "onoff" as const, description: "控制成品文章是否标记为可推送" },
];

// 第三组：参数配置（image_gen_mode + image_provider 联动 + 只读时间戳）
const paramGroup = [
  { key: "image_gen_mode", label: "自动生图模式", type: "select" as const, options: imageModeOptions, description: "自动模式三选一；手动生图始终可用，不受此开关影响", confirmChange: true },
  { key: "image_provider", label: "图片服务商", type: "select" as const, options: ["aitechflux", "packy", "nebula"], description: "仅在 provider-auto 时生效", confirmChange: true },
  { key: "trend_score_threshold", label: "趋势分阈值", type: "number" as const, description: "≥ 此值的素材进入待写作队列" },
  { key: "interval_pipeline", label: "管线间隔（分钟）", type: "number" as const, description: "自动运行间隔" },
  { key: "interval_codex_generate", label: "Codex 生成间隔（分钟）", type: "number" as const, description: "Codex 任务生成间隔" },
  { key: "interval_codex_consume", label: "Codex 消费间隔（分钟）", type: "number" as const, description: "Codex 结果消费间隔" },
];

type SwitchDef = { key: string; confirmChange?: boolean; confirmMessages?: Record<string, { title: string; content: string }> };
const allDefs = [...pipelineGroup, ...businessGroup, ...paramGroup] as SwitchDef[];

// 状态摘要
const statusSummary = computed(() => {
  if (!pipelineOn.value) return { text: "⚠️ 管线已紧急制动，所有流程已停止", type: "warning" as const };
  if (!writeOn.value) return { text: "自动写作已暂停，采集评分正常运行", type: "info" as const };
  return { text: "管线正常运行中", type: "success" as const };
});

// 数值草稿
const draftNumbers = ref<Record<string, number>>({});
function hasDraft(key: string): boolean {
  if (switches.value[key] == null) return false;
  return draftNumbers.value[key] != null && draftNumbers.value[key] !== Number(switches.value[key]);
}
function onNumberInput(key: string, val: number | null): void {
  if (val == null) return;
  draftNumbers.value = { ...draftNumbers.value, [key]: val };
}
async function confirmNumber(key: string): Promise<void> {
  const val = draftNumbers.value[key];
  if (val == null) return;
  await saveSwitch(key, String(val));
  const next = { ...draftNumbers.value };
  delete next[key];
  draftNumbers.value = next;
}

async function refresh(): Promise<void> {
  loading.value = true;
  try {
    const stats = await fetchMonitorStats();
    switches.value = stats.switches;
    pipelineOn.value = stats.switches.pipeline === "on";
    writeOn.value = stats.switches.write === "on";
  } catch { /* 静默 */ }
  finally { loading.value = false; }
}

async function saveSwitch(key: string, value: string): Promise<void> {
  saving.value = key;
  try {
    await updateSwitch(key, value);
    message.success("已更新");
    await refresh();
    refreshGlobal();
  } catch (err: unknown) {
    const errMsg = (err as { body?: { error?: string } })?.body?.error ?? "修改失败";
    message.error(errMsg);
  } finally {
    saving.value = null;
  }
}

// onoff 切换
async function handleSwitchChange(key: string, checked: boolean): Promise<void> {
  const value = checked ? "on" : "off";
  const def = allDefs.find(d => d.key === key) as SwitchDef & { confirmMessages?: Record<string, { title: string; content: string }> };
  if (def?.confirmMessages) {
    const msgKey = checked ? "offToOn" : "onToOff";
    const confirmed = await new Promise<boolean>(resolve => {
      Modal.confirm({
        title: def.confirmMessages![msgKey]?.title ?? "确认操作",
        content: def.confirmMessages![msgKey]?.content ?? "确认修改？",
        okText: "确认", cancelText: "取消",
        onOk: () => resolve(true), onCancel: () => resolve(false),
      });
    });
    if (!confirmed) return;
  }
  await saveSwitch(key, value);
}

// select 切换（image_gen_mode / image_provider）
async function handleSelectChange(key: string, value: string): Promise<void> {
  const def = allDefs.find(d => d.key === key);
  if (key === "image_gen_mode") {
    const confirmed = await new Promise<boolean>(resolve => {
      Modal.confirm({
        title: "切换自动生图模式",
        content: `将自动生图模式从「${imageMode.value}」切换为「${value}」。手动生图不受影响。确认？`,
        okText: "确认切换", cancelText: "取消",
        onOk: () => resolve(true), onCancel: () => resolve(false),
      });
    });
    if (!confirmed) return;
  } else if (key === "image_provider" && def?.confirmChange) {
    const confirmed = await new Promise<boolean>(resolve => {
      Modal.confirm({
        title: "切换图片服务商",
        content: `图片生成将切换为 ${value}，可能影响图片风格。确认切换？`,
        okText: "确认切换", cancelText: "取消",
        onOk: () => resolve(true), onCancel: () => resolve(false),
      });
    });
    if (!confirmed) return;
  }
  await saveSwitch(key, value);
}

function isOn(key: string): boolean {
  return switches.value[key] === "on";
}

// 格式化 ISO 时间戳为本地时间
function formatSince(raw: string): string {
  if (!raw) return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

onMounted(() => refresh());
</script>

<template>
  <section class="rounded-lg border border-editorial-border bg-white p-4">
    <div class="mb-3 flex items-center justify-between">
      <h3 class="m-0 text-sm font-semibold text-editorial-text-muted">开关配置</h3>
      <a-button type="link" size="small" class="!p-0 !text-[11px]" :loading="loading" @click="refresh">刷新</a-button>
    </div>

    <a-spin :spinning="loading && Object.keys(switches).length === 0">
      <!-- 状态摘要 -->
      <a-alert :type="statusSummary.type" :message="statusSummary.text" show-icon class="!mb-3 !py-1.5 !text-xs" />

      <!-- 第一组：管线控制 -->
      <div class="mb-2 text-[10px] font-medium uppercase tracking-wider text-editorial-text-muted">管线控制</div>
      <div class="mb-3 space-y-1.5">
        <div v-for="def in pipelineGroup" :key="def.key" class="flex items-center gap-2 rounded border border-editorial-border px-2.5 py-1.5">
          <div class="min-w-0 flex-1">
            <span class="text-xs font-medium text-editorial-text-body">{{ def.label }}</span>
            <span class="ml-1 text-[10px] text-editorial-text-muted/70">{{ def.description }}</span>
          </div>
          <span class="shrink-0 text-[10px] font-mono text-editorial-text-muted/60">{{ switches[def.key] ?? '-' }}</span>
          <a-switch :checked="isOn(def.key)" :loading="saving === def.key" :disabled="def.key === 'write' && !pipelineOn" size="small" @change="(checked: boolean) => handleSwitchChange(def.key, checked)" />
        </div>
        <div v-if="!pipelineOn" class="pl-2 text-[10px] text-orange-500">管线已紧急制动，write 开关不可操作</div>
      </div>

      <!-- 第二组：业务开关 -->
      <div class="mb-2 text-[10px] font-medium uppercase tracking-wider text-editorial-text-muted">业务开关</div>
      <div class="mb-3 space-y-1.5">
        <div v-for="def in businessGroup" :key="def.key" class="flex items-center gap-2 rounded border border-editorial-border px-2.5 py-1.5">
          <div class="min-w-0 flex-1">
            <span class="text-xs font-medium text-editorial-text-body">{{ def.label }}</span>
            <span class="ml-1 text-[10px] text-editorial-text-muted/70">{{ def.description }}</span>
          </div>
          <span class="shrink-0 text-[10px] font-mono text-editorial-text-muted/60">{{ switches[def.key] ?? '-' }}</span>
          <a-switch :checked="isOn(def.key)" :loading="saving === def.key" size="small" @change="(checked: boolean) => handleSwitchChange(def.key, checked)" />
        </div>
      </div>

      <!-- 第三组：参数配置 -->
      <div class="mb-2 text-[10px] font-medium uppercase tracking-wider text-editorial-text-muted">参数配置</div>
      <div class="space-y-1.5">
        <div v-for="def in paramGroup" :key="def.key" class="flex items-center gap-2 rounded border border-editorial-border px-2.5 py-1.5" :class="{ 'opacity-50': def.key === 'image_provider' && !isProviderAuto }">
          <div class="min-w-0 flex-1">
            <span class="text-xs font-medium text-editorial-text-body">{{ def.label }}</span>
            <span class="ml-1 text-[10px] text-editorial-text-muted/70">{{ def.description }}</span>
          </div>
          <span class="shrink-0 text-[10px] font-mono text-editorial-text-muted/60">{{ switches[def.key] ?? '-' }}</span>

          <!-- select -->
          <a-select
            v-if="def.type === 'select'"
            :value="switches[def.key] ?? ''"
            :options="def.options?.map((o: any) => ({ value: o.value ?? o, label: o.label ?? o }))"
            size="small"
            :class="def.key === 'image_gen_mode' ? '!w-[120px]' : '!w-28'"
            :loading="saving === def.key"
            :disabled="def.key === 'image_provider' && !isProviderAuto"
            @change="(val: string) => handleSelectChange(def.key, val)"
          />

          <!-- number -->
          <template v-else-if="def.type === 'number'">
            <a-input-number
              :value="hasDraft(def.key) ? draftNumbers[def.key] : Number(switches[def.key] ?? 0)"
              :min="0" :step="1" size="small" class="!w-20"
              :disabled="saving === def.key"
              @change="(val: number) => onNumberInput(def.key, val)"
            />
            <button
              class="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium disabled:opacity-50"
              :class="hasDraft(def.key) ? 'bg-blue-500 text-white hover:bg-blue-600' : 'bg-gray-100 text-gray-400 cursor-default'"
              :disabled="saving === def.key || !hasDraft(def.key)"
              @click="confirmNumber(def.key)"
            >确认</button>
          </template>
        </div>

        <!-- 只读：自动生图生效时间 -->
        <div v-if="providerAutoSince || codexAutoSince" class="mt-2 rounded border border-editorial-border bg-editorial-bg-page px-2.5 py-1.5 space-y-0.5">
          <div v-if="providerAutoSince" class="text-[10px] text-editorial-text-muted">服务商自动生效于 {{ formatSince(providerAutoSince) }}</div>
          <div v-if="codexAutoSince" class="text-[10px] text-editorial-text-muted">Codex 自动生效于 {{ formatSince(codexAutoSince) }}</div>
        </div>
      </div>
    </a-spin>
  </section>
</template>
