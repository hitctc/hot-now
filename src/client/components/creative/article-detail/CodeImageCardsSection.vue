<script setup lang="ts">
import { computed } from "vue";
import OperationCapabilityBadge from "../OperationCapabilityBadge.vue";
import { useArticleDetailSectionCollapse } from "./useArticleDetailSectionCollapse.js";

import type { CodeImageCard, CreativeFinishedArticle } from "../../../services/creativeApi.js";

const props = withDefaults(defineProps<{
  article: CreativeFinishedArticle;
  readonly?: boolean;
  generating: boolean;
  displayCoverImages?: string[];
  activeCoverIndex?: number;
}>(), { displayCoverImages: () => [], activeCoverIndex: 0 });

const emit = defineEmits<{
  (event: "generate", mode: "missing" | "all"): void;
  (event: "copy-url", url: string): void;
  (event: "select-cover", index: number): void;
}>();

const variants = [
  { key: "2.5:1", label: "2.5:1 横图", usage: "公众号主封面" },
  { key: "1:1", label: "1:1 方图", usage: "方形分享" },
  { key: "3:4", label: "3:4 竖图", usage: "竖图分享" },
] as const;

const cards = computed(() => variants.map((variant) => ({
  ...variant,
  card: props.article.codeImageCards?.find((item) => item.variant === variant.key) ?? null,
})));

// 任一比例已有图片即视为已制作，三张都完成后仍保留重做入口。
const hasAnyCard = computed(() => cards.value.some(({ card }) => Boolean(card?.url)));
const cardsCollapse = useArticleDetailSectionCollapse("code-image-cards", () => props.article.direction);
// 汇总过期状态，折叠后也保留需要重做的提示。
const hasStaleCard = computed(() => cards.value.some(({ card }) => card?.status === "stale"));

/** 合并三比例及额外封面，按地址去重；保存原候选索引，避免显示顺序改变后选错封面。 */
const displayCards = computed(() => {
  const seen = new Set<string>();
  const result: Array<{ key: string; label: string; usage: string; card: CodeImageCard | null; url: string; coverIndex: number; variant: string | null }> = [];
  if ((props.article.codeImageCards?.length ?? 0) > 0 || props.displayCoverImages.length === 0) {
    for (const item of cards.value) {
      const url = item.card?.url ?? "";
      if (url && seen.has(url)) continue;
      if (url) seen.add(url);
      result.push({ ...item, url, coverIndex: url ? props.displayCoverImages.indexOf(url) : -1, variant: item.key });
    }
  }
  props.displayCoverImages.forEach((url, index) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    result.push({ key: `cover-${index}`, label: `封面候选 ${index + 1}`, usage: "上传 / 其他封面", card: null, url, coverIndex: index, variant: null });
  });
  return result;
});

/** 按当前候选地址标记已选状态，兼容历史候选数组中的重复地址。 */
function isCurrentCover(url: string): boolean {
  return Boolean(url && url === props.displayCoverImages[props.activeCoverIndex]);
}

/** 将单张图片状态翻译成页面可理解的短文案。 */
function statusLabel(card: CodeImageCard | null): string {
  if (!card) return "未制作";
  if (card.status === "running") return "制作中";
  if (card.status === "succeeded") return "已完成";
  if (card.status === "stale") return "内容已变化";
  if (card.status === "failed") return card.error ? `失败：${card.error}` : "制作失败";
  return "待制作";
}

/** 为图片状态提供稳定的颜色层级，失败信息不会遮住图片预览。 */
function statusClass(card: CodeImageCard | null): string {
  if (!card || card.status === "pending") return "text-editorial-text-muted";
  if (card.status === "succeeded") return "text-green-600";
  if (card.status === "running") return "text-editorial-link-active";
  if (card.status === "stale") return "text-orange-600";
  return "text-red-500";
}
</script>

<template>
  <section data-code-image-cards-section data-image-cover-section>
    <div class="article-section-heading mb-2 flex flex-wrap items-center justify-between gap-2">
      <div>
        <h3 class="m-0 flex flex-wrap items-center gap-2 text-sm font-semibold text-editorial-text-muted">配图与封面
          <span v-if="hasStaleCard" data-code-image-stale-notice role="status" class="rounded bg-orange-50 px-2 py-0.5 text-[11px] font-medium text-orange-700">内容已变化，建议重新制作</span>
        </h3>
        <p class="m-0 mt-1 text-[11px] text-editorial-text-muted/80">{{ article.direction === 'short_content' ? '新制图不自动插入正文；默认方图作为发布封面，也可下载或手动选择其他封面。' : '三张图片仅加入封面候选，不自动插入正文；可在这里选用公众号主封面或下载。' }}</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <a-button
          type="link"
          size="small"
          class="!h-auto !px-2 !py-1 !text-[11px]"
          :aria-expanded="!cardsCollapse.collapsed.value"
          @click="cardsCollapse.collapsed.value = !cardsCollapse.collapsed.value"
        >{{ cardsCollapse.collapsed.value ? '展开' : '折叠' }}</a-button>
        <template v-if="!readonly">
          <!-- 本地确定性制图不消耗外部额度，保留重做入口，不限制制作次数。 -->
          <a-button
            size="small"
            type="primary"
            :loading="generating"
            :disabled="generating"
            data-code-image-regenerate
            @click="emit('generate', 'all')"
          >{{ generating ? '制作中...' : (hasAnyCard ? '重新制作图片' : '制作图片') }}</a-button>
          <OperationCapabilityBadge capability="local" />
        </template>
        <slot name="actions" />
      </div>
    </div>
    <!-- 隐藏真实容器而非预览组件；不卸载提示词草稿，也不创建第二个滚动区。 -->
    <div v-show="!cardsCollapse.collapsed.value" data-code-image-cards-content>
      <a-image-preview-group>
        <div class="article-cover-grid grid grid-cols-3 gap-2 sm:gap-3">
          <div
            v-for="item in displayCards"
            :key="item.key"
            class="article-cover-card overflow-hidden rounded-editorial-md border bg-editorial-bg-page"
            :class="isCurrentCover(item.url) ? 'border-emerald-600 ring-2 ring-emerald-200' : 'border-editorial-border'"
            :data-code-image-card="item.variant ?? undefined"
          >
            <div class="article-cover-image flex items-center justify-center bg-white">
              <a-image
                v-if="item.url"
                :src="item.url"
                :alt="item.label"
                class="block h-full w-full object-contain"
                loading="lazy"
              />
              <span v-else class="px-2 text-center text-xs text-editorial-text-muted">尚未生成</span>
            </div>
            <div class="space-y-1 border-t border-editorial-border px-2 py-2">
              <div class="text-xs font-semibold text-editorial-text-main">{{ item.label }}</div>
              <div v-if="item.variant" :class="['text-[10px]', statusClass(item.card)]">{{ statusLabel(item.card) }}</div>
              <div class="text-[10px] text-editorial-text-muted">{{ article.direction === 'short_content' && item.variant === '1:1' ? '默认发布封面' : item.usage }}<template v-if="item.card"> · {{ item.card.width }} × {{ item.card.height }}</template></div>
              <div v-if="isCurrentCover(item.url)" class="article-cover-current flex min-h-[44px] items-center justify-center rounded border border-emerald-600 bg-emerald-50 px-2 py-1 text-center text-xs font-bold text-emerald-800">✓ 当前发布封面</div>
              <button
                v-else-if="!readonly && item.coverIndex >= 0"
                type="button"
                class="article-cover-select flex min-h-[44px] w-full items-center justify-center rounded bg-violet-600 px-2 py-1 text-xs font-bold text-white hover:bg-violet-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
                @click.stop="emit('select-cover', item.coverIndex)"
              >设为发布封面</button>
              <div v-if="item.url" class="flex flex-wrap items-center gap-x-2">
                <a :href="item.url" :download="item.variant ? `hotnow-${item.key.replace(':', '-')}.png` : ''" target="_blank" rel="noreferrer" class="inline-flex min-h-[44px] items-center text-[11px] text-editorial-link-active hover:underline">下载图片</a>
                <button type="button" class="min-h-[44px] text-left text-[11px] text-editorial-link-active hover:underline" @click="emit('copy-url', item.url)">复制图片地址</button>
              </div>
            </div>
          </div>
        </div>
      </a-image-preview-group>
      <slot name="prompt" />
    </div>
  </section>
</template>

<style scoped>
/* 给缩略图留固定预算；等高完整缩放，操作及额外候选由详情外层自然滚动，不裁切也不内滚。 */
.article-cover-image {
  height: min(160px, calc(min(440px, 60vh) / 2));
}
.article-cover-image :deep(.ant-image),
.article-cover-image :deep(.ant-image-img) {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
</style>
