<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  options: { kind: string; name: string }[];
  selectedSourceKinds: string[];
}>();

const emit = defineEmits<{
  change: [selectedSourceKinds: string[]];
}>();

const selectedSet = computed(() => new Set(props.selectedSourceKinds));
const selectedCount = computed(() => props.selectedSourceKinds.length);

function emitSelection(nextKinds: string[]): void {
  emit("change", nextKinds);
}

function handleOptionToggle(kind: string, checked: boolean): void {
  const nextKinds = checked
    ? [...props.selectedSourceKinds, kind]
    : props.selectedSourceKinds.filter((value) => value !== kind);

  emitSelection([...new Set(nextKinds)]);
}

function selectAll(): void {
  emitSelection(props.options.map((option) => option.kind));
}

function clearAll(): void {
  emitSelection([]);
}
</script>

<template>
  <a-card class="content-source-filter-card" :bordered="false" data-content-source-filter>
    <div class="content-source-filter-card__header">
      <div>
        <a-typography-text class="content-source-filter-card__kicker" type="secondary">
          来源筛选
        </a-typography-text>
        <a-typography-title :level="5" class="content-source-filter-card__title">
          当前只看这些来源
        </a-typography-title>
        <a-typography-text class="content-source-filter-card__summary" type="secondary">
          已选 {{ selectedCount }} / {{ options.length }}
        </a-typography-text>
      </div>

      <a-space size="small">
        <a-button data-content-filter-action="select-all" size="small" @click="selectAll">全选</a-button>
        <a-button data-content-filter-action="clear-all" size="small" @click="clearAll">全不选</a-button>
      </a-space>
    </div>

    <div class="content-source-filter-card__options">
      <label
        v-for="option in options"
        :key="option.kind"
        class="content-source-filter-card__option"
      >
        <input
          :data-source-kind="option.kind"
          type="checkbox"
          :checked="selectedSet.has(option.kind)"
          @change="handleOptionToggle(option.kind, ($event.target as HTMLInputElement).checked)"
        />
        <span>{{ option.name }}</span>
      </label>
    </div>
  </a-card>
</template>

<style scoped>
.content-source-filter-card {
  width: 100%;
  border-radius: 18px;
  border: 1px solid var(--editorial-border);
  background: color-mix(in srgb, var(--editorial-bg-panel) 92%, transparent);
  box-shadow: var(--editorial-shadow-floating);
  backdrop-filter: blur(18px);
}

.content-source-filter-card__header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  margin-bottom: 16px;
}

.content-source-filter-card__kicker {
  display: block;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.content-source-filter-card__title {
  margin: 4px 0 0;
}

.content-source-filter-card__summary {
  display: block;
  margin-top: 4px;
}

.content-source-filter-card__options {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.content-source-filter-card__option {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: 1px solid rgba(127, 127, 127, 0.18);
  border-radius: 999px;
  cursor: pointer;
}

.content-source-filter-card__option input {
  margin: 0;
}

</style>
