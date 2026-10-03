<!-- 文章详情弹窗：展示标题/立意/摘要 + 正文编辑器（左编辑右预览），底部悬浮工具栏 -->
<template>
  <a-modal
    :open="open"
    :closable="true"
    :mask-closable="true"
    :destroy-on-close="true"
    width="100%"
    centered
    :wrap-class-name="articleDetailWrapClass"
    :mask-style="articleDetailMaskStyle"
    :body-style="{ padding: '24px', overflowY: 'auto' }"
    :z-index="1000"
    @cancel="handleClose"
  >
    <template #title>
      <ArticleDetailHeader
        v-if="article && !props.loading"
        :article="article"
        @copy-id="copyArticleId"
        @open-source="$emit('openSourceItem', $event)"
      />
    </template>

    <template #footer>
      <ArticleDetailFooter
        v-if="article && !props.loading"
        :article="article"
        :readonly="props.readonly"
        :saving="saving"
        :wechat-copying="wechatCopying"
        :can-push="canPush"
        :missing-conditions="missingConditions"
        @close="handleClose"
        @save="handleSave"
        @copy-format="copyAsWechatFormat"
        @review="reviewModalVisible = true"
        @mark-publishable="handleDetailMarkPublishable"
        @cancel-publishable="handleDetailCancelPublishable"
        @restore="handleDetailRestore"
        @discard="handleDetailDiscard"
        @push="saveAndPush"
      />
    </template>

    <div v-if="props.loading" class="flex min-h-[240px] flex-col items-center justify-center gap-3" role="status" aria-live="polite" data-testid="article-detail-loading">
      <a-spin size="large" />
      <span class="text-sm text-editorial-text-muted">正在加载文章详情…</span>
    </div>
    <template v-else-if="article">
      <div class="article-detail-content flex flex-col gap-6">
        <ArticlePlanningSections
          :article="article"
          :readonly="props.readonly"
          :is-manual-article="isManualArticle"
          :manual-title="manualTitle"
          :display-titles="displayTitles"
          :active-title-index="activeTitleIndex"
          :editing-title-index="editingTitleIdx"
          :editing-title-value="editingTitleValue"
          :regen-title-loading="regenTitleLoading"
          :display-intros="displayIntros"
          :active-intro-index="activeIntroIndex"
          :regen-intro-loading="regenIntroLoading"
          :display-summaries="displaySummaries"
          :regen-code-image-keywords-loading="regenCodeImageKeywordsLoading"
          :title-candidate-at="titleCandidateAt"
          @update:manual-title="manualTitle = $event"
          @save-manual-title="saveManualTitle"
          @regenerate-title="handleRegenTitle"
          @copy="copyText"
          @select-title="selectTitle"
          @start-title-edit="startEditTitle"
          @save-title-edit="saveTitleEdit"
          @cancel-title-edit="cancelEditTitle"
          @update:editing-title-value="editingTitleValue = $event"
          @regenerate-intro="handleRegenIntro"
          @select-intro="selectIntro"
          @regenerate-code-image-keywords="handleRegenCodeImageKeywords"
          @cancel-text-task="handleCancelTextTask"
        />

        <ArticleSimilaritySection
          :is-manual-article="isManualArticle"
          :article-id="article.id"
          :similarity-check="article.similarityCheck"
        />

        <!-- 写作流程时间线 -->
        <StepTraceTimeline
          v-if="!isManualArticle"
          :step-trace="article?.stepTrace ?? null"
          :stop-step="article?.stopStep"
          :reason-text="article?.reasonText"
        />

        <ArticleSupplementalSections
          :article="article"
          :readonly="props.readonly"
          :is-manual-article="isManualArticle"
          :source-cover-url="sourceCoverUrl"
          :generating-comments="generatingComments"
          :generating-author-extensions="generatingAuthorExtensions"
          @copy="copyText"
          @generate-comments="handleGenerateComments"
          @generate-author-extensions="handleGenerateAuthorExtensions"
        />

        <CodeImageCardsSection
          :article="article"
          :readonly="props.readonly"
          :generating="codeImagesGenerating"
          @generate="handleGenerateCodeImages"
          @copy-url="copyCodeImageUrl"
        />

        <ArticleShortImagePromptSection
          :prompts="article.imagePrompts ?? []"
          :readonly="props.readonly"
          @copy="copyPrompt"
          @save="saveLegacyShortPrompt"
          @dirty-change="setPromptDirty"
        />

        <ArticleImageWorkflowSections
          :article="article"
          :readonly="props.readonly"
          :article-images="articleImages"
          :display-cover-images="displayCoverImages"
          :active-cover-index="activeCoverIndex"
          :inline-image-slot-count="inlineImageSlotCount"
          :total-image-slot-count="totalImageSlotCount"
          :cover-prompt-generating="coverPromptGenerating"
          :inline-prompts-generating="inlinePromptsGenerating"
          :inline-prompt-generating-index="inlinePromptGeneratingIndex"
          :uploading-cover="uploadingCover"
          :uploading-inline="uploadingInline"
          :luna-image-eligible="lunaImageEligible"
          :luna-image-jobs="lunaImageJobs"
          @copy-prompt="copyPrompt"
          @prompt-dirty="setPromptDirty"
          @generate-cover-prompt="handleGenerateCoverPrompt"
          @upload-cover="handleUploadCover"
          @select-cover="selectCoverImage"
          @save-cover-prompt="saveCoverPrompt"
          @generate-inline-prompts="handleGenerateInlinePrompts"
          @upload-inline="handleUploadInlineImage"
          @save-inline-prompt="saveInlinePrompt"
          @generate-luna-image="handleGenerateLunaImage"
        />

        <!-- 正文编辑器：普通态与全屏态共用同一份编辑状态。 -->
        <section v-if="article.contentMarkdown || article.humanMarkdown || isManualArticle" ref="editorSectionRef" class="editor-section">
          <ArticleEditorPanel
            :article="article"
            :readonly="props.readonly"
            :is-manual-article="isManualArticle"
            :human-content="humanContent"
            :ai-draft="editContent"
            :preview-html="activePreviewHtml"
            :preview-enabled="previewEnabled"
            @preview-visibility-change="mobilePreviewOpen = $event"
            :preview-label="activePreviewLabel"
            :preview-theme-options="previewThemeOptions"
            :active-preview-theme="activePreviewTheme"
            :sync-scroll-enabled="syncScrollEnabled"
            :auto-focus-mode-enabled="autoFocusModeEnabled"
            :saved-at-label="savedAtLabel"
            :focus-mode="focusMode"
            :saving="saving"
            :wechat-copying="wechatCopying"
            :can-push="canPush"
            :missing-conditions="missingConditions"
            :dynamic-height="dynamicEditorHeight"
            :editor-fullscreen="editorFullscreen"
            @update:human-content="humanContent = $event"
            @update:ai-draft="editContent = $event"
            @select-theme="handlePreviewThemeSelection"
            @copy-ai="copyAiDraft"
            @copy-plain="copyAiDraftAsPlainText"
            @toggle-sync-scroll="toggleSyncScroll"
            @toggle-auto-focus-mode="toggleAutoFocusMode"
            @toggle-fullscreen="toggleEditorFullscreen"
            @copy-format="copyAsWechatFormat"
            @review="reviewModalVisible = true"
            @mark-publishable="handleDetailMarkPublishable"
            @cancel-publishable="handleDetailCancelPublishable"
            @restore="handleDetailRestore"
            @discard="handleDetailDiscard"
            @push="saveAndPush"
            @unlock-focus-mode="unlockFocusMode"
            @save="handleSave"
          />
        </section>
      </div>
    </template>

  </a-modal>

  <!-- 审核弹窗（独立于详情弹窗，z-index 更高） -->
  <Teleport to="body">
    <ArticleReviewModal
      v-model:visible="reviewModalVisible"
      :article="article"
      @reviewed="handleReviewDone"
    />
  </Teleport>

  <!-- 手动生图弹窗 -->
  <ImageActionModal
    v-model:open="imageActionVisible"
    :article="article"
    @done="handleImageActionDone"
  />
</template>

<script setup lang="ts">
import ArticleEditorPanel from "./article-detail/ArticleEditorPanel.vue";
import ArticlePlanningSections from "./article-detail/ArticlePlanningSections.vue";
import ArticleSimilaritySection from "./article-detail/ArticleSimilaritySection.vue";
import ArticleSupplementalSections from "./article-detail/ArticleSupplementalSections.vue";
import CodeImageCardsSection from "./article-detail/CodeImageCardsSection.vue";
import ArticleImageWorkflowSections from "./article-detail/ArticleImageWorkflowSections.vue";
import ArticleShortImagePromptSection from "./article-detail/ArticleShortImagePromptSection.vue";
import ArticleDetailFooter from "./article-detail/ArticleDetailFooter.vue";
import ArticleDetailHeader from "./article-detail/ArticleDetailHeader.vue";
import StepTraceTimeline from "./StepTraceTimeline.vue";
import ArticleReviewModal from "./ArticleReviewModal.vue";
import ImageActionModal from "./ImageActionModal.vue";
import { useArticleDetailDrawer, type ArticleDetailDrawerProps, type ArticleDetailDrawerEvents } from "./useArticleDetailDrawer.js";
const props = defineProps<ArticleDetailDrawerProps>();
const emit = defineEmits<ArticleDetailDrawerEvents>();
const {
  isManualArticle,
  previewThemeOptions,
  activePreviewTheme,
  articleDetailMaskStyle,
  articleDetailWrapClass,
  autoFocusModeEnabled,
  dynamicEditorHeight,
  editorFullscreen,
  focusMode,
  syncScrollEnabled,
  toggleAutoFocusMode,
  toggleEditorFullscreen,
  toggleSyncScroll,
  unlockFocusMode,
  copyArticleId,
  copyPrompt,
  codeImagesGenerating,
  handleGenerateCodeImages,
  copyCodeImageUrl,
  setPromptDirty,
  editContent,
  humanContent,
  saving,
  articleImages,
  displayCoverImages,
  activeCoverIndex,
  inlineImageSlotCount,
  totalImageSlotCount,
  coverPromptGenerating,
  inlinePromptsGenerating,
  inlinePromptGeneratingIndex,
  uploadingCover,
  uploadingInline,
  lunaImageEligible,
  lunaImageJobs,
  handleGenerateCoverPrompt,
  handleUploadCover,
  selectCoverImage,
  saveCoverPrompt,
  handleGenerateInlinePrompts,
  handleUploadInlineImage,
  saveInlinePrompt,
  saveLegacyShortPrompt,
  handleGenerateLunaImage,
  savedAtLabel,
  manualTitle,
  regenTitleLoading,
  activeTitleIndex,
  editingTitleIdx,
  editingTitleValue,
  displayTitles,
  titleCandidateAt,
  handleRegenTitle,
  saveManualTitle,
  selectTitle,
  startEditTitle,
  cancelEditTitle,
  saveTitleEdit,
  regenIntroLoading,
  activeIntroIndex,
  displayIntros,
  displaySummaries,
  handleRegenIntro,
  selectIntro,
  regenCodeImageKeywordsLoading,
  handleRegenCodeImageKeywords,
  handleCancelTextTask,
  reviewModalVisible,
  imageActionVisible,
  handleReviewDone,
  handleImageActionDone,
  generatingComments,
  handleGenerateComments,
  generatingAuthorExtensions,
  handleGenerateAuthorExtensions,
  sourceCoverUrl,
  handleSave,
  saveAndPush,
  handleClose,
  mobilePreviewOpen,
  previewEnabled,
  activePreviewHtml,
  activePreviewLabel,
  handlePreviewThemeSelection,
  wechatCopying,
  copyAsWechatFormat,
  copyText,
  copyAiDraft,
  copyAiDraftAsPlainText,
  canPush,
  missingConditions,
  handleDetailMarkPublishable,
  handleDetailCancelPublishable,
  handleDetailDiscard,
  handleDetailRestore,
  editorSectionRef,
} = useArticleDetailDrawer(props, emit);

</script>

<style src="./article-detail/articleDetailDrawer.css"></style>
