<script setup lang="ts">
import { message } from "ant-design-vue";
import type { CreativeFinishedArticle } from '../../services/creativeApi';

const props = defineProps<{
  visible: boolean;
  article: CreativeFinishedArticle | null;
  themeLabel: string;
  defaultAccountName: string;
  loading: boolean;
  error: string;
}>();

defineEmits<{
  'update:visible': [value: boolean];
  confirm: [];
}>();

function getFirstTitle(article: CreativeFinishedArticle): string {
  if (!article.titles) return '未命名文章';
  let titles: string[] = [];
  if (Array.isArray(article.titles)) {
    titles = article.titles;
  } else if (typeof article.titles === 'string') {
    try {
      const parsed = JSON.parse(article.titles);
      if (Array.isArray(parsed)) titles = parsed;
    } catch { /* ignore */ }
  }
  return titles.length > 0 ? titles[0] : '未命名文章';
}

async function copyError(): Promise<void> {
  try {
    await navigator.clipboard.writeText(props.error);
    message.success("已复制错误信息");
  } catch {
    message.error("复制失败");
  }
}
</script>

<template>
  <a-modal
    :open="visible"
    title="确认推送到草稿箱"
    :confirm-loading="loading"
    ok-text="确认推送"
    cancel-text="取消"
    @cancel="$emit('update:visible', false)"
    @ok="$emit('confirm')"
  >
    <div v-if="article" style="line-height: 2;">
      <p><strong>文章：</strong>{{ getFirstTitle(article) }}</p>
      <p><strong>目标公众号：</strong>{{ defaultAccountName || '未配置' }}</p>
      <p><strong>使用主题：</strong>{{ themeLabel }}</p>
      <a-typography-text type="secondary">
        推送将在草稿箱新增一篇，如有旧版本需手动在公众号后台清理。
      </a-typography-text>
    </div>

    <!-- 错误展示区 -->
    <div v-if="error" class="push-error-section">
      <div class="push-error-header">
        <span>推送失败</span>
        <a-button type="link" size="small" class="!p-0 !text-[11px]" @click="copyError">复制错误信息</a-button>
      </div>
      <div class="push-error-body">{{ error }}</div>
    </div>
  </a-modal>
</template>

<style scoped>
.push-error-section {
  margin-top: 16px;
  border: 1px solid #ffa39e;
  border-radius: 6px;
  background: #fff2f0;
  overflow: hidden;
}

.push-error-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: #ffccc7;
  font-size: 13px;
  font-weight: 600;
  color: #a8071a;
}

.push-error-body {
  padding: 10px 12px;
  font-size: 12px;
  line-height: 1.8;
  color: #5c0011;
  word-break: break-all;
  max-height: 160px;
  overflow-y: auto;
}
</style>
