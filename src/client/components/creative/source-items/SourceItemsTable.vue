<script setup lang="ts">
import { ref, toRefs } from "vue";
import { message } from "ant-design-vue";

import type { CreativeSourceItem } from "../../../services/creativeApi.js";
import {
  accountFitColor,
  accountFitLabel,
  formatBreakdown,
  formatPublishedAt,
  getBreakdownBars,
  writingStatusColor,
  writingStatusLabel,
} from "./sourceItemPresentation.js";

type SourceDirection = "article" | "short_content";
type Pagination = {
  current: number;
  pageSize: number;
  total: number;
  showSizeChanger: boolean;
  showTotal: (total: number) => string;
};

const props = defineProps<{
  mode: SourceDirection;
  isLoading: boolean;
  items: CreativeSourceItem[];
  pagination: Pagination;
  expandedRowKeys: number[];
  pipelineOn: boolean;
  writingIds: Set<number>;
  tracingIds: Set<number>;
  actionPendingId: number | null;
}>();

const emit = defineEmits<{
  (event: "table-change", pagination: { current?: number; pageSize?: number }): void;
  (event: "toggle-expand", id: number): void;
  (event: "open-article", id: number): void;
  (event: "write", item: CreativeSourceItem): void;
  (event: "trace", item: CreativeSourceItem): void;
  (event: "evaluate-fit", item: CreativeSourceItem): void;
  (event: "writing-action", item: CreativeSourceItem, status: "done" | "skipped"): void;
}>();

const { mode, isLoading, items, pagination, expandedRowKeys, pipelineOn, writingIds, tracingIds, actionPendingId } = toRefs(props);

const columns = [
  { title: "ID / 序号", dataIndex: "id", key: "idSeq", width: 72, fixed: "left" as const },
  { title: "标题", dataIndex: "title", key: "title", width: 300 },
  { title: "来源", dataIndex: "sourceName", key: "sourceName", width: 115 },
  { title: "状态", dataIndex: "writingStatus", key: "writingStatus", width: 72, ellipsis: true },
  { title: "评分", key: "score", width: 90 },
  { title: "Agent", dataIndex: "collectorAgent", key: "collectorAgent", width: 44, align: "center" as const, ellipsis: true },
  { title: "耗时/时间", key: "timeInfo", width: 84 },
  { title: "写文章", key: "quickCopy", width: 64, ellipsis: true, fixed: "right" as const },
];

const overflowHover = ref<{ key: string } | null>(null);
let overflowHoverTimer: ReturnType<typeof setTimeout> | null = null;

/** 只有单元格确实被截断时才显示延迟 tooltip。 */
function onOverflowCellEnter(key: string, event: MouseEvent): void {
  const element = event.currentTarget as HTMLElement;
  const isOverflowing = element.scrollHeight > element.clientHeight + 1;
  if (overflowHoverTimer) clearTimeout(overflowHoverTimer);
  if (!isOverflowing) return;
  overflowHoverTimer = setTimeout(() => { overflowHover.value = { key }; }, 300);
}

/** 离开单元格时清除尚未显示的 tooltip。 */
function onOverflowCellLeave(key: string): void {
  if (overflowHoverTimer) {
    clearTimeout(overflowHoverTimer);
    overflowHoverTimer = null;
  }
  if (overflowHover.value?.key === key) overflowHover.value = null;
}

/** 复制素材 ID，保持列表原有的快捷操作反馈。 */
function copyId(id: number): void {
  navigator.clipboard.writeText(`【素材id: ${id}】`).then(() => message.success("已复制"));
}
</script>

<template>
<!-- 表格 -->
<a-spin :spinning="isLoading">
  <a-table
    :columns="columns"
    :data-source="items"
    :pagination="pagination"
    :scroll="{ x: 1200 }"
    :expanded-row-keys="expandedRowKeys"
    row-key="id"
    data-source-item-table
    size="small"
    @change="emit('table-change', $event)"
    @expand="(_expanded: boolean, record: CreativeSourceItem) => emit('toggle-expand', record.id)"
  >
    <!-- 标题列：点击展开/折叠 -->
    <template #bodyCell="{ column, record }">
      <template v-if="column.key === 'idSeq'">
        <div class="flex flex-col leading-tight">
          <span class="cursor-pointer text-editorial-link-active hover:underline" @click="copyId(record.id)">{{ record.id }}</span>
          <span class="text-[11px] text-editorial-text-muted">#{{ record.seqNumber ?? '-' }}</span>
        </div>
      </template>
      <template v-if="column.key === 'title'">
        <div class="flex items-center gap-2 min-w-0">
          <a-tooltip
            :open="overflowHover?.key === 'title-' + record.id"
            :title="record.title"
            placement="topLeft"
          >
            <span
              class="line-clamp-2 cursor-pointer text-[13px] leading-tight font-medium text-editorial-text-main hover:text-editorial-link-active"
              @click="emit('toggle-expand', record.id)"
              @mouseenter="onOverflowCellEnter('title-' + record.id, $event)"
              @mouseleave="onOverflowCellLeave('title-' + record.id)"
            >
              {{ record.title }}
            </span>
          </a-tooltip>
        </div>
        <div v-if="record.linkedArticleId != null" class="mt-0.5 flex flex-wrap items-center gap-1 leading-none">
          <a
            class="inline-flex cursor-pointer items-center gap-1 rounded-editorial-pill bg-editorial-link-active/30 px-1.5 py-0 text-[10px] font-semibold text-editorial-link-active hover:bg-editorial-link-active/50"
            @click.prevent="emit('open-article', record.linkedArticleId!)"
          >
            成品 #{{ record.linkedArticleId }}
          </a>
          <span
            v-if="(record as any).linkedArticlePublished"
            class="inline-flex items-center rounded-editorial-pill bg-green-100 px-1.5 py-0 text-[10px] leading-none text-green-700"
          >已发布</span>
        </div>
      </template>

      <!-- 来源列 -->
      <template v-else-if="column.key === 'sourceName'">
        <a-tooltip
          :open="overflowHover?.key === 'sourceName-' + record.id"
          :title="(record.sourceName || '').replace('微信公众号', 'WX')"
          placement="topLeft"
        >
          <span
            class="line-clamp-3 text-[10px] leading-tight text-editorial-text-body"
            @mouseenter="onOverflowCellEnter('sourceName-' + record.id, $event)"
            @mouseleave="onOverflowCellLeave('sourceName-' + record.id)"
          >{{ (record.sourceName || "-").replace("微信公众号", "WX") }}</span>
        </a-tooltip>
      </template>

      <!-- 评分列集中展示基础评分、爆文分和可选的账号适配。 -->
      <template v-else-if="column.key === 'score'">
        <div class="flex flex-col gap-0.5 leading-tight">
          <div class="flex items-center gap-1">
            <span
              v-if="record.score != null"
              class="inline-flex items-center rounded-editorial-pill border border-editorial-border bg-editorial-link-active px-1.5 py-0 text-[10px] font-semibold text-editorial-text-main"
            >{{ record.score }}</span>
            <span
              v-if="record.trendScore != null"
              class="inline-flex items-center rounded-editorial-pill border px-1.5 py-0 text-[10px] font-bold"
              :class="record.trendScore >= 90 ? 'border-purple-600 bg-purple-600 text-white shadow-sm' : record.trendScore >= 80 ? 'border-red-500 bg-red-500 text-white shadow-sm' : 'border-orange-300 bg-orange-50 text-orange-700'"
            >{{ record.trendScore }}</span>
          </div>
          <a-tooltip v-if="record.trendBreakdown && getBreakdownBars(record.trendBreakdown).length > 0" :mouse-enter-delay="0.3">
            <template #title>
              <div class="text-xs leading-5">{{ formatBreakdown(record.trendBreakdown) }}</div>
            </template>
            <div class="flex h-2.5 w-full min-w-[80px] overflow-hidden rounded-sm">
              <div
                v-for="(bar, idx) in getBreakdownBars(record.trendBreakdown)"
                :key="idx"
                :style="{ width: bar.width, backgroundColor: bar.color }"
                :title="bar.label"
              />
            </div>
          </a-tooltip>
          <a-tooltip v-if="mode === 'article'" placement="topLeft" :mouse-enter-delay="0.2">
            <template #title>
              <div class="max-w-[420px] text-xs leading-5">
                <div class="font-semibold">{{ accountFitLabel(record.accountFitLevel) }}</div>
                <div v-if="record.accountFitReason" class="mt-1">{{ record.accountFitReason }}</div>
                <div v-if="record.accountFitDetails?.targetReader" class="mt-1">读者：{{ record.accountFitDetails.targetReader }}</div>
                <div v-if="record.accountFitDetails?.readerScenario">场景：{{ record.accountFitDetails.readerScenario }}</div>
                <div v-if="record.accountFitDetails?.ordinaryImpact">影响：{{ record.accountFitDetails.ordinaryImpact }}</div>
                <div v-if="record.accountFitDetails?.articleValue">价值：{{ record.accountFitDetails.articleValue }}</div>
                <div v-if="record.accountFitRuleVersion" class="mt-1 opacity-70">规则：{{ record.accountFitRuleVersion }}</div>
              </div>
            </template>
            <a-tag
              :color="accountFitColor(record.accountFitLevel)"
              class="!m-0 w-fit cursor-help !px-1.5 !py-0 !text-[10px]"
            >
              {{ accountFitLabel(record.accountFitLevel) }}
            </a-tag>
          </a-tooltip>
        </div>
      </template>

      <!-- Agent 列 -->
      <template v-else-if="column.key === 'collectorAgent'">
        <a-tooltip :mouse-enter-delay="0.3" :title="record.collectorAgent">
          <span class="inline-flex items-center gap-1 text-xs text-editorial-text-body">
            <template v-if="record.collectorAgent === 'manual'">👤</template>
            <template v-else>🤖</template>
            <span class="sr-only">{{ record.collectorAgent }}</span>
          </span>
        </a-tooltip>
      </template>

      <!-- 耗时/时间列：发布时间和成品创建时间两行紧凑展示 -->
      <template v-else-if="column.key === 'timeInfo'">
        <div class="flex flex-col gap-0 leading-tight">
          <span class="text-[10px] text-editorial-text-muted">发 {{ formatPublishedAt(mode === "article" ? record.publishedAt : (record.publishedAt || record.createdAt)) }}</span>
          <span class="text-[10px] text-editorial-text-muted">建 {{ record.linkedArticleCreatedAt ? formatPublishedAt(record.linkedArticleCreatedAt) : '-' }}</span>
        </div>
      </template>

      <!-- 写作状态列 -->
      <template v-else-if="column.key === 'writingStatus'">
        <div class="flex flex-col items-start gap-0.5 leading-tight">
          <a-tooltip
            v-if="mode === 'article' && ['skipped', 'failed'].includes(record.writingStatus) && record.writingStopReason"
            placement="topLeft"
          >
            <template #title>
              <div class="max-w-[420px] text-xs leading-5">
                <div class="font-semibold">
                  第 {{ record.writingStopStep ?? "-" }} 阶段 · {{ record.writingStopStepName || "质量闸门" }}
                </div>
                <div class="mt-1">{{ record.writingStopReason }}</div>
                <div v-if="record.writingStoppedAt" class="mt-1 opacity-70">
                  {{ formatPublishedAt(record.writingStoppedAt) }}
                </div>
              </div>
            </template>
            <a-tag
              :color="writingStatusColor(record.writingStatus)"
              class="!m-0 cursor-help !font-semibold"
            >
              {{ writingStatusLabel(record.writingStatus) }} ⓘ
            </a-tag>
          </a-tooltip>
          <a-tag v-else :color="writingStatusColor(record.writingStatus)" class="!m-0">
            {{ writingStatusLabel(record.writingStatus) }}
          </a-tag>
          <a-tag v-if="record.writeCount > 0" color="green" class="!m-0 !text-[11px] !py-0">{{ record.writeCount }}次</a-tag>
        </div>
      </template>

      <!-- 写文章列；长文人工写作不受自动化/旧管线开关影响，短内容继续遵循原有开关。 -->
      <template v-else-if="column.key === 'quickCopy'">
        <a-tooltip v-if="!pipelineOn && mode === 'short_content'" title="短内容管线已紧急制动，请先恢复管线">
          <a-button type="link" size="small" class="!p-0 !text-[11px]" disabled>写短内容</a-button>
        </a-tooltip>
        <a-button
          v-else
          type="link"
          size="small"
          class="!p-0 !text-[11px]"
          :disabled="writingIds.has(record.id)"
          @click="emit('write', record)"
        >{{ writingIds.has(record.id) ? "写作中..." : (mode === "article" ? "写文章" : "写短内容") }}</a-button>
      </template>
    </template>

    <!-- 展开行 -->
    <template #expandedRowRender="{ record }">
      <div class="flex flex-col gap-4 rounded-editorial-md border border-editorial-border bg-editorial-panel/60 p-4">
        <!-- 长文线在展开区保留完整终止说明，短内容线不增加额外状态区。 -->
        <div
          v-if="mode === 'article' && ['skipped', 'failed'].includes(record.writingStatus) && record.writingStopReason"
          class="rounded-editorial-md border border-orange-300 bg-orange-50 px-4 py-3"
        >
          <div class="flex flex-wrap items-center gap-2 text-sm font-semibold text-orange-800">
            <span>{{ record.writingStatus === "failed" ? "技术失败，可重试" : "写作已停止" }}</span>
            <span>第 {{ record.writingStopStep ?? "-" }} 阶段</span>
            <span>{{ record.writingStopStepName || "质量闸门" }}</span>
            <span v-if="record.writingStoppedAt" class="text-xs font-normal text-orange-600">
              {{ formatPublishedAt(record.writingStoppedAt) }}
            </span>
          </div>
          <div class="mt-2 whitespace-pre-wrap text-sm leading-6 text-orange-900">
            {{ record.writingStopReason }}
          </div>
        </div>

        <!-- 摘要 -->
        <div v-if="record.summary">
          <p class="m-0 mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-editorial-text-muted">摘要 <span class="font-normal opacity-70">{{ record.summary.length }} 字</span></p>
          <div class="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-editorial-md bg-editorial-page p-3 text-sm leading-6 text-editorial-text-body">
            {{ record.summary }}
          </div>
        </div>

        <!-- 原文内容 -->
        <div>
          <p class="m-0 mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-editorial-text-muted">原文内容 <span v-if="record.fullContent" class="font-normal opacity-70">{{ record.fullContent.length }} 字</span></p>
          <div
            v-if="record.fullContent"
            class="max-h-60 overflow-y-auto whitespace-pre-wrap rounded-editorial-md bg-editorial-page p-3 text-sm leading-6 text-editorial-text-body"
          >
            {{ record.fullContent }}
          </div>
          <p v-else class="m-0 text-sm italic text-editorial-text-muted">采集未提供原文</p>
        </div>

        <!-- 元信息 -->
        <a-descriptions :column="{ xs: 1, sm: 2, md: 3 }" size="small" bordered>
          <a-descriptions-item label="原文链接">
            <a
              v-if="record.url"
              :href="record.url"
              target="_blank"
              rel="noopener noreferrer"
              class="text-editorial-text-main underline"
            >
              {{ record.url.length > 60 ? record.url.slice(0, 60) + "..." : record.url }}
            </a>
            <span v-else class="text-editorial-text-muted">无</span>
          </a-descriptions-item>
          <a-descriptions-item label="作者">
            {{ record.author || "-" }}
          </a-descriptions-item>
          <a-descriptions-item label="字数">
            {{ record.wordCount ?? "-" }}
          </a-descriptions-item>
          <a-descriptions-item label="语言">
            {{ record.language }}
          </a-descriptions-item>
          <a-descriptions-item label="标签">
            <template v-if="record.tags">
              <a-tag v-for="tag in record.tags.split(',').map((t: string) => t.trim()).filter(Boolean)" :key="tag" size="small">
                {{ tag }}
              </a-tag>
            </template>
            <span v-else class="text-editorial-text-muted">-</span>
          </a-descriptions-item>
        </a-descriptions>

        <!-- 溯源：搜索原始来源 -->
        <div class="border-t border-editorial-border pt-3">
          <div class="flex items-center gap-2 mb-2">
            <span class="text-xs font-semibold uppercase tracking-[0.08em] text-editorial-text-muted">素材溯源</span>
            <a-button
              size="small"
              :loading="tracingIds.has(record.id)"
              @click="emit('trace', record)"
            >
              {{ record.tracedSources ? '重新溯源' : '🔍 溯源' }}
            </a-button>
          </div>
          <!-- 已有溯源结果 -->
          <div v-if="record.tracedSources && record.tracedSources.length > 0" class="space-y-1.5">
            <div
              v-for="(src, idx) in record.tracedSources"
              :key="idx"
              class="flex items-start gap-2 rounded border border-editorial-border bg-editorial-page px-3 py-2"
            >
              <span class="shrink-0 text-[10px] font-bold text-editorial-text-muted">{{ idx + 1 }}</span>
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <a :href="src.url" target="_blank" rel="noopener noreferrer" class="truncate text-[12px] font-medium text-editorial-link-active hover:underline">{{ src.title }}</a>
                  <span v-if="src.relevance_score" class="shrink-0 rounded bg-blue-50 px-1 py-0.5 text-[10px] text-blue-600">{{ Math.round(src.relevance_score * 100) }}%</span>
                </div>
                <div class="mt-0.5 flex items-center gap-2 text-[10px] text-editorial-text-muted">
                  <span>{{ src.source_name }}</span>
                  <span v-if="src.published_at">{{ src.published_at }}</span>
                </div>
                <p v-if="src.reason" class="m-0 mt-0.5 text-[10px] text-editorial-text-muted/70">{{ src.reason }}</p>
              </div>
            </div>
          </div>
          <!-- 溯源进行中 -->
          <div v-else-if="tracingIds.has(record.id)" class="flex items-center gap-2 py-2">
            <span class="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
            <span class="text-[11px] text-blue-500">正在搜索原始来源…预计 30~60 秒</span>
          </div>
          <p v-else-if="record.tracedSources && record.tracedSources.length === 0" class="text-[11px] italic text-editorial-text-muted">已溯源，未找到可靠原始来源</p>
          <p v-else class="text-[11px] text-editorial-text-muted/50">点击「溯源」搜索该素材的原始官方来源</p>
        </div>

        <!-- 写作状态操作 -->
        <div class="flex items-center gap-3 border-t border-editorial-border pt-3">
          <span class="text-xs font-semibold uppercase tracking-[0.08em] text-editorial-text-muted">写作状态：</span>
          <a-button
            v-if="mode === 'article'"
            size="small"
            :loading="actionPendingId === record.id"
            @click="emit('evaluate-fit', record)"
          >
            {{ record.accountFitLevel ? "重新评估适配度" : "评估适配度" }}
          </a-button>
          <a-button
            size="small"
            type="primary"
            :disabled="record.writingStatus === 'done' || actionPendingId === record.id"
            :loading="actionPendingId === record.id"
            @click="emit('writing-action', record, 'done')"
          >
            标记完成
          </a-button>
          <a-button
            size="small"
            danger
            :disabled="record.writingStatus === 'skipped' || actionPendingId === record.id"
            :loading="actionPendingId === record.id"
            @click="emit('writing-action', record, 'skipped')"
          >
            跳过不写
          </a-button>
        </div>

        <!-- rawPayloadJson 调试区 -->
        <a-collapse v-if="record.rawPayloadJson" :bordered="false" class="!bg-transparent">
          <a-collapse-panel key="rawPayload" header="Raw Payload (调试)">
            <pre class="m-0 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-editorial-md bg-editorial-page p-3 text-xs text-editorial-text-muted">{{ record.rawPayloadJson }}</pre>
          </a-collapse-panel>
        </a-collapse>
      </div>
    </template>
  </a-table>
</a-spin>
</template>
