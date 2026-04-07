<script setup lang="ts">
import { computed, onMounted, ref } from "vue";

import ContentEmptyState from "../../components/content/ContentEmptyState.vue";
import ContentSourceFilterBar from "../../components/content/ContentSourceFilterBar.vue";
import ContentSortControl from "../../components/content/ContentSortControl.vue";
import ContentStandardCard from "../../components/content/ContentStandardCard.vue";
import {
  editorialContentListSectionClass,
  editorialContentPageClass
} from "../../components/content/contentCardShared";
import { HttpError } from "../../services/http";
import {
  deriveInitialSelectedSourceKinds,
  readAiHotPage,
  readStoredContentSortMode,
  readStoredContentSourceKinds,
  writeStoredContentSortMode,
  writeStoredContentSourceKinds,
  type ContentSortMode,
  type ContentPageModel
} from "../../services/contentApi";

const isLoading = ref(true);
const isRefreshing = ref(false);
const loadError = ref<string | null>(null);
const pageModel = ref<ContentPageModel | null>(null);
const selectedSourceKinds = ref<string[] | null>(readStoredContentSourceKinds());
const sortMode = ref<ContentSortMode>(readStoredContentSortMode() ?? "published_at");

function readPageSourceKinds(): string[] | undefined {
  return selectedSourceKinds.value === null ? undefined : selectedSourceKinds.value;
}

function buildFallbackEmptyState() {
  const sourceKinds = selectedSourceKinds.value ?? [];

  return {
    title: sourceKinds.length > 0 ? "当前筛选下没有热点内容" : "当前还没有可展示的热点内容",
    description: sourceKinds.length > 0
      ? "调整来源筛选后再看看，或者稍后刷新，系统会继续聚合已经形成热度的 AI 内容。"
      : "页面已经准备好了，只是当前还没有热点内容进入内容池。",
    tone: sourceKinds.length > 0 ? "filtered" : "default"
  } as const;
}

function buildErrorState(message: string) {
  return {
    title: "页面加载失败",
    description: message,
    tone: "degraded"
  } as const;
}

async function loadPage(options: { selectedKinds?: string[]; silent?: boolean } = {}): Promise<void> {
  if (options.silent) {
    isRefreshing.value = true;
  } else {
    isLoading.value = true;
    loadError.value = null;
  }

  try {
    const nextModel = await readAiHotPage(options.selectedKinds ?? readPageSourceKinds(), sortMode.value);
    pageModel.value = nextModel;

    if (selectedSourceKinds.value === null) {
      const nextKinds = nextModel.sourceFilter
        ? deriveInitialSelectedSourceKinds(nextModel.sourceFilter.options, selectedSourceKinds.value)
        : [];
      selectedSourceKinds.value = nextKinds;
      writeStoredContentSourceKinds(nextKinds);
    }
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) {
      loadError.value = "请先登录后再查看 AI 热点。";
    } else {
      loadError.value = "AI 热点加载失败，请稍后重试。";
    }
  } finally {
    if (options.silent) {
      isRefreshing.value = false;
    } else {
      isLoading.value = false;
    }
  }
}

async function handleSourceKindsChange(nextKinds: string[]): Promise<void> {
  selectedSourceKinds.value = nextKinds;
  writeStoredContentSourceKinds(nextKinds);
  await loadPage({ selectedKinds: nextKinds, silent: true });
}

async function handleSortModeChange(nextSortMode: ContentSortMode): Promise<void> {
  sortMode.value = nextSortMode;
  writeStoredContentSortMode(nextSortMode);
  await loadPage({ selectedKinds: readPageSourceKinds(), silent: true });
}

const sourceFilter = computed(() => pageModel.value?.sourceFilter ?? null);
const listCards = computed(() => pageModel.value?.cards ?? []);
const visibleResultCount = computed(() => listCards.value.length);
const displayState = computed(() => {
  if (!pageModel.value && loadError.value) {
    return buildErrorState(loadError.value);
  }

  if (pageModel.value?.emptyState) {
    return pageModel.value.emptyState;
  }

  if (listCards.value.length > 0) {
    return null;
  }

  return buildFallbackEmptyState();
});
const hasLoadError = computed(() => loadError.value !== null);

onMounted(() => {
  void loadPage();
});
</script>

<template>
  <div :class="editorialContentPageClass" data-content-page="ai-hot">
    <a-alert v-if="hasLoadError && pageModel" type="warning" show-icon :message="loadError" banner />

    <div v-if="sourceFilter" class="flex flex-col gap-3">
      <ContentSourceFilterBar
        :options="sourceFilter.options"
        :selected-source-kinds="selectedSourceKinds ?? sourceFilter.selectedSourceKinds"
        :visible-result-count="visibleResultCount"
        @change="handleSourceKindsChange"
      />

      <ContentSortControl
        :sort-mode="sortMode"
        @change="handleSortModeChange"
      />
    </div>

    <a-skeleton v-if="isLoading" active :paragraph="{ rows: 6 }" />

    <ContentEmptyState v-else-if="displayState" :state="displayState" data-content-empty-state />

    <template v-else-if="pageModel">
      <section
        v-if="listCards.length > 0"
        :class="editorialContentListSectionClass"
        data-content-section="list"
        data-content-list
        data-list-style="database"
      >
        <ContentStandardCard v-for="card in listCards" :key="card.id" :card="card" />
      </section>
    </template>

    <a-spin v-if="isRefreshing" class="self-start" />
  </div>
</template>
