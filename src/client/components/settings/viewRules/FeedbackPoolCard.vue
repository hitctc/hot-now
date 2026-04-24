<script setup lang="ts">
import EditorialEmptyState from "../../content/EditorialEmptyState.vue";
import {
  editorialContentCardClass,
  editorialContentControlButtonClass,
  editorialContentControlButtonDangerClass,
  editorialContentControlButtonIdleClass
} from "../../content/contentCardShared";
import type { SettingsFeedbackPoolItem } from "../../../services/settingsApi";
import { formatDateTime } from "./viewRulesPageShared";

defineProps<{
  feedbackPool: SettingsFeedbackPoolItem[];
  isClearPending: boolean;
  isDeletePending: (feedbackId: number) => boolean;
}>();

defineEmits<{
  "clear": [];
  "copy": [];
  "delete": [feedbackId: number];
}>();
</script>

<template>
  <section data-settings-section="feedback-pool">
    <a-card :class="editorialContentCardClass" title="反馈池" size="small" data-view-rules-section="feedback-pool">
      <template #extra>
        <div class="flex flex-wrap items-center justify-end gap-2">
          <a-button
            :class="[editorialContentControlButtonClass, editorialContentControlButtonIdleClass]"
            data-action="copy-feedback-pool"
            :disabled="feedbackPool.length === 0"
            @click="$emit('copy')"
          >
            复制全部反馈
          </a-button>
          <a-button
            :class="[editorialContentControlButtonClass, editorialContentControlButtonDangerClass]"
            data-action="clear-feedback-pool"
            :disabled="feedbackPool.length === 0 || isClearPending"
            :loading="isClearPending"
            @click="$emit('clear')"
          >
            清空全部反馈
          </a-button>
        </div>
      </template>

      <div class="flex flex-col gap-4">
        <p class="m-0 text-sm leading-6 text-editorial-text-body">
          这里集中查看、整理和清理内容页写入的反馈词。当前版本不会再把这些反馈词转成草稿、正式规则或重算任务。
        </p>

        <EditorialEmptyState
          v-if="feedbackPool.length === 0"
          data-empty-state="feedback-pool"
          title="反馈池为空"
          description="反馈池为空，内容页提交的新反馈词会显示在这里。"
        />

        <div v-else class="flex flex-col gap-3">
          <article
            v-for="entry in feedbackPool"
            :key="entry.id"
            data-feedback-row
            :data-feedback-id="entry.id"
            class="flex flex-col gap-3 rounded-editorial-md border border-editorial-border bg-editorial-panel px-4 py-4"
          >
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <h3 class="m-0 text-base font-semibold text-editorial-text-main">
                    {{ entry.contentTitle }}
                  </h3>
                  <a-tag>{{ entry.sourceName }}</a-tag>
                </div>
                <p class="mt-2 mb-0 text-xs leading-5 text-editorial-text-muted">
                  更新时间：{{ formatDateTime(entry.updatedAt) }}
                </p>
                <a
                  :href="entry.canonicalUrl"
                  target="_blank"
                  rel="noreferrer"
                  class="mt-2 inline-block break-all text-xs text-editorial-text-muted underline underline-offset-2"
                >
                  {{ entry.canonicalUrl }}
                </a>
              </div>
              <a-button
                :class="[editorialContentControlButtonClass, editorialContentControlButtonDangerClass]"
                data-action="delete-feedback"
                :data-feedback-delete="entry.id"
                :loading="isDeletePending(entry.id)"
                @click="$emit('delete', entry.id)"
              >
                删除
              </a-button>
            </div>

            <div class="rounded-editorial-md border border-editorial-border bg-editorial-link px-4 py-3">
              <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">反馈词</p>
              <p class="mt-2 mb-0 text-sm leading-6 text-editorial-text-main">
                {{ entry.freeText?.trim() || "这条反馈暂时只保存了结构化信息，还没有补充自由文本。" }}
              </p>
            </div>

            <div class="flex flex-wrap gap-2 text-xs leading-5 text-editorial-text-body">
              <a-tag v-if="entry.suggestedEffect?.trim()">{{ `建议效果：${entry.suggestedEffect.trim()}` }}</a-tag>
              <a-tag v-if="entry.strengthLevel?.trim()">{{ `强度：${entry.strengthLevel.trim()}` }}</a-tag>
              <a-tag v-for="keyword in entry.positiveKeywords" :key="`positive:${entry.id}:${keyword}`">
                {{ `正向：${keyword}` }}
              </a-tag>
              <a-tag v-for="keyword in entry.negativeKeywords" :key="`negative:${entry.id}:${keyword}`">
                {{ `负向：${keyword}` }}
              </a-tag>
            </div>
          </article>
        </div>
      </div>
    </a-card>
  </section>
</template>
