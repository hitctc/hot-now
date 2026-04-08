<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    title: string;
    description: string;
    compact?: boolean;
    trackingPrefix?: string;
  }>(),
  {
    compact: false,
    trackingPrefix: undefined
  }
);

// 页头在桌面壳层和移动端抽屉里复用同一份结构，只通过尺寸和 data 前缀区分语义。
const rootClass = computed(() =>
  props.compact
    ? "flex flex-col gap-1.5"
    : "flex w-full flex-col gap-2 border-b border-editorial-border pb-4 pt-2"
);

const titleClass = computed(() =>
  props.compact
    ? "m-0 text-lg font-semibold leading-tight text-editorial-text-main"
    : "m-0 text-[32px] font-semibold tracking-[-0.03em] text-editorial-text-main"
);

const descriptionClass = computed(() =>
  props.compact
    ? "m-0 text-sm leading-6 text-editorial-text-body"
    : "m-0 text-sm leading-6 text-editorial-text-body"
);

function buildTrackingAttributes(suffix?: string): Record<string, string> {
  if (!props.trackingPrefix) {
    return {};
  }

  const attributeName = suffix
    ? `data-${props.trackingPrefix}-${suffix}`
    : `data-${props.trackingPrefix}`;

  return {
    [attributeName]: ""
  };
}
</script>

<template>
  <header :class="rootClass" v-bind="buildTrackingAttributes()">
    <h2 :class="titleClass" v-bind="buildTrackingAttributes('title')">
      {{ title }}
    </h2>
    <p :class="descriptionClass" v-bind="buildTrackingAttributes('description')">
      {{ description }}
    </p>
  </header>
</template>
