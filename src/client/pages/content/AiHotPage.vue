<script setup lang="ts">
import { computed, onMounted, ref } from "vue";

import ContentEmptyState from "../../components/content/ContentEmptyState.vue";
import ContentSourceFilterBar from "../../components/content/ContentSourceFilterBar.vue";
import ContentStandardCard from "../../components/content/ContentStandardCard.vue";
import { HttpError } from "../../services/http";
import {
  readAiHotPage,
  readStoredContentSourceKinds,
  writeStoredContentSourceKinds,
  type ContentCard,
  type ContentPageModel
} from "../../services/contentApi";

const isLoading = ref(true);
const isRefreshing = ref(false);
const loadError = ref<string | null>(null);
const pageModel = ref<ContentPageModel | null>(null);
const selectedSourceKinds = ref<string[] | null>(readStoredContentSourceKinds());

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
    const nextModel = await readAiHotPage(options.selectedKinds ?? readPageSourceKinds());
    pageModel.value = nextModel;

    if (selectedSourceKinds.value === null) {
      const nextKinds = nextModel.sourceFilter?.selectedSourceKinds ?? [];
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

function isDuplicatedFeaturedCard(card: ContentCard | null, cards: ContentCard[]): boolean {
  return Boolean(card && cards[0] && cards[0].id === card.id);
}

const sourceFilter = computed(() => pageModel.value?.sourceFilter ?? null);
const featuredCard = computed(() => pageModel.value?.featuredCard ?? null);
const listCards = computed(() => {
  const cards = pageModel.value?.cards ?? [];

  if (cards.length === 0) {
    return featuredCard.value ? [featuredCard.value] : [];
  }

  if (!featuredCard.value) {
    return cards;
  }

  return isDuplicatedFeaturedCard(featuredCard.value, cards) ? cards.slice(1) : cards;
});
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
  <a-space direction="vertical" size="large" class="content-page content-page--ai-hot" data-content-page="ai-hot">
    <a-card class="content-page__intro" :bordered="false">
      <a-space direction="vertical" size="small">
        <a-typography-text class="content-page__kicker" type="secondary">AI 热点</a-typography-text>
        <a-typography-title :level="2" class="content-page__title">AI 热度已经起来了，再来这里看聚合结果</a-typography-title>
        <a-typography-paragraph class="content-page__description">
          这里承接已经形成热度的 AI 新闻、模型、事件和智能体，按卡片流快速浏览，再决定要不要深入。
        </a-typography-paragraph>
      </a-space>
    </a-card>

    <a-alert v-if="hasLoadError && pageModel" type="warning" show-icon :message="loadError" banner />

    <div v-if="sourceFilter" class="content-page__filter-shell" data-content-filter-shell>
      <ContentSourceFilterBar
        :options="sourceFilter.options"
        :selected-source-kinds="selectedSourceKinds ?? sourceFilter.selectedSourceKinds"
        @change="handleSourceKindsChange"
      />
    </div>

    <a-skeleton v-if="isLoading" active :paragraph="{ rows: 6 }" />

    <ContentEmptyState v-else-if="displayState" :state="displayState" data-content-empty-state />

    <template v-else-if="pageModel">
      <ContentEmptyState
        v-if="listCards.length === 0 && displayState"
        :state="displayState"
        data-content-empty-state
      />

      <div v-else class="content-page__list" data-content-section="list">
        <ContentStandardCard v-for="card in listCards" :key="card.id" :card="card" />
      </div>
    </template>

    <a-spin v-if="isRefreshing" class="content-page__refresh" />
  </a-space>
</template>

<style scoped>
.content-page {
  width: 100%;
}

.content-page__intro {
  border-radius: 24px;
  border: 1px solid var(--editorial-border);
  background: linear-gradient(135deg, rgba(35, 82, 255, 0.08), rgba(255, 106, 42, 0.05)),
    var(--editorial-bg-panel);
  box-shadow: var(--editorial-shadow-page);
}

.content-page__kicker {
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.content-page__title {
  margin: 0;
}

.content-page__description {
  margin: 0;
  max-width: 64ch;
  color: var(--editorial-text-body);
  line-height: 1.8;
}

.content-page__list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.content-page__filter-shell {
  position: sticky;
  top: 24px;
  z-index: 12;
  width: 100%;
}

.content-page__refresh {
  align-self: flex-start;
}

@media (max-width: 900px) {
  .content-page__filter-shell {
    top: 88px;
  }
}
</style>
