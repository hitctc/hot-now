<script setup lang="ts">
import ContentFeedPageShell from "../../components/content/ContentFeedPageShell.vue";
import type { ContentFeedPageConfig } from "../../components/content/contentFeedPageShared";
import { readAiHotPage } from "../../services/contentApi";

const aiHotPageConfig: ContentFeedPageConfig = {
  authErrorMessage: "请先登录后再查看 AI 热点。",
  emptyDefaultDescription: "页面已经准备好了，只是当前还没有热点内容进入内容池。",
  emptyDefaultTitle: "当前还没有可展示的热点内容",
  emptyFilteredDescription: "调整来源筛选后再看看，或者稍后刷新，系统会继续聚合已经形成热度的 AI 内容。",
  emptyFilteredTitle: "当前筛选下没有热点内容",
  loadErrorMessage: "AI 热点加载失败，请稍后重试。",
  pageKey: "ai-hot",
  showFeaturedCard: false,
  skeletonRows: 6,
  stageAccent: "blue",
  stageBadge: "AI Hot Stage",
  stageDescription: "这里不只看发布时间，而是把来源权重、热点词、新鲜度和综合分重新压到一个更适合快速判断的热度序列里。",
  stageKicker: "聚焦已经形成讨论热度和持续传播势能的内容。",
  stageStrategyLabel: "当前 AI 热点：",
  stageTitle: "AI 热点的聚焦列表"
};
</script>

<template>
  <ContentFeedPageShell :config="aiHotPageConfig" :read-page="readAiHotPage" />
</template>
