<script setup lang="ts">
import { aiSignalExamples, heatSignalExamples } from "./viewRulesPageShared";

defineProps<{
  aiPrioritySourceNames: string[];
  hotPrioritySourceNames: string[];
}>();
</script>

<template>
  <section class="flex flex-col gap-3" data-settings-section="filter-glossary">
    <div class="flex flex-col gap-1">
      <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">名词解释</p>
      <h2 class="m-0 text-xl font-semibold text-editorial-text-main">这些词到底是什么意思</h2>
      <p class="m-0 text-sm leading-6 text-editorial-text-body">
        下面这些解释就是系统现在真实在用的判断方式。你以后自己调开关时，可以直接照着这里理解，不用再猜术语是什么意思。
      </p>
    </div>

    <div class="grid gap-3 lg:grid-cols-2">
      <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel px-4 py-4">
        <p class="m-0 text-sm font-semibold text-editorial-text-main">AI 新讯里的重点来源</p>
        <p class="mt-2 mb-0 text-sm leading-6 text-editorial-text-body">
          这不是你手动勾选的来源，而是系统预先认定更适合放在 “AI 新讯” 里的来源。打开相关开关后，这些来源的内容会更容易排前面。
        </p>
        <div class="mt-3 flex flex-wrap gap-2">
          <a-tag v-for="sourceName in aiPrioritySourceNames" :key="`ai-priority:${sourceName}`">{{ sourceName }}</a-tag>
        </div>
      </article>

      <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel px-4 py-4">
        <p class="m-0 text-sm font-semibold text-editorial-text-main">AI 热点里的重点来源</p>
        <p class="mt-2 mb-0 text-sm leading-6 text-editorial-text-body">
          这也是系统预先认定更适合放在 “AI 热点” 里的来源。打开相关开关后，这些来源的内容会更容易排前面。
        </p>
        <div class="mt-3 flex flex-wrap gap-2">
          <a-tag v-for="sourceName in hotPrioritySourceNames" :key="`hot-priority:${sourceName}`">{{ sourceName }}</a-tag>
        </div>
      </article>

      <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel px-4 py-4">
        <p class="m-0 text-sm font-semibold text-editorial-text-main">什么叫 AI 相关内容</p>
        <p class="mt-2 mb-0 text-sm leading-6 text-editorial-text-body">
          系统会看标题、摘要、正文里是不是更像在讲 AI，比如模型、Agent、产品更新、应用案例、大模型、智能体这些内容。越像 AI 内容，越容易排前面。
        </p>
        <div class="mt-3 flex flex-wrap gap-2">
          <a-tag v-for="keyword in aiSignalExamples" :key="`ai-signal:${keyword}`">{{ keyword }}</a-tag>
        </div>
      </article>

      <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel px-4 py-4">
        <p class="m-0 text-sm font-semibold text-editorial-text-main">什么叫热点词</p>
        <p class="mt-2 mb-0 text-sm leading-6 text-editorial-text-body">
          系统会看标题、摘要、正文里有没有一组内置热词，比如发布、上线、更新、快讯、周报、热点、洞察，以及 launch、release、update、analysis 这些词。命中越多，越容易排前面。
        </p>
        <div class="mt-3 flex flex-wrap gap-2">
          <a-tag v-for="keyword in heatSignalExamples" :key="`heat-signal:${keyword}`">{{ keyword }}</a-tag>
        </div>
      </article>

      <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel px-4 py-4">
        <p class="m-0 text-sm font-semibold text-editorial-text-main">什么叫新内容</p>
        <p class="mt-2 mb-0 text-sm leading-6 text-editorial-text-body">
          就是发布时间更近的内容。系统现在主要按发布时间判断，越新越容易排前面；时间越久，这一项的影响会越来越小。
        </p>
      </article>

      <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel px-4 py-4">
        <p class="m-0 text-sm font-semibold text-editorial-text-main">什么叫综合分</p>
        <p class="mt-2 mb-0 text-sm leading-6 text-editorial-text-body">
          这不是人工打分，而是系统把重点来源、内容完整度、AI 相关度、热点词、新内容这些因素一起算出来的总分。打开“按综合分排序”后，会优先按这个总分排。
        </p>
      </article>
    </div>
  </section>
</template>
