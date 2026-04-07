<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";

import ContentEmptyState from "../../components/content/ContentEmptyState.vue";
import ContentHeroCard from "../../components/content/ContentHeroCard.vue";
import ContentPaginationBar from "../../components/content/ContentPaginationBar.vue";
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
  readAiNewPage,
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
const route = useRoute();
const router = useRouter();

function readPageSourceKinds(): string[] | undefined {
  return selectedSourceKinds.value === null ? undefined : selectedSourceKinds.value;
}

function readCurrentPage(): number {
  const rawValue = route.query.page;
  const rawString = Array.isArray(rawValue) ? rawValue[0] : rawValue;
  const parsed = Number(rawString);

  if (!Number.isFinite(parsed)) {
    return 1;
  }

  const normalized = Math.floor(parsed);
  return normalized >= 1 ? normalized : 1;
}

async function replacePageQuery(page: number): Promise<void> {
  await router.replace({
    query: {
      ...route.query,
      page: String(page)
    }
  });
}

function buildFallbackEmptyState() {
  const sourceKinds = selectedSourceKinds.value ?? [];

  return {
    title: sourceKinds.length > 0 ? "当前筛选下没有新的 AI 信号" : "当前还没有可展示的 AI 信号",
    description: sourceKinds.length > 0
      ? "调整来源筛选后再看看，或者稍后刷新，系统会继续收集新的 AI 新闻、模型和事件。"
      : "页面已经准备好了，只是当前还没有新的 AI 信号进入内容池。",
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
    const requestedPage = readCurrentPage();
    const nextModel = await readAiNewPage({
      selectedSourceKinds: options.selectedKinds ?? readPageSourceKinds(),
      sortMode: sortMode.value,
      page: requestedPage
    });
    pageModel.value = nextModel;

    if (nextModel.pagination && nextModel.pagination.page !== requestedPage) {
      await replacePageQuery(nextModel.pagination.page);
    }

    if (selectedSourceKinds.value === null) {
      const nextKinds = nextModel.sourceFilter
        ? deriveInitialSelectedSourceKinds(nextModel.sourceFilter.options, selectedSourceKinds.value)
        : [];
      selectedSourceKinds.value = nextKinds;
      writeStoredContentSourceKinds(nextKinds);
    }
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) {
      loadError.value = "请先登录后再查看 AI 新讯。";
    } else {
      loadError.value = "AI 新讯加载失败，请稍后重试。";
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
  await replacePageQuery(1);
  await loadPage({ selectedKinds: nextKinds, silent: true });
}

async function handleSortModeChange(nextSortMode: ContentSortMode): Promise<void> {
  sortMode.value = nextSortMode;
  writeStoredContentSortMode(nextSortMode);
  await replacePageQuery(1);
  await loadPage({ selectedKinds: readPageSourceKinds(), silent: true });
}

async function handlePaginationChange(nextPage: number): Promise<void> {
  await replacePageQuery(nextPage);
  await loadPage({ selectedKinds: readPageSourceKinds(), silent: true });
}

const listCards = computed(() => pageModel.value?.cards ?? []);
const featuredCard = computed(() => pageModel.value?.featuredCard ?? null);
const visibleResultCount = computed(() => pageModel.value?.pagination?.totalResults ?? listCards.value.length);
const sourceFilter = computed(() => pageModel.value?.sourceFilter ?? null);
const pagination = computed(() => pageModel.value?.pagination ?? null);
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
  <div :class="editorialContentPageClass" data-content-page="ai-new">
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

    <a-skeleton v-if="isLoading" active :paragraph="{ rows: 7 }" />

    <ContentEmptyState v-else-if="displayState" :state="displayState" data-content-empty-state />

    <template v-else-if="pageModel">
      <ContentHeroCard
        v-if="featuredCard"
        :card="featuredCard"
        data-content-section="featured"
      />

      <section
        v-if="listCards.length > 0"
        :class="editorialContentListSectionClass"
        data-content-section="list"
        data-content-list
        data-list-style="database"
      >
        <ContentStandardCard v-for="card in listCards" :key="card.id" :card="card" />
      </section>

      <ContentPaginationBar
        v-if="pagination"
        :page="pagination.page"
        :page-size="pagination.pageSize"
        :total-results="pagination.totalResults"
        :total-pages="pagination.totalPages"
        @change="handlePaginationChange"
      />
    </template>

    <a-spin v-if="isRefreshing" class="self-start" />
  </div>
</template>
