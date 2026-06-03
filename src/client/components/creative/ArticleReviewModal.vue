<script setup lang="ts">
import { ref } from "vue";
import { Modal } from "ant-design-vue";
import type { CreativeFinishedArticle } from "../../services/creativeApi";
import {
  editFinishedArticle,
  deleteFinishedArticle,
} from "../../services/creativeApi";
import { message } from "ant-design-vue";

const props = defineProps<{
  visible: boolean;
  article: CreativeFinishedArticle | null;
}>();

const emit = defineEmits<{
  "update:visible": [value: boolean];
  reviewed: [];
}>();

const rejectReason = ref("");
const submitting = ref(false);

function close(): void {
  rejectReason.value = "";
  emit("update:visible", false);
}

async function handleApprove(): Promise<void> {
  if (!props.article) return;
  submitting.value = true;
  try {
    const res = await editFinishedArticle(props.article.id, {
      status: "ready_for_publish",
      anomalyReason: "",
    });
    if (res.ok) {
      message.success("审核通过");
      emit("reviewed");
      close();
    }
  } catch {
    message.error("操作失败");
  } finally {
    submitting.value = false;
  }
}

async function handleReject(): Promise<void> {
  if (!props.article) return;
  submitting.value = true;
  try {
    const res = await editFinishedArticle(props.article.id, {
      status: "review_rejected",
      anomalyReason: rejectReason.value || "审核不通过",
    });
    if (res.ok) {
      message.success("已标记为审核不通过");
      emit("reviewed");
      close();
    }
  } catch {
    message.error("操作失败");
  } finally {
    submitting.value = false;
  }
}

function handleDelete(): void {
  if (!props.article) return;
  Modal.confirm({
    title: "确认删除",
    content: `确定要删除文章 #${props.article.id} 吗？删除后可从回收站恢复。`,
    okText: "删除",
    okType: "danger",
    cancelText: "取消",
    onOk: async () => {
      try {
        const res = await deleteFinishedArticle(props.article!.id);
        if (res.ok) {
          message.success("已删除");
          emit("reviewed");
          close();
        }
      } catch {
        message.error("删除失败");
      }
    },
  });
}
</script>

<template>
  <a-modal
    :open="visible"
    title="文章审核"
    :footer="null"
    :closable="true"
    :mask-closable="false"
    width="640px"
    centered
    destroy-on-close
    @cancel="close"
  >
    <template v-if="article">
      <!-- 文章基本信息 -->
      <div class="mb-3 space-y-1">
        <div class="text-sm font-semibold">{{ article.titles?.[0] ?? article.thesis ?? '未命名' }}</div>
        <div class="text-xs text-editorial-text-muted">
          ID: {{ article.id }} · 模式: {{ article.mode || '-' }} · 来源: {{ article.sourceName || '-' }}
        </div>
      </div>

      <!-- 审核原因 -->
      <div v-if="article.anomalyReason" class="mb-3 rounded border border-orange-400 bg-orange-50 px-3 py-2 text-xs text-orange-800">
        ⚠ {{ article.anomalyReason }}
      </div>
      <div v-if="article.manualReviewReasons?.length" class="mb-3 rounded border border-yellow-400 bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
        审核标记：{{ article.manualReviewReasons.join('、') }}
      </div>

      <!-- 正文预览 -->
      <div class="mb-3 max-h-60 overflow-y-auto rounded border border-editorial-border bg-editorial-bg-page px-3 py-2 text-xs leading-5 text-editorial-text-body whitespace-pre-wrap">
        {{ article.contentMarkdown?.slice(0, 2000) }}{{ (article.contentMarkdown?.length ?? 0) > 2000 ? '...' : '' }}
      </div>

      <!-- 审核不通过原因输入 -->
      <div class="mb-4">
        <label class="mb-1 block text-xs text-editorial-text-muted">审核不通过原因（可选）</label>
        <a-textarea
          v-model:value="rejectReason"
          :rows="2"
          placeholder="填写拒绝原因，方便后续追溯"
          class="!text-xs"
        />
      </div>

      <!-- 操作按钮 -->
      <div class="flex items-center justify-end gap-2">
        <a-button size="small" @click="close">取消</a-button>
        <a-button size="small" danger :loading="submitting" @click="handleDelete">删除文章</a-button>
        <a-button size="small" :loading="submitting" @click="handleReject">审核不通过</a-button>
        <a-button size="small" type="primary" :loading="submitting" @click="handleApprove">审核通过</a-button>
      </div>
    </template>
  </a-modal>
</template>
