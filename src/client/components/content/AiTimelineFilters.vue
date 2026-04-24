<script setup lang="ts">
import { ref, watch } from "vue";

import type { AiTimelineEventType, AiTimelineFilterOptions } from "../../services/aiTimelineApi";
import { editorialContentFloatingPanelClass } from "./contentCardShared";

const props = defineProps<{
  eventTypes: AiTimelineEventType[];
  companies: AiTimelineFilterOptions["companies"];
  selectedEventType: string;
  selectedCompany: string;
  searchKeyword: string;
  loading?: boolean;
}>();

const emit = defineEmits<{
  changeEventType: [value: string];
  changeCompany: [value: string];
  search: [value: string];
  clear: [];
}>();

const draftSearchKeyword = ref(props.searchKeyword);

watch(
  () => props.searchKeyword,
  (nextValue) => {
    draftSearchKeyword.value = nextValue;
  }
);

function readSelectValue(event: Event): string {
  return event.target instanceof HTMLSelectElement ? event.target.value : "";
}
</script>

<template>
  <section
    :class="[editorialContentFloatingPanelClass, 'flex flex-col gap-4 px-4 py-4']"
    data-ai-timeline-filters
  >
    <div class="flex flex-col gap-3 min-[760px]:grid min-[760px]:grid-cols-[minmax(140px,180px)_minmax(160px,220px)_1fr_auto] min-[760px]:items-end">
      <label class="flex flex-col gap-1.5">
        <span class="text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">事件类型</span>
        <select
          class="h-10 rounded-editorial-sm border border-editorial-border bg-editorial-panel px-3 text-sm text-editorial-text-main outline-none transition focus:border-editorial-border-strong"
          :value="selectedEventType"
          :disabled="loading"
          data-ai-timeline-event-type-filter
          @change="emit('changeEventType', readSelectValue($event))"
        >
          <option value="">全部事件</option>
          <option v-for="eventType in eventTypes" :key="eventType" :value="eventType">
            {{ eventType }}
          </option>
        </select>
      </label>

      <label class="flex flex-col gap-1.5">
        <span class="text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">公司</span>
        <select
          class="h-10 rounded-editorial-sm border border-editorial-border bg-editorial-panel px-3 text-sm text-editorial-text-main outline-none transition focus:border-editorial-border-strong"
          :value="selectedCompany"
          :disabled="loading"
          data-ai-timeline-company-filter
          @change="emit('changeCompany', readSelectValue($event))"
        >
          <option value="">全部公司</option>
          <option v-for="company in companies" :key="company.key" :value="company.key">
            {{ company.name }}（{{ company.eventCount }}）
          </option>
        </select>
      </label>

      <form class="flex flex-col gap-1.5" @submit.prevent="emit('search', draftSearchKeyword)">
        <span class="text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">标题搜索</span>
        <div class="flex gap-2">
          <input
            v-model="draftSearchKeyword"
            class="h-10 min-w-0 flex-1 rounded-editorial-sm border border-editorial-border bg-editorial-panel px-3 text-sm text-editorial-text-main outline-none transition placeholder:text-editorial-text-muted focus:border-editorial-border-strong"
            type="search"
            placeholder="搜索官方事件标题"
            :disabled="loading"
            data-ai-timeline-search
          />
          <button
            type="submit"
            class="shrink-0 rounded-editorial-sm border border-editorial-border bg-editorial-panel px-3 text-sm font-semibold text-editorial-text-main transition hover:bg-editorial-link-active disabled:cursor-not-allowed disabled:opacity-60"
            :disabled="loading"
            data-ai-timeline-search-submit
          >
            搜索
          </button>
        </div>
      </form>

      <button
        type="button"
        class="h-10 rounded-editorial-sm border border-editorial-border bg-transparent px-3 text-sm font-semibold text-editorial-text-body transition hover:bg-editorial-link-active hover:text-editorial-text-main disabled:cursor-not-allowed disabled:opacity-60"
        :disabled="loading"
        data-ai-timeline-clear
        @click="emit('clear')"
      >
        清空
      </button>
    </div>
  </section>
</template>
