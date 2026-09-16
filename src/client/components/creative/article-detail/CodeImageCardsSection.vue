<script setup lang="ts">
import { computed } from "vue";

import type { CodeImageCard, CreativeFinishedArticle } from "../../../services/creativeApi.js";

const props = defineProps<{
  article: CreativeFinishedArticle;
  readonly?: boolean;
  generating: boolean;
}>();

const emit = defineEmits<{
  (event: "generate", mode: "missing" | "all"): void;
  (event: "copy-url", url: string): void;
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

// 只要任一比例已有图片就视为“已制作”，按钮文案据此切换；
// 这里不再用“是否缺图”决定按钮可用性，否则三张都完成后就没有重做入口。
const hasAnyCard = computed(() => cards.value.some(({ card }) => Boolean(card?.url)));

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
  <section data-code-image-cards-section>
    <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
      <div>
        <h3 class="m-0 text-sm font-semibold text-editorial-text-muted">代码制图片</h3>
        <p class="m-0 mt-1 text-[11px] text-editorial-text-muted/80">三张图片会写入正文，也可直接下载作为封面候选。</p>
      </div>
      <div v-if="!readonly" class="flex flex-wrap gap-2">
        <!-- 代码图片是本地确定性渲染，不消耗外部额度，因此不限制制作次数。 -->
        <a-button
          size="small"
          type="primary"
          :loading="generating"
          :disabled="generating"
          data-code-image-regenerate
          @click="emit('generate', 'all')"
        >{{ generating ? '制作中...' : (hasAnyCard ? '重新制作图片' : '制作图片') }}</a-button>
      </div>
    </div>

    <a-image-preview-group>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div
          v-for="item in cards"
          :key="item.key"
          class="overflow-hidden rounded-editorial-md border border-editorial-border bg-editorial-bg-page"
          :data-code-image-card="item.key"
        >
          <div class="flex min-h-28 items-center justify-center overflow-hidden bg-white">
            <a-image
              v-if="item.card?.url"
              :src="item.card.url"
              :alt="`HotNow ${item.label}`"
              class="block max-h-72 w-full object-contain"
              loading="lazy"
            />
            <span v-else class="px-3 text-center text-xs text-editorial-text-muted">尚未生成</span>
          </div>
          <div class="space-y-1 border-t border-editorial-border px-2.5 py-2">
            <div class="flex items-center justify-between gap-2">
              <span class="text-xs font-semibold text-editorial-text-main">{{ item.label }}</span>
              <span :class="['text-[10px]', statusClass(item.card)]">{{ statusLabel(item.card) }}</span>
            </div>
            <div class="text-[10px] text-editorial-text-muted">{{ item.usage }} · {{ item.card?.width ?? 1500 }} × {{ item.card?.height ?? (item.key === '2.5:1' ? 600 : item.key === '1:1' ? 1500 : 2000) }}</div>
            <div v-if="item.card?.url" class="flex flex-wrap gap-2 pt-1">
              <a :href="item.card.url" :download="`hotnow-${item.key.replace(':', '-')}.png`" target="_blank" rel="noreferrer" class="text-[11px] text-editorial-link-active hover:underline">下载 PNG</a>
              <button type="button" class="text-[11px] text-editorial-link-active hover:underline" @click="emit('copy-url', item.card?.url ?? '')">复制图片地址</button>
            </div>
          </div>
        </div>
      </div>
    </a-image-preview-group>
  </section>
</template>
