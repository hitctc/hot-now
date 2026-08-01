<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import type { ArticleTitleCandidate, CreativeFinishedArticle } from "../../../services/creativeApi.js";
import { charCount, countWords, formatAnomalyReason, formatReviewReason, titleRiskLabel } from "./articleDetailPresentation.js";

const props = defineProps<{
  article: CreativeFinishedArticle;
  readonly?: boolean;
  isManualArticle: boolean;
  manualTitle: string;
  displayTitles: string[];
  activeTitleIndex: number;
  editingTitleIndex: number | null;
  editingTitleValue: string;
  regenTitleLoading: boolean;
  displayIntros: string[];
  activeIntroIndex: number;
  regenIntroLoading: boolean;
  displaySummaries: string[];
  titleCandidateAt: (index: number) => ArticleTitleCandidate | null;
}>();

const emit = defineEmits<{
  (event: "update:manual-title", value: string): void;
  (event: "save-manual-title"): void;
  (event: "regenerate-title"): void;
  (event: "copy", value: string): void;
  (event: "select-title", index: number): void;
  (event: "start-title-edit", index: number): void;
  (event: "save-title-edit", index: number): void;
  (event: "cancel-title-edit"): void;
  (event: "update:editing-title-value", value: string): void;
  (event: "regenerate-intro"): void;
  (event: "select-intro", index: number): void;
}>();

/** 主审核标记沿用历史文案；多标记列表仍显示代码，方便定位规则来源。 */
function formatPrimaryReviewReason(reason: string): string {
  return ({
    originality_risk_high: "原创风险过高",
    similarity_high: "相似度过高",
    first_person_risk: "第一人称风险",
    c_mode_word_count_insufficient: "C 模式字数不足",
  } as Record<string, string>)[reason] ?? reason;
}

/** 标题切换为编辑态后由子组件负责聚焦输入框，父组件仍保留保存状态。 */
const editingInputRef = ref<{ focus: () => void } | null>(null);
watch(() => props.editingTitleIndex, (index) => {
  if (index !== null) nextTick(() => editingInputRef.value?.focus());
});
</script>

<template>
  <!-- 手动成品只有一个标题，和中栏第一个 H1 双向同步。 -->
  <section v-if="isManualArticle">
    <div class="mb-2 flex items-center justify-between">
      <h3 class="m-0 text-sm font-semibold text-editorial-text-muted">文章标题</h3>
      <span class="text-[11px] text-editorial-text-muted">与中栏一级标题同步</span>
    </div>
    <a-input
      :value="manualTitle"
      :disabled="readonly"
      @update:value="emit('update:manual-title', $event)"
      @blur="emit('save-manual-title')"
      @press-enter="emit('save-manual-title')"
    />
  </section>

  <!-- 异常/审核信息统一展示，避免正常文章重复出现状态判断。 -->
  <section
    v-if="!isManualArticle && (article.status === 'anomaly' || article.status === 'needs_review' || article.anomalyReason || article.reasonCode || article.reasonText || article.manualReviewReason || (article.manualReviewReasons?.length ?? 0) > 0)"
    class="rounded border bg-red-50 border-red-200 px-3 py-2.5 space-y-1"
  >
    <div class="text-xs font-semibold text-red-700">
      {{ article.status === 'anomaly' ? '⚠ 异常' : article.status === 'needs_review' ? '⚠ 待审核' : '⚠ 警告' }}
    </div>
    <div v-if="article.anomalyReason" class="text-xs text-red-600">
      <span class="text-editorial-text-muted">异常原因：</span>{{ formatAnomalyReason(article.anomalyReason) }}
    </div>
    <div v-if="article.reasonCode" class="text-xs text-red-500">
      <span class="text-editorial-text-muted">异常代码：</span>
      <span class="font-mono">{{ article.reasonCode }}</span>
    </div>
    <div v-if="article.reasonText" class="text-xs text-red-500">
      <span class="text-editorial-text-muted">异常说明：</span>{{ article.reasonText }}
    </div>
    <div v-if="article.manualReviewReason || (article.manualReviewReasons?.length ?? 0) > 0" class="text-xs text-yellow-700">
      <span class="text-editorial-text-muted">审核标记：</span>
      <span v-if="article.manualReviewReason">{{ formatPrimaryReviewReason(article.manualReviewReason) }}</span>
      <span v-for="(reason, index) in (article.manualReviewReasons ?? [])" :key="reason">{{ index > 0 || article.manualReviewReason ? '、' : '' }}{{ formatReviewReason(reason) }}</span>
    </div>
  </section>

  <!-- 备选标题 -->
  <section v-if="!isManualArticle && (displayTitles.length > 0 || (!readonly && regenTitleLoading))">
    <div class="mb-2 flex items-center justify-between">
      <div>
        <h3 class="m-0 text-sm font-semibold text-editorial-text-muted">备选标题</h3>
        <p
          v-if="article.pipelineVersion === 'v2' && !article.titleSelectionConfirmed"
          class="mb-0 mt-1 text-xs font-medium text-amber-600"
        >请选择并确认一个发布标题；确认前不能进入可发布状态。</p>
      </div>
      <div v-if="!readonly" class="flex items-center gap-3">
        <a-button
          type="link"
          size="small"
          class="!h-auto !px-2 !py-1 !text-[11px]"
          :loading="regenTitleLoading"
          :disabled="regenTitleLoading"
          @click="emit('regenerate-title')"
        >{{ regenTitleLoading ? '生成中...' : '生成新标题' }}</a-button>
        <a-button type="link" size="small" class="!h-auto !px-2 !py-1 !text-[11px]" @click="emit('copy', displayTitles.join('\n'))">复制全部</a-button>
      </div>
    </div>
    <ul class="m-0 list-none space-y-1 pl-0">
      <li
        v-for="(title, index) in displayTitles"
        :key="index"
        class="group/title relative flex items-center gap-3 rounded-editorial-sm border px-3 py-2 transition-colors"
        :class="index === activeTitleIndex
          ? 'border-editorial-accent ring-2 ring-editorial-ring'
          : 'border-editorial-border hover:border-editorial-link-active/40'"
      >
        <span class="flex-shrink-0 text-[11px] font-bold tabular-nums text-editorial-text-muted">{{ index + 1 }}</span>
        <div v-if="editingTitleIndex === index" class="flex-1">
          <a-input
            ref="editingInputRef"
            :value="editingTitleValue"
            size="small"
            @update:value="emit('update:editing-title-value', $event)"
            @keyup.enter="emit('save-title-edit', index)"
            @keyup.esc="emit('cancel-title-edit')"
            @blur="emit('save-title-edit', index)"
          />
        </div>
        <div v-else class="flex-1">
          <div class="flex items-center gap-2">
            <span class="text-sm leading-6 text-editorial-text-main">{{ title }}</span>
            <span
              v-if="titleCandidateAt(index)?.group_label"
              class="rounded bg-editorial-surface-muted px-1.5 py-0.5 text-[10px] text-editorial-text-muted"
            >{{ titleCandidateAt(index)?.group_label }}</span>
          </div>
          <div v-if="titleCandidateAt(index)" class="mt-1 space-y-0.5 text-[11px] leading-5 text-editorial-text-muted">
            <p class="m-0">点击理由：{{ titleCandidateAt(index)?.click_reason }}</p>
            <p class="m-0">正文兑现：{{ titleCandidateAt(index)?.content_payoff }}</p>
            <p class="m-0">目标读者：{{ titleCandidateAt(index)?.target_reader }} · 标题党风险：{{ titleRiskLabel(titleCandidateAt(index)?.clickbait_risk) }}</p>
          </div>
        </div>
        <span class="flex-shrink-0 text-[10px] text-editorial-text-muted">{{ countWords(editingTitleIndex === index ? editingTitleValue : title) }}字</span>
        <span
          v-if="index === activeTitleIndex && article.titleSelectionConfirmed"
          class="flex-shrink-0 rounded bg-editorial-accent px-1.5 py-0.5 text-[10px] font-semibold text-white"
        >✓ 发布标题</span>
        <span
          v-else-if="index === activeTitleIndex"
          class="flex-shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700"
        >待确认</span>
        <span v-if="index === 0 && index !== activeTitleIndex" class="flex-shrink-0 rounded bg-black/40 px-1 py-0.5 text-[10px] text-white">最新</span>
        <button
          v-if="!readonly && (!article.titleSelectionConfirmed || index !== activeTitleIndex) && editingTitleIndex !== index"
          class="flex-shrink-0 rounded bg-black/50 px-1 py-0.5 text-[10px] text-white hover:!bg-black/70"
          @click.stop="emit('select-title', index)"
        >设为发布标题</button>
        <button
          v-if="!readonly && editingTitleIndex !== index"
          class="flex-shrink-0 rounded bg-black/50 px-1 py-0.5 text-[10px] text-white hover:!bg-black/70"
          @click.stop="emit('start-title-edit', index)"
        >编辑</button>
        <a-button v-if="!readonly && editingTitleIndex !== index" type="link" size="small" class="!h-auto !px-2 !py-1 !text-[11px]" @click="emit('copy', title)">复制</a-button>
      </li>
    </ul>
  </section>

  <!-- 核心立意（只读） -->
  <section v-if="!isManualArticle && article.thesis">
    <div class="mb-2 flex items-center justify-between">
      <h3 class="m-0 text-sm font-semibold text-editorial-text-muted">核心立意</h3>
      <a-button type="link" size="small" class="!h-auto !px-2 !py-1 !text-[11px]" @click="emit('copy', article.thesis!)">复制</a-button>
    </div>
    <p class="m-0 text-sm leading-7 text-editorial-text-body">{{ article.thesis }}</p>
  </section>

  <!-- 导语（始终显示，可重新生成） -->
  <section v-if="!isManualArticle">
    <div class="mb-2 flex items-center justify-between">
      <h3 class="m-0 text-sm font-semibold text-editorial-text-muted">导语</h3>
      <div v-if="!readonly" class="flex items-center gap-3">
        <a-button
          type="link"
          size="small"
          class="!h-auto !px-2 !py-1 !text-[11px]"
          :loading="regenIntroLoading"
          :disabled="regenIntroLoading"
          @click="emit('regenerate-intro')"
        >{{ regenIntroLoading ? '生成中...' : '生成新导语' }}</a-button>
        <a-button v-if="displayIntros.length > 0" type="link" size="small" class="!h-auto !px-2 !py-1 !text-[11px]" @click="emit('copy', displayIntros[activeIntroIndex] ?? '')">复制</a-button>
      </div>
    </div>
    <p v-if="displayIntros.length === 0" class="m-0 text-sm text-editorial-text-muted">暂无导语，点击上方按钮生成</p>
    <ul v-else class="m-0 list-none space-y-1 pl-0">
      <li
        v-for="(text, index) in displayIntros"
        :key="index"
        class="group/intro relative flex items-center gap-3 rounded-editorial-sm border px-3 py-2 transition-colors"
        :class="index === activeIntroIndex
          ? 'border-editorial-accent ring-2 ring-editorial-ring'
          : 'border-editorial-border hover:border-editorial-link-active/40'"
      >
        <span class="flex-shrink-0 text-[11px] font-bold tabular-nums text-editorial-text-muted">{{ index + 1 }}</span>
        <span class="flex-1 text-sm leading-6 text-editorial-text-main">{{ text }}</span>
        <span class="flex-shrink-0 text-[10px] text-editorial-text-muted">{{ countWords(text) }}字</span>
        <span
          v-if="index === activeIntroIndex"
          class="flex-shrink-0 rounded bg-editorial-accent px-1.5 py-0.5 text-[10px] font-semibold text-white"
        >✓ 发布</span>
        <span v-if="index === 0 && index !== activeIntroIndex" class="flex-shrink-0 rounded bg-black/40 px-1 py-0.5 text-[10px] text-white">最新</span>
        <button
          v-if="!readonly && index !== activeIntroIndex"
          class="flex-shrink-0 rounded bg-black/50 px-1 py-0.5 text-[10px] text-white hover:!bg-black/70"
          @click.stop="emit('select-intro', index)"
        >设为发布</button>
      </li>
    </ul>
  </section>

  <!-- 百字摘要（只读展示） -->
  <section v-if="!isManualArticle && displaySummaries.length > 0">
    <div class="mb-2 flex items-center justify-between">
      <h3 class="m-0 text-sm font-semibold text-editorial-text-muted">百字摘要 <span class="font-normal text-[11px] text-editorial-text-muted/60">{{ charCount(displaySummaries[0]) }}字</span></h3>
      <a-button type="link" size="small" class="!h-auto !px-2 !py-1 !text-[11px]" @click="emit('copy', displaySummaries[0] ?? '')">复制</a-button>
    </div>
    <p class="m-0 text-sm leading-7 text-editorial-text-body">{{ displaySummaries[0] }}</p>
  </section>
</template>
