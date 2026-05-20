<!-- 编辑抽屉：左右分屏编辑 + 主题预览 + 保存/复制 -->
<template>
  <a-drawer
    :open="open"
    :width="'90%'"
    title="编辑文章"
    placement="right"
    :closable="true"
    :mask-closable="false"
    @close="$emit('update:open', false)"
  >
    <template v-if="article">
      <!-- 顶部元信息 -->
      <div class="edit-drawer__meta">
        <span class="edit-drawer__status-tag" :class="`status-${article.status}`">
          {{ statusLabel(article.status) }}
        </span>
        <span class="edit-drawer__time">{{ formatLocalTime(article.createdAt) }}</span>
      </div>

      <!-- 标题展示 -->
      <div v-if="firstTitle" class="edit-drawer__title">{{ firstTitle }}</div>

      <!-- 立意和摘要 -->
      <div class="edit-drawer__fields">
        <div class="edit-drawer__field">
          <label>核心立意</label>
          <a-textarea v-model:value="editForm.thesis" :rows="2" placeholder="核心立意" />
        </div>
        <div class="edit-drawer__field">
          <label>百字摘要</label>
          <a-textarea v-model:value="editForm.summary100" :rows="3" placeholder="百字摘要" />
        </div>
      </div>

      <!-- 正文编辑器 -->
      <div class="edit-drawer__editor-wrapper">
        <ArticleMarkdownEditor v-model="editForm.contentMarkdown" />
      </div>

      <!-- 底部工具栏 -->
      <div class="edit-drawer__toolbar">
        <div class="edit-drawer__toolbar-left">
          <a-select
            v-model:value="selectedTheme"
            :options="wechatThemeOptions"
            style="width: 140px"
            data-testid="edit-drawer-theme-select"
          />
          <a-button
            :loading="copyingWechat"
            @click="handleCopyWechat"
            data-testid="edit-drawer-copy-wechat"
          >
            复制公众号格式
          </a-button>
        </div>
        <div class="edit-drawer__toolbar-right">
          <a-button @click="$emit('update:open', false)">取消</a-button>
          <a-button type="primary" :loading="saving" @click="handleSave">
            保存
          </a-button>
        </div>
      </div>
    </template>
  </a-drawer>
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
    // 用编辑中的最新内容生成微信格式
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

<style scoped>
.edit-drawer__meta {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.edit-drawer__status-tag {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  background: #f0f0f0;
  color: #666;
}

.edit-drawer__status-tag.status-ready_for_publish {
  background: #e6fffb;
  color: #13c2c2;
}

.edit-drawer__status-tag.status-wechat_draft {
  background: #f0f5ff;
  color: #2f54eb;
}

.edit-drawer__time {
  color: #999;
  font-size: 13px;
}

.edit-drawer__title {
  font-size: 18px;
  font-weight: 700;
  margin-bottom: 16px;
  color: #1a1a1a;
}

.edit-drawer__fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 16px;
}

.edit-drawer__field label {
  display: block;
  font-size: 13px;
  color: #666;
  margin-bottom: 4px;
}

.edit-drawer__editor-wrapper {
  height: calc(100vh - 380px);
  min-height: 300px;
}

.edit-drawer__toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid #f0f0f0;
}

.edit-drawer__toolbar-left {
  display: flex;
  gap: 8px;
  align-items: center;
}

.edit-drawer__toolbar-right {
  display: flex;
  gap: 8px;
}
</style>
