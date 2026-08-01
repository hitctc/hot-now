<script setup lang="ts">
import type { CreativeFinishedArticle } from "../../../services/creativeApi.js";
import { getAvailableActions } from "../articleStatusShared.js";

defineProps<{
  article: CreativeFinishedArticle;
  readonly?: boolean;
  saving: boolean;
  wechatCopying: boolean;
  canPush: boolean;
  missingConditions: string[];
}>();

const emit = defineEmits<{
  (event: "save"): void;
  (event: "copy-format"): void;
  (event: "review"): void;
  (event: "mark-publishable"): void;
  (event: "cancel-publishable"): void;
  (event: "restore"): void;
  (event: "discard"): void;
  (event: "push"): void;
}>();
</script>

<template>
  <div v-if="!readonly" class="article-detail-footer">
    <!-- 编辑操作直接生效；确认型操作仍交给父抽屉弹二次确认。 -->
    <div class="article-detail-footer__group footer-group--edit">
      <a-tooltip :mouse-enter-delay="0.5" title="保存正文内容到数据库">
        <a-button :loading="saving" @click="emit('save')">保存</a-button>
      </a-tooltip>
      <a-tooltip :mouse-enter-delay="0.5" title="按选定主题渲染后复制到剪贴板，可粘贴到公众号编辑器">
        <a-button :loading="wechatCopying" @click="emit('copy-format')">复制格式</a-button>
      </a-tooltip>
    </div>

    <div class="article-detail-footer__divider" />

    <div class="article-detail-footer__group footer-group--flow">
      <a-button v-if="article.status === 'needs_review'" @click="emit('review')">审核</a-button>
      <a-button v-if="getAvailableActions(article).some((action) => action.type === 'mark_publishable')" @click="emit('mark-publishable')">标记可推送</a-button>
      <a-tooltip
        v-else-if="getAvailableActions(article).some((action) => action.type === 'mark_publishable_disabled')"
        :title="getAvailableActions(article).find((action) => action.type === 'mark_publishable_disabled')!.missing.join('、')"
      >
        <a-button disabled>不可推送</a-button>
      </a-tooltip>
      <a-button v-if="getAvailableActions(article).some((action) => action.type === 'cancel_publishable')" @click="emit('cancel-publishable')">取消推送</a-button>
      <a-button v-if="article.deletedAt" type="primary" @click="emit('restore')">恢复</a-button>
      <a-button v-else danger @click="emit('discard')">废弃</a-button>
      <a-tooltip v-if="canPush" :mouse-enter-delay="0.5" title="自动保存正文后推送到微信公众号草稿箱">
        <a-button :loading="saving" @click="emit('push')">推送草稿箱</a-button>
      </a-tooltip>
      <a-tooltip v-else-if="article.status !== 'needs_review'" :mouse-enter-delay="0.3">
        <template #title>{{ missingConditions.join('；') }}</template>
        <a-button disabled>推送草稿箱</a-button>
      </a-tooltip>
    </div>
  </div>
</template>
