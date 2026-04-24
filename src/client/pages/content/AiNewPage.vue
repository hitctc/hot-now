<script setup lang="ts">
import ContentFeedPageShell from "../../components/content/ContentFeedPageShell.vue";
import type { ContentFeedPageConfig } from "../../components/content/contentFeedPageShared";
import { readAiNewPage } from "../../services/contentApi";

const aiNewPageConfig: ContentFeedPageConfig = {
  authErrorMessage: "请先登录后再查看 AI 新讯。",
  emptyDefaultDescription: "页面已经准备好了，只是当前还没有新的 AI 信号进入内容池。",
  emptyDefaultTitle: "当前还没有可展示的 AI 信号",
  emptyFilteredDescription: "调整来源筛选后再看看，或者稍后刷新，系统会继续收集新的 AI 新闻、模型和事件。",
  emptyFilteredTitle: "当前筛选下没有新的 AI 信号",
  loadErrorMessage: "AI 新讯加载失败，请稍后重试。",
  pageKey: "ai-new",
  showFeaturedCard: true,
  skeletonRows: 7,
  stageAccent: "cyan",
  stageBadge: "AI New Stage",
  stageDescription: "这里优先收拢最近 24 小时内值得先看的新模型、新产品和新动作，减少你在内容流里自己做第一轮筛选的成本。",
  stageKicker: "优先展示最新进入内容池的 AI 动态与信号。",
  stageStrategyLabel: "当前 AI 新讯：",
  stageTitle: "AI 新讯的第一阅读层"
};
</script>

<template>
  <ContentFeedPageShell :config="aiNewPageConfig" :read-page="readAiNewPage" />
</template>
