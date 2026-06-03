<!--
  SourceItemDetailModal.vue — 素材详情弹窗（公共组件）
  传入 visible + sourceItemId，内部自动加载并展示。
-->
<script setup lang="ts">
import { ref, watch } from "vue";
import { readCreativeSourceItem, type CreativeSourceItem } from "../../services/creativeApi.js";

const props = defineProps<{
  visible: boolean;
  sourceItemId: number | null;
}>();

const emit = defineEmits<{
  "update:visible": [value: boolean];
}>();

const loading = ref(false);
const data = ref<CreativeSourceItem | null>(null);

// 打开时自动加载数据
watch(() => props.visible, async (val) => {
  if (!val || !props.sourceItemId) { data.value = null; return; }
  loading.value = true;
  try {
    data.value = await readCreativeSourceItem(props.sourceItemId);
  } catch {
    data.value = null;
  } finally {
    loading.value = false;
  }
});

function close(): void {
  emit("update:visible", false);
}

function formatTime(value: string | null): string {
  if (!value) return "-";
  const fixed = /^[0-9]{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(value) && !/[Zz+\-]\d{0,4}$/.test(value)
    ? value.replace(" ", "T") + "Z" : value;
  const date = new Date(fixed);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
</script>

<template>
  <a-modal
    :open="visible"
    title="素材详情"
    :footer="null"
    :closable="true"
    :mask-closable="true"
    width="860px"
    centered
    wrap-class-name="source-item-detail-modal"
    destroy-on-close
    @cancel="close"
  >
    <a-spin :spinning="loading">
      <template v-if="data">
        <div class="flex flex-col gap-5 py-2">
          <h2 class="m-0 text-base font-semibold text-editorial-text-main">{{ data.title }}</h2>
          <a-descriptions :column="{ xs: 1, sm: 2, md: 3 }" size="small" bordered>
            <a-descriptions-item label="来源">{{ data.sourceName || "-" }}</a-descriptions-item>
            <a-descriptions-item label="作者">{{ data.author || "-" }}</a-descriptions-item>
            <a-descriptions-item label="Agent">{{ data.collectorAgent }}</a-descriptions-item>
            <a-descriptions-item label="评分">
              <span v-if="data.score != null" class="font-semibold">{{ data.score }}</span>
              <span v-else class="text-editorial-text-muted">-</span>
            </a-descriptions-item>
            <a-descriptions-item label="爆文分">
              <span v-if="data.trendScore != null" class="font-semibold" :class="data.trendScore >= 90 ? 'text-purple-600' : data.trendScore >= 80 ? 'text-red-500' : 'text-orange-600'">{{ data.trendScore }}</span>
              <span v-else class="text-editorial-text-muted">未评分</span>
            </a-descriptions-item>
            <a-descriptions-item label="字数">{{ data.wordCount ?? "-" }}</a-descriptions-item>
            <a-descriptions-item label="语言">{{ data.language }}</a-descriptions-item>
            <a-descriptions-item label="写作状态">{{ data.writingStatus }}</a-descriptions-item>
            <a-descriptions-item label="发布时间">{{ formatTime(data.publishedAt) }}</a-descriptions-item>
            <a-descriptions-item label="采集时间">{{ formatTime(data.collectorTimestamp) }}</a-descriptions-item>
            <a-descriptions-item label="标签">
              <template v-if="data.tags">
                <a-tag v-for="tag in data.tags.split(',').map((t: string) => t.trim()).filter(Boolean)" :key="tag" size="small">{{ tag }}</a-tag>
              </template>
              <span v-else class="text-editorial-text-muted">-</span>
            </a-descriptions-item>
            <a-descriptions-item label="原文链接" :span="3">
              <a v-if="data.url" :href="data.url" target="_blank" rel="noopener noreferrer" class="text-editorial-link-active underline">{{ data.url }}</a>
              <span v-else class="text-editorial-text-muted">无</span>
            </a-descriptions-item>
          </a-descriptions>
          <section v-if="data.summary">
            <h3 class="m-0 mb-2 text-sm font-semibold text-editorial-text-muted">摘要</h3>
            <p class="m-0 text-sm leading-6 text-editorial-text-body">{{ data.summary }}</p>
          </section>
          <section>
            <h3 class="m-0 mb-2 text-sm font-semibold text-editorial-text-muted">原文内容</h3>
            <div v-if="data.fullContent" class="whitespace-pre-wrap rounded-editorial-md border border-editorial-border bg-editorial-page px-4 py-3 text-sm leading-6 text-editorial-text-body">{{ data.fullContent }}</div>
            <p v-else class="m-0 text-sm italic text-editorial-text-muted">采集未提供原文</p>
          </section>
        </div>
      </template>
    </a-spin>
  </a-modal>
</template>
