<script setup lang="ts">
import type { CreativeFinishedArticle } from '../../services/creativeApi';

defineProps<{
  visible: boolean;
  article: CreativeFinishedArticle | null;
  themeLabel: string;
  defaultAccountName: string;
  loading: boolean;
}>();

defineEmits<{
  'update:visible': [value: boolean];
  confirm: [];
}>();

// 从 titles JSON 字段取第一项作为展示标题，兼容 string 和已解析数组两种格式
function getFirstTitle(article: CreativeFinishedArticle): string {
  if (!article.titles) return '未命名文章';
  // titles 可能是 JSON 字符串或已解析的数组
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
  </a-modal>
</template>
