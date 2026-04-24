<script setup lang="ts">
import {
  editorialContentCardClass
} from "../../content/contentCardShared";
import type {
  SettingsContentFilterRule,
  SettingsContentFilterToggles,
  SettingsContentFilterWeights
} from "../../../services/settingsApi";
import {
  convertStoredWeightToPoints,
  formatWeightPoints,
  formatWeightRatio,
  formatWeightTotal,
  readEditableWeightItems,
  readFilterWeightItems,
  type FilterRuleKey,
  type FilterToggleKey,
  type FilterWeightKey
} from "./viewRulesPageShared";

type ToggleCard = {
  key: FilterToggleKey;
  dataKey: string;
  title: string;
  description: string;
  spanAll?: boolean;
};

const props = defineProps<{
  isSaving: boolean;
  rule: SettingsContentFilterRule | null;
  ruleKey: FilterRuleKey;
  toggles: SettingsContentFilterToggles;
  weights: SettingsContentFilterWeights;
}>();

const emit = defineEmits<{
  "save": [];
  "toggle-change": [payload: { key: FilterToggleKey; value: boolean }];
  "weight-change": [payload: { key: FilterWeightKey; value: number | null }];
}>();

const toggleCardsByRule: Record<FilterRuleKey, ToggleCard[]> = {
  ai: [
    {
      key: "enableTimeWindow",
      dataKey: "timeWindow",
      title: "只看最近 24 小时",
      description: "打开后，只保留最近 24 小时的内容。"
    },
    {
      key: "enableSourceViewBonus",
      dataKey: "sourceViewBonus",
      title: "优先显示 AI 新讯的重点来源",
      description: "这里的重点来源，是系统预先认定更适合放在 AI 新讯里的来源，比如 OpenAI、Google AI、TechCrunch AI、爱范儿这些。"
    },
    {
      key: "enableAiKeywordWeight",
      dataKey: "aiKeywordWeight",
      title: "更看重 AI 相关内容",
      description: "系统会看标题、摘要、正文里有没有模型、Agent、产品更新、大模型、智能体这类信号。越像 AI 内容，越容易排前面。"
    },
    {
      key: "enableHeatKeywordWeight",
      dataKey: "heatKeywordWeight",
      title: "更看重热点词",
      description: "系统会看标题、摘要、正文里有没有“发布、上线、更新、快讯、周报、launch、release”这类词。命中越多，越容易排前面。"
    },
    {
      key: "enableScoreRanking",
      dataKey: "scoreRanking",
      title: "按综合分排序",
      description: "综合分会把重点来源、内容完整度、AI 相关度、热点词这些因素一起算进去。打开后按总分排；关闭后改回按发布时间排。",
      spanAll: true
    }
  ],
  hot: [
    {
      key: "enableSourceViewBonus",
      dataKey: "sourceViewBonus",
      title: "优先显示 AI 热点的重点来源",
      description: "这里的重点来源，是系统预先认定更适合放在 AI 热点里的来源，比如 36氪、36氪快讯、虎嗅网、创业邦这些。"
    },
    {
      key: "enableAiKeywordWeight",
      dataKey: "aiKeywordWeight",
      title: "更看重 AI 相关内容",
      description: "系统会看标题、摘要、正文里是不是更像在讲模型、Agent、AI 产品更新、AI 应用案例这类内容。"
    },
    {
      key: "enableHeatKeywordWeight",
      dataKey: "heatKeywordWeight",
      title: "更看重热点词",
      description: "系统会看标题、摘要、正文里有没有“发布、上线、更新、快讯、周报、热点、analysis”这类热词。命中越多，越容易排前面。"
    },
    {
      key: "enableFreshnessWeight",
      dataKey: "freshnessWeight",
      title: "更看重新内容",
      description: "这里的新内容，就是发布时间更近的内容。系统主要按发布时间判断，越新越容易排前面。"
    },
    {
      key: "enableScoreRanking",
      dataKey: "scoreRanking",
      title: "按综合分排序",
      description: "综合分会把重点来源、内容完整度、AI 相关度、热点词、新内容这些因素一起算进去。打开后按总分排；关闭后改回按发布时间排。",
      spanAll: true
    }
  ]
};

function readSectionKey(ruleKey: FilterRuleKey): string {
  return ruleKey === "ai" ? "filter-ai" : "filter-hot";
}

function readCardTitle(ruleKey: FilterRuleKey): string {
  return ruleKey === "ai" ? "AI 新讯怎么排" : "AI 热点怎么排";
}

function readSaveLabel(ruleKey: FilterRuleKey): string {
  return ruleKey === "ai" ? "保存 AI 新讯设置" : "保存 AI 热点设置";
}

function handleToggleChange(key: FilterToggleKey, value: boolean): void {
  emit("toggle-change", { key, value });
}
</script>

<template>
  <section :data-settings-section="readSectionKey(ruleKey)">
    <a-card :class="editorialContentCardClass" :title="readCardTitle(ruleKey)" size="small">
      <div v-if="rule" class="flex flex-col gap-4">
        <p class="m-0 text-sm leading-6 text-editorial-text-body">
          {{ rule.summary }}
        </p>
        <p class="m-0 text-xs leading-5 text-editorial-text-muted">
          下面这些数字表示每一项对排序的影响大小。数字越大，这一项越能左右最后的排序结果。
        </p>

        <div class="grid gap-3 md:grid-cols-2">
          <div
            v-for="card in toggleCardsByRule[ruleKey]"
            :key="`${ruleKey}:${card.dataKey}`"
            :class="[
              'flex items-start justify-between gap-3 rounded-editorial-md border border-editorial-border bg-editorial-panel px-4 py-4',
              card.spanAll ? 'md:col-span-2' : ''
            ]"
            :data-filter-toggle-card="`${ruleKey}:${card.dataKey}`"
          >
            <div>
              <p class="m-0 text-sm font-semibold text-editorial-text-main">{{ card.title }}</p>
              <p class="mt-1 mb-0 text-xs leading-5 text-editorial-text-muted">{{ card.description }}</p>
            </div>
            <a-switch
              :checked="toggles[card.key]"
              :data-filter-toggle-switch="`${ruleKey}:${card.dataKey}`"
              @update:checked="handleToggleChange(card.key, $event)"
            />
          </div>
        </div>

        <div class="flex flex-wrap gap-2">
          <a-tag v-for="item in readFilterWeightItems(rule)" :key="`${ruleKey}-inline-weight:${item}`">{{ item }}</a-tag>
        </div>

        <div class="rounded-editorial-md border border-editorial-border bg-editorial-panel px-4 py-4" :data-filter-weight-editor="ruleKey">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p class="m-0 text-sm font-semibold text-editorial-text-main">调整排序分值</p>
              <p class="mt-1 mb-0 text-xs leading-5 text-editorial-text-muted">
                这 5 项加起来的当前总分是 {{ formatWeightTotal(weights) }} 分。总分只是方便你判断占比，不要求必须等于 100 分。
              </p>
            </div>
            <a-tag color="blue">{{ `当前总分 ${formatWeightTotal(weights)} 分` }}</a-tag>
          </div>

          <div class="mt-4 grid gap-3 md:grid-cols-2">
            <div
              v-for="item in readEditableWeightItems(weights)"
              :key="`${ruleKey}-weight-input:${item.key}`"
              class="rounded-editorial-md border border-editorial-border bg-editorial-link px-4 py-4"
            >
              <div class="flex flex-col gap-3">
                <div>
                  <p class="m-0 text-sm font-semibold text-editorial-text-main">{{ item.label }}</p>
                  <p class="mt-1 mb-0 text-xs leading-5 text-editorial-text-muted">{{ item.description }}</p>
                </div>
                <div class="flex flex-wrap items-center gap-3">
                  <span class="text-xs font-medium text-editorial-text-body">直接输入分值</span>
                  <a-input-number
                    :value="convertStoredWeightToPoints(item.value)"
                    :min="0"
                    :step="1"
                    :precision="0"
                    size="small"
                    class="editorial-weight-input"
                    :data-weight-input="`${ruleKey}:${item.key}`"
                    @update:value="emit('weight-change', { key: item.key, value: $event })"
                  />
                </div>
              </div>
              <p class="mt-3 mb-0 text-xs leading-5 text-editorial-text-muted">
                {{ `当前分值 ${formatWeightPoints(item.value)} 分，约占总分 ${formatWeightRatio(weights, item.value)}` }}
              </p>
            </div>
          </div>
        </div>

        <div class="flex justify-end">
          <a-button
            type="primary"
            :data-save-content-filter="ruleKey"
            :loading="isSaving"
            @click="emit('save')"
          >
            {{ readSaveLabel(ruleKey) }}
          </a-button>
        </div>
      </div>
    </a-card>
  </section>
</template>
