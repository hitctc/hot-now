<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { message } from "ant-design-vue";

import {
  saveArticlePerformanceFeedback,
  type ArticleRewriteLevel,
  type CreativeFinishedArticle
} from "../../services/creativeApi.js";

const props = defineProps<{
  open: boolean;
  article: CreativeFinishedArticle | null;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
  saved: [];
}>();

const isSaving = ref(false);
const deliveredUsers = ref<number | null>(null);
const readUsers = ref<number | null>(null);
const shareUsers = ref<number | null>(null);
const newFollowers = ref<number | null>(null);
const rewriteLevel = ref<ArticleRewriteLevel | null>(null);

const titleSnapshot = computed(() => {
  if (!props.article) return "—";
  return props.article.performanceTitleSnapshot || getSelectedTitle(props.article);
});

/**
 * 读取文章当前选中的标题，供弹窗预览；真正落库的快照仍由服务端生成。
 */
function getSelectedTitle(article: CreativeFinishedArticle): string {
  const rawTitles = article.titles;
  let titles: string[] = [];
  if (Array.isArray(rawTitles)) {
    titles = rawTitles;
  } else if (rawTitles) {
    try {
      const parsed = JSON.parse(rawTitles);
      titles = Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      titles = [];
    }
  }
  return titles[article.titleIndex] ?? titles[0] ?? "无标题";
}

/**
 * 打开弹窗时载入已有反馈，允许用户更正数字而不必重新录入全部字段。
 */
function resetFormFromArticle(): void {
  const article = props.article;
  deliveredUsers.value = article?.performanceDeliveredUsers ?? null;
  readUsers.value = article?.performanceReadUsers ?? null;
  shareUsers.value = article?.performanceShareUsers ?? null;
  newFollowers.value = article?.performanceNewFollowers ?? null;
  rewriteLevel.value = article?.performanceRewriteLevel ?? null;
}

watch(
  () => [props.open, props.article?.id] as const,
  ([open]) => {
    if (open) resetFormFromArticle();
  },
  { immediate: true }
);

/**
 * 校验并保存第一阶段试验数据；空的新关注人数按“未记录”处理。
 */
async function handleSave(): Promise<void> {
  if (!props.article) return;
  if (deliveredUsers.value == null || readUsers.value == null || shareUsers.value == null || rewriteLevel.value == null) {
    message.warning("请填写送达、阅读、分享人数和人工复述程度");
    return;
  }

  isSaving.value = true;
  try {
    await saveArticlePerformanceFeedback(props.article.id, {
      deliveredUsers: deliveredUsers.value,
      readUsers: readUsers.value,
      shareUsers: shareUsers.value,
      newFollowers: newFollowers.value,
      rewriteLevel: rewriteLevel.value
    });
    message.success("文章效果已记录");
    emit("saved");
    emit("update:open", false);
  } catch {
    message.error("效果数据保存失败");
  } finally {
    isSaving.value = false;
  }
}
</script>

<template>
  <a-modal
    :open="open"
    title="记录文章效果"
    ok-text="保存"
    cancel-text="取消"
    :confirm-loading="isSaving"
    :width="520"
    @ok="handleSave"
    @cancel="emit('update:open', false)"
  >
    <div class="mb-4 rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-800">
      第一阶段只观察 10 篇。建议发布约 3 天后填写一次，目标是 1 分钟内完成；不确定的新关注人数可以留空。
    </div>

    <div class="mb-4">
      <div class="text-xs text-editorial-text-muted">自动保存的最终标题快照</div>
      <div class="mt-1 text-sm font-medium text-editorial-text-main">{{ titleSnapshot }}</div>
    </div>

    <a-form layout="vertical">
      <div class="grid grid-cols-2 gap-x-4">
        <a-form-item label="送达 / 曝光人数" required>
          <a-input-number v-model:value="deliveredUsers" :min="0" :precision="0" class="!w-full" />
        </a-form-item>
        <a-form-item label="阅读人数" required>
          <a-input-number v-model:value="readUsers" :min="0" :precision="0" class="!w-full" />
        </a-form-item>
        <a-form-item label="分享人数" required>
          <a-input-number v-model:value="shareUsers" :min="0" :precision="0" class="!w-full" />
        </a-form-item>
        <a-form-item label="新增关注人数（可选）">
          <a-input-number v-model:value="newFollowers" :min="0" :precision="0" class="!w-full" />
        </a-form-item>
      </div>

      <a-form-item label="人工复述程度" required>
        <a-radio-group v-model:value="rewriteLevel">
          <a-radio-button value="light">轻度</a-radio-button>
          <a-radio-button value="medium">中度</a-radio-button>
          <a-radio-button value="heavy">大幅</a-radio-button>
        </a-radio-group>
      </a-form-item>
    </a-form>
  </a-modal>
</template>
