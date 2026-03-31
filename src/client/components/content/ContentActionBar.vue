<script setup lang="ts">
import type { ContentReaction } from "../../services/contentApi";

const props = defineProps<{
  isFavorited: boolean;
  reaction: ContentReaction;
  isBusy?: boolean;
  feedbackOpen: boolean;
  statusText?: string | null;
}>();

const emit = defineEmits<{
  favorite: [];
  reaction: [reaction: "like" | "dislike"];
  toggleFeedback: [];
}>();
</script>

<template>
  <div class="content-action-bar">
    <a-space wrap size="small">
      <a-button
        data-content-action="favorite"
        size="small"
        :type="isFavorited ? 'primary' : 'default'"
        :loading="isBusy"
        @click="emit('favorite')"
      >
        {{ isFavorited ? "已收藏" : "收藏" }}
      </a-button>
      <a-button
        data-content-action="reaction"
        data-reaction="like"
        size="small"
        :type="reaction === 'like' ? 'primary' : 'default'"
        :loading="isBusy"
        @click="emit('reaction', 'like')"
      >
        点赞
      </a-button>
      <a-button
        data-content-action="reaction"
        data-reaction="dislike"
        size="small"
        :type="reaction === 'dislike' ? 'primary' : 'default'"
        :loading="isBusy"
        @click="emit('reaction', 'dislike')"
      >
        点踩
      </a-button>
      <a-button data-content-action="feedback-panel-toggle" size="small" :ghost="!feedbackOpen" @click="emit('toggleFeedback')">
        {{ feedbackOpen ? "收起反馈" : "补充反馈" }}
      </a-button>
    </a-space>

    <a-typography-text v-if="statusText" class="content-action-bar__status" type="secondary">
      {{ statusText }}
    </a-typography-text>
  </div>
</template>

<style scoped>
.content-action-bar {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.content-action-bar__status {
  font-size: 12px;
}
</style>
