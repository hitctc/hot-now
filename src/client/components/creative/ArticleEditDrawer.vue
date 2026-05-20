<!-- 编辑文章弹窗：标题/立意/摘要 + Markdown 正文编辑器 + 保存/复制 -->
<template>
  <a-modal
    :open="open"
    :footer="null"
    :closable="true"
    :mask-closable="false"
    :destroy-on-close="true"
    width="90%"
    centered
    wrap-class-name="article-edit-modal"
    :body-style="{ maxHeight: 'calc(100vh - 110px)', overflowY: 'auto', padding: '24px' }"
    @cancel="$emit('update:open', false)"
  >
    <template #title>
      <span class="text-base font-semibold">编辑文章</span>
    </template>

    <template v-if="article">
      <!-- 顶部元信息 -->
      <div class="flex items-center gap-3 mb-4">
        <span class="edit-modal__status-tag" :class="`status-${article.status}`">
          {{ statusLabel(article.status) }}
        </span>
        <span class="text-xs text-editorial-text-muted">{{ formatLocalTime(article.createdAt) }}</span>
      </div>

      <!-- 标题展示 -->
      <div v-if="firstTitle" class="text-lg font-bold text-editorial-text-main mb-4">{{ firstTitle }}</div>

      <!-- 立意和摘要 -->
      <div class="grid grid-cols-1 gap-3 mb-4 sm:grid-cols-2">
        <div>
          <label class="mb-1 block text-[13px] text-editorial-text-muted">核心立意</label>
          <a-textarea v-model:value="editForm.thesis" :rows="2" placeholder="核心立意" />
        </div>
        <div>
          <label class="mb-1 block text-[13px] text-editorial-text-muted">百字摘要</label>
          <a-textarea v-model:value="editForm.summary100" :rows="3" placeholder="百字摘要" />
        </div>
      </div>

      <!-- 正文编辑器 -->
      <div class="mb-4" style="height: calc(100vh - 460px); min-height: 260px;">
        <ArticleMarkdownEditor v-model="editForm.contentMarkdown" />
      </div>

      <!-- 底部操作栏 -->
      <div class="flex items-center justify-between gap-2 border-t border-editorial-border pt-4">
        <div class="flex items-center gap-2">
          <a-select
            v-model:value="selectedTheme"
            :options="wechatThemeOptions"
            style="width: 140px"
          />
          <a-button
            :loading="copyingWechat"
            @click="handleCopyWechat"
          >
            复制公众号格式
          </a-button>
        </div>
        <div class="flex gap-2">
          <a-button @click="$emit('update:open', false)">取消</a-button>
          <a-button type="primary" :loading="saving" @click="handleSave">
            保存
          </a-button>
        </div>
      </div>
    </template>
  </a-modal>
</template>

<script setup lang="ts">
import { ref, watch, computed } from "vue";
import { message } from "ant-design-vue";
import ArticleMarkdownEditor from "./ArticleMarkdownEditor.vue";
import {
  editFinishedArticle,
  renderWechatFormat,
  wechatThemeOptions,
  type CreativeFinishedArticle,
  type WechatThemeId,
} from "../../services/creativeApi.js";

const props = defineProps<{
  open: boolean;
  article: CreativeFinishedArticle | null;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
  saved: [];
}>();

// 编辑表单
const editForm = ref({ contentMarkdown: "", thesis: "", summary100: "" });
const saving = ref(false);
const copyingWechat = ref(false);
const selectedTheme = ref<WechatThemeId>("bauhaus");

// 文章打开时初始化表单
watch(() => props.open, (val) => {
  if (val && props.article) {
    editForm.value = {
      contentMarkdown: props.article.contentMarkdown || "",
      thesis: props.article.thesis || "",
      summary100: props.article.summary100 || "",
    };
  }
});

const firstTitle = computed(() => {
  if (!props.article?.titles) return "";
  const titles = typeof props.article.titles === "string"
    ? JSON.parse(props.article.titles)
    : props.article.titles;
  return Array.isArray(titles) && titles.length > 0 ? titles[0] : "";
});

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    generated: "已生成",
    ready_for_publish: "可推送",
    wechat_draft: "已推送草稿",
    anomaly: "异常",
  };
  return map[status] ?? status;
}

function formatLocalTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
  } catch {
    return iso;
  }
}

async function handleSave(): Promise<void> {
  if (!props.article) return;
  saving.value = true;
  try {
    await editFinishedArticle(props.article.id, {
      contentMarkdown: editForm.value.contentMarkdown,
      thesis: editForm.value.thesis,
      summary100: editForm.value.summary100,
    });
    message.success("保存成功");
    emit("update:open", false);
    emit("saved");
  } catch {
    message.error("保存失败");
  } finally {
    saving.value = false;
  }
}

async function handleCopyWechat(): Promise<void> {
  if (!props.article) return;
  copyingWechat.value = true;
  try {
    const res = await renderWechatFormat(props.article.id, selectedTheme.value);
    if (!res.ok || !res.html) {
      message.error("渲染失败");
      return;
    }
    const htmlBlob = new Blob([res.html], { type: "text/html" });
    const textBlob = new Blob([editForm.value.contentMarkdown], { type: "text/plain" });
    await navigator.clipboard.write([
      new ClipboardItem({ "text/html": htmlBlob, "text/plain": textBlob }),
    ]);
    message.success("已复制到剪贴板");
  } catch {
    message.error("复制失败");
  } finally {
    copyingWechat.value = false;
  }
}
</script>

<style>
.article-edit-modal .ant-modal-body {
  background: #ffffff;
}

.edit-modal__status-tag {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  background: #f0f0f0;
  color: #666;
}

.edit-modal__status-tag.status-ready_for_publish {
  background: #e6fffb;
  color: #13c2c2;
}

.edit-modal__status-tag.status-wechat_draft {
  background: #f0f5ff;
  color: #2f54eb;
}
</style>
