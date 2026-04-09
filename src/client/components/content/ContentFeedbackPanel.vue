<script setup lang="ts">
import { reactive, watch } from "vue";

import { editorialContentSubpanelClass } from "./contentCardShared";

import type { ContentFeedbackEntry, ContentFeedbackSuggestedEffect, ContentFeedbackStrengthLevel } from "../../services/contentApi";

const props = defineProps<{
  modelValue?: ContentFeedbackEntry;
  submitting?: boolean;
}>();

const emit = defineEmits<{
  submit: [payload: {
    freeText: string;
    suggestedEffect: ContentFeedbackSuggestedEffect;
    strengthLevel: ContentFeedbackStrengthLevel;
    positiveKeywords: string[];
    negativeKeywords: string[];
  }];
}>();

const formState = reactive({
  freeText: "",
  suggestedEffect: "" as ContentFeedbackSuggestedEffect,
  strengthLevel: "" as ContentFeedbackStrengthLevel,
  positiveKeywords: "",
  negativeKeywords: ""
});

function syncFormState(): void {
  formState.freeText = props.modelValue?.freeText ?? "";
  formState.suggestedEffect = (props.modelValue?.suggestedEffect ?? "") as ContentFeedbackSuggestedEffect;
  formState.strengthLevel = (props.modelValue?.strengthLevel ?? "") as ContentFeedbackStrengthLevel;
  formState.positiveKeywords = (props.modelValue?.positiveKeywords ?? []).join(", ");
  formState.negativeKeywords = (props.modelValue?.negativeKeywords ?? []).join(", ");
}

function splitKeywords(rawValue: string): string[] {
  return rawValue
    .split(",")
    .map((keyword) => keyword.trim())
    .filter((keyword, index, array) => keyword.length > 0 && array.indexOf(keyword) === index);
}

function handleSubmit(): void {
  emit("submit", {
    freeText: formState.freeText.trim(),
    suggestedEffect: formState.suggestedEffect,
    strengthLevel: formState.strengthLevel,
    positiveKeywords: splitKeywords(formState.positiveKeywords),
    negativeKeywords: splitKeywords(formState.negativeKeywords)
  });
}

watch(() => props.modelValue, syncFormState, { immediate: true, deep: true });
</script>

<template>
  <a-form
    layout="vertical"
    :class="[editorialContentSubpanelClass, 'mt-3 flex flex-col gap-4 px-4 py-4']"
    data-feedback-panel
  >
    <a-form-item class="!mb-0" label="反馈说明">
      <a-textarea v-model:value="formState.freeText" :rows="3" placeholder="补充为什么值得加分、减分或屏蔽。" />
    </a-form-item>

    <div class="grid gap-x-3 gap-y-0 md:grid-cols-2">
      <a-form-item class="!mb-0" label="建议动作">
        <a-select v-model:value="formState.suggestedEffect">
          <a-select-option value="">未设置</a-select-option>
          <a-select-option value="boost">加分</a-select-option>
          <a-select-option value="penalize">减分</a-select-option>
          <a-select-option value="block">屏蔽</a-select-option>
          <a-select-option value="neutral">无影响</a-select-option>
        </a-select>
      </a-form-item>

      <a-form-item class="!mb-0" label="强度">
        <a-select v-model:value="formState.strengthLevel">
          <a-select-option value="">未设置</a-select-option>
          <a-select-option value="high">高</a-select-option>
          <a-select-option value="medium">中</a-select-option>
          <a-select-option value="low">低</a-select-option>
        </a-select>
      </a-form-item>

      <a-form-item class="!mb-0" label="关键词加分">
        <a-input v-model:value="formState.positiveKeywords" placeholder="agent, workflow" />
      </a-form-item>

      <a-form-item class="!mb-0" label="关键词减分">
        <a-input v-model:value="formState.negativeKeywords" placeholder="融资, 快讯" />
      </a-form-item>
    </div>

    <a-button
      type="primary"
      html-type="button"
      :loading="submitting"
      class="!w-full !rounded-editorial-sm !border !border-editorial-border !bg-editorial-link-active !px-4 !py-2 !text-sm !font-medium !text-editorial-text-main !shadow-none md:!w-auto"
      @click="handleSubmit"
    >
      保存反馈词
    </a-button>
  </a-form>
</template>
