<!-- 手动生图操作弹窗：选择 provider/codex 流程 + 8 种 action，始终可用 -->
<script setup lang="ts">

import { useImageActionModal, type ImageActionModalProps, type ImageActionModalEvents } from "./useImageActionModal.js";
const props = defineProps<ImageActionModalProps>();
const emit = defineEmits<ImageActionModalEvents>();
const {
  firstTitle,
  selectedFlow,
  actionGroups,
  selectedAction,
  inlineIndex,
  selectedDef,
  indexMissing,
  missingInfo,
  missingLoading,
  submitting,
  lastResult,
  handleSubmit,
  handleOpen,
  handleClose,
  flowOptions,
} = useImageActionModal(props, emit);

</script>

<template>
  <a-modal
    :open="open"
    :closable="true"
    :mask-closable="true"
    :destroy-on-close="true"
    width="480px"
    centered
    :body-style="{ padding: '24px' }"
    title="手动生图"
    @after-open-change="(v: boolean) => v && handleOpen()"
    @cancel="handleClose"
  >
    <template v-if="article" #footer>
      <a-button @click="handleClose">关闭</a-button>
      <a-button
        type="primary"
        :loading="submitting"
        :disabled="!selectedAction || indexMissing"
        @click="handleSubmit"
      >执行</a-button>
    </template>

    <div v-if="article" class="space-y-4">
      <!-- 文章信息 -->
      <div class="text-xs text-editorial-text-muted">
        文章 #{{ article.id }}
        <span v-if="firstTitle" class="ml-1">{{ firstTitle }}</span>
      </div>

      <!-- 缺图提示 -->
      <div v-if="missingLoading" class="text-xs text-editorial-text-muted">加载缺图信息…</div>
      <div v-else-if="missingInfo" class="rounded border border-editorial-border bg-editorial-bg-page px-3 py-2 text-xs space-y-0.5">
        <div v-if="missingInfo.missingCover?.length" class="text-orange-600">封面图缺失</div>
        <div v-if="missingInfo.missingInline?.length" class="text-orange-600">
          正文图缺失：{{ missingInfo.missingInline.map(m => `#${m.imageIndex}`).join('、') }}
        </div>
        <div v-if="!missingInfo.missingCover?.length && !missingInfo.missingInline?.length" class="text-green-600">图片齐全</div>
      </div>

      <!-- 流程选择 -->
      <div>
        <div class="mb-1 text-xs font-medium text-editorial-text-muted">生图流程</div>
        <a-radio-group v-model:value="selectedFlow" size="small" :options="flowOptions" />
      </div>

      <!-- action 选择 -->
      <div>
        <div class="mb-1 text-xs font-medium text-editorial-text-muted">操作</div>
        <div class="space-y-2">
          <div v-for="group in actionGroups" :key="group.title">
            <div class="mb-1 text-[10px] text-editorial-text-muted/70">{{ group.title }}</div>
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="act in group.actions"
                :key="act.value"
                class="rounded border px-2 py-1 text-xs transition-colors"
                :class="selectedAction === act.value
                  ? 'border-editorial-accent bg-editorial-accent/10 text-editorial-accent font-medium'
                  : 'border-editorial-border hover:border-editorial-accent/40 text-editorial-text-body'"
                @click="selectedAction = act.value"
              >{{ act.label }}</button>
            </div>
          </div>
        </div>
      </div>

      <!-- 指定正文图 slot -->
      <div v-if="selectedDef?.needIndex" class="flex items-center gap-2">
        <span class="text-xs text-editorial-text-muted">正文图 slot：</span>
        <a-input-number v-model:value="inlineIndex" :min="1" :max="20" size="small" class="!w-20" placeholder="序号" />
      </div>

      <!-- action 说明 -->
      <div v-if="selectedDef" class="rounded bg-editorial-bg-page px-3 py-1.5 text-xs text-editorial-text-muted">
        {{ selectedDef.desc }}
      </div>

      <!-- 执行结果 -->
      <template v-if="lastResult">
        <div class="border-t border-editorial-border pt-3">
          <div class="mb-1 text-xs font-medium text-editorial-text-muted">执行结果</div>
          <!-- 汇总 -->
          <div v-if="lastResult.summary" class="mb-2 flex gap-3 text-xs">
            <span class="text-green-600">成功 {{ lastResult.summary.success }}</span>
            <span class="text-yellow-600">跳过 {{ lastResult.summary.skipped }}</span>
            <span class="text-red-500">失败 {{ lastResult.summary.failed }}</span>
          </div>
          <!-- 逐条 -->
          <div v-if="lastResult.results?.length" class="space-y-1">
            <div
              v-for="(r, i) in lastResult.results"
              :key="i"
              class="flex items-center gap-2 rounded border border-editorial-border px-2 py-1 text-xs"
            >
              <span class="font-mono text-editorial-text-muted">
                {{ r.type === 'cover' ? '封面' : `正文#${r.imageIndex}` }}
              </span>
              <span
                :class="r.status === 'success' ? 'text-green-600' : r.status === 'failed' ? 'text-red-500' : 'text-yellow-600'"
              >{{ r.status === 'success' ? '成功' : r.status === 'failed' ? `失败：${r.error}` : `跳过：${r.reason}` }}</span>
            </div>
          </div>
          <!-- 整体错误 -->
          <div v-if="lastResult.error && !lastResult.results?.length" class="text-xs text-red-500">
            {{ lastResult.error }}
          </div>
        </div>
      </template>
    </div>
  </a-modal>
</template>
