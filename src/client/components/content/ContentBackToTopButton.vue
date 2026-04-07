<script setup lang="ts">
defineProps<{
  visible: boolean;
}>();

const emit = defineEmits<{
  click: [];
}>();
</script>

<template>
  <transition
    enter-active-class="transition duration-150 ease-out"
    enter-from-class="translate-y-2 opacity-0"
    enter-to-class="translate-y-0 opacity-100"
    leave-active-class="transition duration-120 ease-in"
    leave-from-class="translate-y-0 opacity-100"
    leave-to-class="translate-y-2 opacity-0"
  >
    <button
      v-if="visible"
      type="button"
      class="fixed bottom-24 right-5 z-30 inline-flex select-none items-center rounded-editorial-sm border border-editorial-border bg-editorial-panel px-3 py-2 text-sm font-medium text-editorial-text-main shadow-editorial-floating transition hover:bg-editorial-link-active max-[900px]:bottom-20 max-[900px]:right-4"
      data-content-back-to-top
      @click="emit('click')"
    >
      回到顶部
    </button>
  </transition>
</template>
