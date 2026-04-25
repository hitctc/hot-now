<script setup lang="ts">
import { computed, reactive, watch } from "vue";

import type {
  AiTimelineEventRecord,
  AiTimelineImportanceLevel,
  AiTimelineReliabilityStatus,
  AiTimelineVisibilityStatus
} from "../../../services/aiTimelineApi";
import type { AiTimelineAdminEventDraft } from "./useAiTimelineAdminPageController";

const props = defineProps<{
  open: boolean;
  event: AiTimelineEventRecord | null;
  draft: AiTimelineAdminEventDraft;
  isSaving: boolean;
}>();

const emit = defineEmits<{
  close: [];
  save: [draft: AiTimelineAdminEventDraft];
}>();

const localDraft = reactive<AiTimelineAdminEventDraft>({
  manualTitle: "",
  manualSummaryZh: "",
  manualImportanceLevel: null,
  visibilityStatus: "auto_visible",
  reliabilityStatus: "single_source"
});

const importanceValue = computed({
  get: () => localDraft.manualImportanceLevel ?? "",
  set: (value: string) => {
    localDraft.manualImportanceLevel = value ? (value as AiTimelineImportanceLevel) : null;
  }
});

watch(
  () => [props.open, props.draft] as const,
  () => {
    localDraft.manualTitle = props.draft.manualTitle;
    localDraft.manualSummaryZh = props.draft.manualSummaryZh;
    localDraft.manualImportanceLevel = props.draft.manualImportanceLevel;
    localDraft.visibilityStatus = props.draft.visibilityStatus;
    localDraft.reliabilityStatus = props.draft.reliabilityStatus;
  },
  { immediate: true }
);

const importanceOptions: AiTimelineImportanceLevel[] = ["S", "A", "B", "C"];
const visibilityOptions: Array<{ value: AiTimelineVisibilityStatus; label: string }> = [
  { value: "auto_visible", label: "自动展示" },
  { value: "manual_visible", label: "人工确认展示" },
  { value: "hidden", label: "隐藏" }
];
const reliabilityOptions: Array<{ value: AiTimelineReliabilityStatus; label: string }> = [
  { value: "single_source", label: "单一官方证据" },
  { value: "multi_source", label: "多官方证据" },
  { value: "source_degraded", label: "来源健康需检查" },
  { value: "manual_verified", label: "人工确认可靠" }
];
</script>

<template>
  <teleport to="body">
    <section
      v-if="open && event"
      class="fixed inset-y-0 right-0 z-[1000] flex w-full max-w-[520px] flex-col gap-4 border-l border-editorial-border bg-editorial-panel p-5 shadow-editorial-card"
      data-ai-timeline-admin-edit-drawer
      role="dialog"
      aria-modal="true"
      aria-label="编辑时间线事件"
    >
      <div class="flex items-start justify-between gap-4">
        <div>
          <p class="m-0 text-xs font-semibold uppercase tracking-[0.18em] text-editorial-text-muted">Timeline Event</p>
          <h3 class="m-0 mt-2 text-xl font-semibold text-editorial-text-main">编辑时间线事件</h3>
        </div>
        <button
          type="button"
          class="rounded-editorial-pill border border-editorial-border px-3 py-1 text-sm text-editorial-text-body"
          @click="emit('close')"
        >
          关闭
        </button>
      </div>

      <div class="rounded-editorial-card border border-editorial-border bg-editorial-surface p-3">
        <p class="m-0 text-sm font-semibold text-editorial-text-main">{{ event.displayTitle }}</p>
        <p class="m-0 mt-1 text-xs text-editorial-text-muted">{{ event.companyName }} · {{ event.eventType }}</p>
      </div>

      <label class="grid gap-2 text-sm text-editorial-text-body">
        <span>人工标题</span>
        <input
          v-model="localDraft.manualTitle"
          class="rounded-editorial-md border border-editorial-border bg-editorial-surface px-3 py-2 text-editorial-text-main"
          placeholder="不填则使用自动标题"
          data-ai-timeline-admin-manual-title
        />
      </label>

      <label class="grid gap-2 text-sm text-editorial-text-body">
        <span>中文摘要</span>
        <textarea
          v-model="localDraft.manualSummaryZh"
          class="min-h-28 rounded-editorial-md border border-editorial-border bg-editorial-surface px-3 py-2 text-editorial-text-main"
          placeholder="用人话说明这件事为什么重要"
          data-ai-timeline-admin-manual-summary
        />
      </label>

      <div class="grid gap-3 md:grid-cols-3">
        <label class="grid gap-2 text-sm text-editorial-text-body">
          <span>重要级别</span>
          <select
            v-model="importanceValue"
            class="rounded-editorial-md border border-editorial-border bg-editorial-surface px-3 py-2 text-editorial-text-main"
          >
            <option value="">自动判断</option>
            <option v-for="level in importanceOptions" :key="level" :value="level">{{ level }} 级</option>
          </select>
        </label>

        <label class="grid gap-2 text-sm text-editorial-text-body">
          <span>展示状态</span>
          <select
            v-model="localDraft.visibilityStatus"
            class="rounded-editorial-md border border-editorial-border bg-editorial-surface px-3 py-2 text-editorial-text-main"
          >
            <option v-for="option in visibilityOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </label>

        <label class="grid gap-2 text-sm text-editorial-text-body">
          <span>可靠性</span>
          <select
            v-model="localDraft.reliabilityStatus"
            class="rounded-editorial-md border border-editorial-border bg-editorial-surface px-3 py-2 text-editorial-text-main"
          >
            <option v-for="option in reliabilityOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </label>
      </div>

      <div class="mt-auto flex justify-end gap-2">
        <button
          type="button"
          class="rounded-editorial-pill border border-editorial-border px-4 py-2 text-sm text-editorial-text-body"
          @click="emit('close')"
        >
          取消
        </button>
        <button
          type="button"
          class="rounded-editorial-pill bg-editorial-accent px-4 py-2 text-sm font-semibold text-editorial-accent-contrast disabled:opacity-60"
          :disabled="isSaving"
          data-ai-timeline-admin-save
          @click="emit('save', { ...localDraft })"
        >
          {{ isSaving ? "保存中..." : "保存" }}
        </button>
      </div>
    </section>
  </teleport>
</template>
