<script setup lang="ts">
import type { SettingsContentFilterRule } from "../../../services/settingsApi";
import { readFilterOverviewItems, readFilterWeightItems } from "./viewRulesPageShared";

defineProps<{
  aiFilterRule: SettingsContentFilterRule | null;
  hotFilterRule: SettingsContentFilterRule | null;
}>();
</script>

<template>
  <section class="flex flex-col gap-3" data-settings-section="filter-overview">
    <div class="flex flex-col gap-1">
      <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">当前筛选总览</p>
      <h2 class="m-0 text-xl font-semibold text-editorial-text-main">先看看现在是怎么排的</h2>
      <p class="m-0 text-sm leading-6 text-editorial-text-body">
        这里先告诉你现在 AI 新讯和 AI 热点是按什么规则排的。你改完下面的开关再保存，系统就会按新设置来排。
      </p>
    </div>

    <div class="grid gap-3 lg:grid-cols-2" data-settings-section="overview">
      <article
        v-if="aiFilterRule"
        class="editorial-spotlight-card rounded-editorial-lg border border-editorial-border-strong px-4 py-4"
        data-filter-overview-card="ai"
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">AI 新讯</p>
            <p class="mt-2 mb-0 text-base font-semibold text-editorial-text-main">{{ aiFilterRule.displayName }}</p>
          </div>
          <a-tag color="blue">现在按这个来</a-tag>
        </div>
        <p class="mt-3 mb-0 text-sm leading-6 text-editorial-text-body">{{ aiFilterRule.summary }}</p>
        <div class="mt-3 flex flex-wrap gap-2">
          <a-tag v-for="item in readFilterOverviewItems(aiFilterRule)" :key="`ai:${item}`">{{ item }}</a-tag>
        </div>
        <div class="mt-3 flex flex-wrap gap-2">
          <a-tag v-for="item in readFilterWeightItems(aiFilterRule)" :key="`ai-weight:${item}`" color="default">{{ item }}</a-tag>
        </div>
      </article>

      <article
        v-if="hotFilterRule"
        class="editorial-spotlight-card rounded-editorial-lg border border-editorial-border-strong px-4 py-4"
        data-filter-overview-card="hot"
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">AI 热点</p>
            <p class="mt-2 mb-0 text-base font-semibold text-editorial-text-main">{{ hotFilterRule.displayName }}</p>
          </div>
          <a-tag color="blue">现在按这个来</a-tag>
        </div>
        <p class="mt-3 mb-0 text-sm leading-6 text-editorial-text-body">{{ hotFilterRule.summary }}</p>
        <div class="mt-3 flex flex-wrap gap-2">
          <a-tag v-for="item in readFilterOverviewItems(hotFilterRule)" :key="`hot:${item}`">{{ item }}</a-tag>
        </div>
        <div class="mt-3 flex flex-wrap gap-2">
          <a-tag v-for="item in readFilterWeightItems(hotFilterRule)" :key="`hot-weight:${item}`" color="default">{{ item }}</a-tag>
        </div>
      </article>
    </div>
  </section>
</template>
