<script setup lang="ts">
import { ref, onMounted } from "vue";
import { Modal, message } from "ant-design-vue";
import { fetchMonitorStats } from "../../services/monitorApi.js";
import { updateSwitch } from "../../services/monitorApi.js";

type SwitchDef = {
  key: string;
  label: string;
  type: "onoff" | "number" | "select";
  options?: string[]; // select 类型的可选值
  description: string;
  confirmChange?: boolean; // 是否需要二次确认
};

const switchDefs: SwitchDef[] = [
  { key: "pipeline", label: "管线总开关", type: "onoff", description: "控制自动管线是否按间隔运行", confirmChange: true },
  { key: "draft_push", label: "草稿推送", type: "onoff", description: "控制成品文章是否自动推送草稿" },
  { key: "auto_generate_images", label: "自动生图", type: "onoff", description: "控制是否自动生成封面/正文配图" },
  { key: "image_provider", label: "图片服务商", type: "select", options: ["aitechflux", "packy", "nebula"], description: "切换图片生成服务商", confirmChange: true },
  { key: "codex_image_task", label: "Codex 图片任务", type: "onoff", description: "控制 Codex 图片补全任务" },
  { key: "trend_score_threshold", label: "趋势分阈值", type: "number", description: "趋势分 ≥ 此值才进入待写作队列" },
  { key: "interval_pipeline", label: "管线间隔（分钟）", type: "number", description: "自动管线运行间隔" },
  { key: "interval_codex_generate", label: "Codex 生成间隔（分钟）", type: "number", description: "Codex 任务生成间隔" },
  { key: "interval_codex_consume", label: "Codex 消费间隔（分钟）", type: "number", description: "Codex 结果消费间隔" },
];

const switches = ref<Record<string, string>>({});
const loading = ref(false);
const saving = ref<string | null>(null);
// 数值类输入的草稿值：改了但还没确认提交
const draftNumbers = ref<Record<string, number>>({});

// 某个数值开关是否有未保存的草稿
function hasDraft(key: string): boolean {
  if (switches.value[key] == null) return false;
  return draftNumbers.value[key] != null && draftNumbers.value[key] !== Number(switches.value[key]);
}

// 编辑数值时只写入草稿，不立即提交
function onNumberInput(key: string, val: number | null): void {
  if (val == null) return;
  draftNumbers.value = { ...draftNumbers.value, [key]: val };
}

// 确认提交数值草稿
async function confirmNumber(key: string): Promise<void> {
  const val = draftNumbers.value[key];
  if (val == null) return;
  await saveSwitch(key, String(val));
  // 清除草稿（saveSwitch 成功后会 refresh 重建 switches）
  const next = { ...draftNumbers.value };
  delete next[key];
  draftNumbers.value = next;
}

// 取消数值草稿
function cancelNumber(key: string): void {
  const next = { ...draftNumbers.value };
  delete next[key];
  draftNumbers.value = next;
}

async function refresh(): Promise<void> {
  loading.value = true;
  try {
    const stats = await fetchMonitorStats();
    switches.value = stats.switches;
  } catch { /* 静默 */ }
  finally { loading.value = false; }
}

async function saveSwitch(key: string, value: string): Promise<void> {
  const def = switchDefs.find(d => d.key === key);
  if (!def) return;

  // 需要二次确认的开关
  if (def.confirmChange) {
    const confirmed = await new Promise<boolean>(resolve => {
      Modal.confirm({
        title: `确认修改「${def.label}」？`,
        content: `将 ${key} 从 ${switches.value[key] ?? '-'} 改为 ${value}。${def.description}`,
        okText: "确认修改",
        cancelText: "取消",
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
      });
    });
    if (!confirmed) return;
  }

  saving.value = key;
  try {
    await updateSwitch(key, value);
    message.success(`${def.label} 已更新为 ${value}`);
    await refresh();
  } catch (err: unknown) {
    const errMsg = (err as { body?: { error?: string } })?.body?.error ?? "修改失败";
    message.error(errMsg);
  } finally {
    saving.value = null;
  }
}

function isOn(key: string): boolean {
  return switches.value[key] === "on";
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
      <div class="space-y-1.5">
        <div
          v-for="def in switchDefs"
          :key="def.key"
          class="flex items-center gap-2 rounded border border-editorial-border px-2.5 py-1.5"
        >
          <!-- 左侧：标题 + 说明 -->
          <div class="min-w-0 flex-1">
            <span class="text-xs font-medium text-editorial-text-body">{{ def.label }}</span>
            <span class="ml-1.5 text-[10px] text-editorial-text-muted/70 truncate">{{ def.description }}</span>
          </div>

          <!-- 右侧：当前值 + 控件 -->
          <span class="shrink-0 text-[10px] font-mono text-editorial-text-muted/60">{{ switches[def.key] ?? '-' }}</span>

          <a-switch
            v-if="def.type === 'onoff'"
            :checked="isOn(def.key)"
            :loading="saving === def.key"
            size="small"
            @change="(checked: boolean) => saveSwitch(def.key, checked ? 'on' : 'off')"
          />

          <!-- 数值输入：有草稿时显示确认/取消按钮 -->
          <template v-else-if="def.type === 'number'">
            <a-input-number
              :value="hasDraft(def.key) ? draftNumbers[def.key] : Number(switches[def.key] ?? 0)"
              :min="0"
              :step="1"
              size="small"
              class="!w-20"
              :disabled="saving === def.key"
              @change="(val: number) => onNumberInput(def.key, val)"
            />
            <template v-if="hasDraft(def.key)">
              <button
                class="shrink-0 rounded bg-blue-500 px-1.5 py-0.5 text-[10px] font-medium text-white hover:bg-blue-600 disabled:opacity-50"
                :disabled="saving === def.key"
                @click="confirmNumber(def.key)"
              >确认</button>
              <button
                class="shrink-0 rounded border border-gray-300 bg-white px-1.5 py-0.5 text-[10px] text-gray-500 hover:bg-gray-50"
                @click="cancelNumber(def.key)"
              >取消</button>
            </template>
          </template>

          <a-select
            v-else-if="def.type === 'select'"
            :value="switches[def.key] ?? ''"
            :options="def.options?.map(o => ({ value: o, label: o }))"
            size="small"
            class="!w-28"
            :loading="saving === def.key"
            @change="(val: string) => saveSwitch(def.key, val)"
          />
        </div>
      </div>
    </a-spin>
  </section>
</template>
