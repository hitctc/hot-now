<script setup lang="ts">
import {
  editorialContentControlButtonActiveClass,
  editorialContentControlButtonClass,
  editorialContentControlButtonIdleClass
} from "./contentCardShared";

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
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap gap-2">
      <a-button
        data-content-action="favorite"
        size="small"
        :class="[
          editorialContentControlButtonClass,
          isFavorited ? editorialContentControlButtonActiveClass : editorialContentControlButtonIdleClass
        ]"
        :loading="isBusy"
        @click="emit('favorite')"
      >
        {{ isFavorited ? "已收藏" : "收藏" }}
      </a-button>
      <a-button
        data-content-action="reaction"
        data-reaction="like"
        size="small"
        :class="[
          editorialContentControlButtonClass,
          reaction === 'like' ? editorialContentControlButtonActiveClass : editorialContentControlButtonIdleClass
        ]"
        :loading="isBusy"
        @click="emit('reaction', 'like')"
      >
        点赞
      </a-button>
      <a-button
        data-content-action="reaction"
        data-reaction="dislike"
        size="small"
        :class="[
          editorialContentControlButtonClass,
          reaction === 'dislike' ? editorialContentControlButtonActiveClass : editorialContentControlButtonIdleClass
        ]"
        :loading="isBusy"
        @click="emit('reaction', 'dislike')"
      >
        点踩
      </a-button>
      <a-button
        data-content-action="feedback-panel-toggle"
        size="small"
        :class="[
          editorialContentControlButtonClass,
          feedbackOpen ? editorialContentControlButtonActiveClass : editorialContentControlButtonIdleClass
        ]"
        @click="emit('toggleFeedback')"
      >
        {{ feedbackOpen ? "收起反馈" : "补充反馈" }}
      </a-button>
    </div>

    <p v-if="statusText" class="m-0 text-xs leading-5 text-editorial-text-muted">
      {{ statusText }}
    </p>
  </div>
</template>
