<script setup lang="ts">
import { editorialContentCardClass } from "../../content/contentCardShared";
</script>

<template>
  <a-card
    :class="editorialContentCardClass"
    title="主时间线入选规则"
    size="small"
    data-ai-timeline-rules-panel
  >
    <div class="grid gap-3 md:grid-cols-3">
      <div class="rounded-editorial-card border border-editorial-border bg-editorial-panel/55 p-4">
        <h4 class="m-0 text-sm font-semibold text-editorial-text-main">只收一手来源</h4>
        <p class="m-0 mt-2 text-sm leading-6 text-editorial-text-body">
          官方博客、官方文档、release notes、GitHub release、Hugging Face 官方组织页才算证据。
        </p>
      </div>
      <div class="rounded-editorial-card border border-editorial-border bg-editorial-panel/55 p-4">
        <h4 class="m-0 text-sm font-semibold text-editorial-text-main">不按等级裁剪</h4>
        <p class="m-0 mt-2 text-sm leading-6 text-editorial-text-body">
          主时间线默认展示最近 7 天内 feed 标记为可见且有官方证据的事件；S/A/B/C 等级只影响展示样式和筛选。
        </p>
      </div>
      <div class="rounded-editorial-card border border-editorial-border bg-editorial-panel/55 p-4">
        <h4 class="m-0 text-sm font-semibold text-editorial-text-main">官方前瞻单独标注</h4>
        <p class="m-0 mt-2 text-sm leading-6 text-editorial-text-body">
          重要前瞻可以进入时间线，但必须保留“尚未正式发布”的状态，避免和已发布事件混淆。
        </p>
      </div>
    </div>
  </a-card>
</template>
