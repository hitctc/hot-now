<script setup lang="ts">
import { editorialContentIntroSectionClass } from "../../content/contentCardShared";
</script>

<template>
  <section :class="editorialContentIntroSectionClass" data-settings-intro="view-rules">
    <div
      class="pointer-events-none absolute right-[-56px] top-[-72px] h-48 w-48 rounded-full bg-[radial-gradient(circle,_rgba(122,162,255,0.22),_transparent_72%)] blur-3xl"
      aria-hidden="true"
    />
    <div class="relative z-[1] flex flex-col gap-4">
      <div class="flex flex-wrap items-center gap-2">
        <span class="rounded-editorial-pill border border-editorial-border bg-editorial-panel/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-editorial-text-muted">
          Rule Studio
        </span>
        <span class="text-xs leading-6 text-editorial-text-muted">先看真实生效规则，再调权重、反馈池和厂商配置。</span>
      </div>
      <div class="flex flex-col gap-2">
        <h2 class="m-0 text-[28px] font-semibold tracking-[-0.04em] text-editorial-text-main">
          内容筛选工作台
        </h2>
        <p class="m-0 max-w-3xl text-sm leading-7 text-editorial-text-body">
          这页负责解释 AI 新讯和 AI 热点当前的真实排序逻辑，并把开关、分值、反馈池和 LLM 配置收在同一套控制面板里。
        </p>
      </div>
    </div>
  </section>
</template>
