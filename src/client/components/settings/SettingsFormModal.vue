<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    width?: number | string;
    bodyDataAttribute?: string;
  }>(),
  {
    width: 680,
    bodyDataAttribute: undefined
  }
);

const emit = defineEmits<{
  cancel: [];
}>();

const modalWidth = computed(() => (typeof props.width === "number" ? `${props.width}px` : props.width));
</script>

<template>
  <a-modal
    :open="open"
    :title="title"
    :footer="null"
    :width="modalWidth"
    :destroy-on-close="true"
    :mask-style="{ background: 'rgba(9, 15, 28, 0.46)', backdropFilter: 'blur(4px)' }"
    centered
    class="editorial-form-modal"
    wrap-class-name="editorial-form-modal-wrap"
    @cancel="emit('cancel')"
  >
    <div
      class="editorial-form-modal__body"
      :data-settings-modal-body="bodyDataAttribute"
    >
      <slot />
    </div>
  </a-modal>
</template>
