<script setup lang="ts">
import { computed } from "vue";
import { riskDimClass } from "./articleDetailPresentation.js";

type SimilarityCheck = {
  literal_similarity?: number;
  risk_level?: string;
  rule_based?: {
    literal_similarity?: number;
    literal_structure_similarity?: number;
    source_content_similarity?: number;
    max_continuous_overlap_chars?: number;
    high_risk_segments?: Array<{ article_segment: string; source_segment: string; similarity: number }>;
    risk_level?: string;
  };
  llm_review?: {
    source_dependency?: string;
    narrative_similarity?: string;
    claim_overlap?: string;
    entity_overlap?: string;
    case_reuse?: string;
    first_person_risk?: string;
    overall_risk?: string;
    suggested_action?: string;
    reason?: string;
    high_risk_points?: string[];
    status?: string;
    error?: string;
  };
};

const props = defineProps<{
  isManualArticle: boolean;
  articleId?: number;
  similarityCheck?: Record<string, unknown> | null;
}>();

/** 将服务端的宽泛 JSON 收窄为仅供展示的相似度结构。 */
const similarity = computed<SimilarityCheck | null>(() => {
  const raw = props.similarityCheck;
  return raw && typeof raw === "object" ? raw as SimilarityCheck : null;
});

const riskLevelLabel = computed(() => {
  const level = similarity.value?.risk_level;
  if (level === "low") return "低";
  if (level === "medium") return "中";
  if (level === "high") return "高";
  return "未知";
});

const llmActionLabel = computed(() => {
  const action = similarity.value?.llm_review?.suggested_action;
  if (action === "pass") return "通过";
  if (action === "revise") return "建议修改";
  if (action === "manual_review") return "人工审核";
  return action ?? "未知";
});
</script>

<template>
  <section v-if="!isManualArticle && similarityCheck">
    <div class="mb-2">
      <h3 class="m-0 text-sm font-semibold text-editorial-text-muted">相似度检测</h3>
    </div>
    <template v-if="similarity">
      <div class="grid grid-cols-3 gap-3">
        <div class="space-y-2">
          <div class="rounded border border-editorial-border bg-editorial-bg-page px-3 py-2 text-xs space-y-1">
            <div class="font-medium text-editorial-text-body mb-1">总览</div>
            <div class="flex justify-between"><span class="text-editorial-text-muted">风险等级</span><span class="font-medium" :class="similarity.risk_level === 'high' ? 'text-red-500' : similarity.risk_level === 'medium' ? 'text-yellow-600' : 'text-green-600'">{{ riskLevelLabel }}</span></div>
            <div class="flex justify-between"><span class="text-editorial-text-muted">字面重复率</span><span>{{ Math.round((similarity.literal_similarity ?? 0) * 100) }}%</span></div>
          </div>
          <div v-if="similarity.rule_based" class="rounded border border-editorial-border bg-editorial-bg-page px-3 py-2 text-xs space-y-1">
            <div class="font-medium text-editorial-text-body mb-1">规则检测</div>
            <div class="flex justify-between"><span class="text-editorial-text-muted">字面重复率</span><span>{{ Math.round((similarity.rule_based.literal_similarity ?? 0) * 100) }}%</span></div>
            <div class="flex justify-between"><span class="text-editorial-text-muted">结构相似度</span><span>{{ Math.round((similarity.rule_based.literal_structure_similarity ?? 0) * 100) }}%</span></div>
            <div class="flex justify-between"><span class="text-editorial-text-muted">原文摘要相似度</span><span>{{ Math.round((similarity.rule_based.source_content_similarity ?? 0) * 100) }}%</span></div>
            <div class="flex justify-between"><span class="text-editorial-text-muted">最长连续重叠</span><span>{{ similarity.rule_based.max_continuous_overlap_chars ?? 0 }} 字</span></div>
            <div class="flex justify-between"><span class="text-editorial-text-muted">规则风险</span><span :class="similarity.rule_based.risk_level === 'high' ? 'text-red-500' : similarity.rule_based.risk_level === 'medium' ? 'text-yellow-600' : 'text-green-600'">{{ similarity.rule_based.risk_level ?? '未知' }}</span></div>
          </div>
        </div>

        <div class="space-y-2">
          <template v-if="similarity.llm_review && similarity.llm_review.status === 'success'">
            <div class="rounded border border-editorial-border bg-editorial-bg-page px-3 py-2 text-xs space-y-1">
              <div class="font-medium text-editorial-text-body mb-1">LLM 实质审查</div>
              <div class="flex justify-between"><span class="text-editorial-text-muted">来源依赖</span><span :class="riskDimClass(similarity.llm_review.source_dependency)">{{ similarity.llm_review.source_dependency }}</span></div>
              <div class="flex justify-between"><span class="text-editorial-text-muted">叙事相似度</span><span :class="riskDimClass(similarity.llm_review.narrative_similarity)">{{ similarity.llm_review.narrative_similarity }}</span></div>
              <div class="flex justify-between"><span class="text-editorial-text-muted">观点重叠</span><span :class="riskDimClass(similarity.llm_review.claim_overlap)">{{ similarity.llm_review.claim_overlap }}</span></div>
              <div class="flex justify-between"><span class="text-editorial-text-muted">实体重叠</span><span :class="riskDimClass(similarity.llm_review.entity_overlap)">{{ similarity.llm_review.entity_overlap }}</span></div>
              <div class="flex justify-between"><span class="text-editorial-text-muted">案例复用</span><span :class="riskDimClass(similarity.llm_review.case_reuse)">{{ similarity.llm_review.case_reuse }}</span></div>
              <div class="flex justify-between"><span class="text-editorial-text-muted">第一人称风险</span><span :class="riskDimClass(similarity.llm_review.first_person_risk)">{{ similarity.llm_review.first_person_risk }}</span></div>
              <div class="flex justify-between"><span class="text-editorial-text-muted">LLM 综合风险</span><span class="font-medium" :class="riskDimClass(similarity.llm_review.overall_risk)">{{ similarity.llm_review.overall_risk }}</span></div>
              <div class="flex justify-between"><span class="text-editorial-text-muted">建议操作</span><span>{{ llmActionLabel }}</span></div>
              <template v-if="similarity.llm_review.reason">
                <div class="mt-1 pt-1 border-t border-editorial-border">
                  <div class="text-editorial-text-muted mb-0.5">原因</div>
                  <a-tooltip :title="similarity.llm_review.reason" placement="topLeft"><div class="line-clamp-2">{{ similarity.llm_review.reason }}</div></a-tooltip>
                </div>
              </template>
            </div>
          </template>
          <template v-else-if="similarity.llm_review && similarity.llm_review.status === 'failed'">
            <div class="rounded border border-editorial-border bg-editorial-bg-page px-3 py-2 text-xs text-editorial-text-muted">LLM 审查失败{{ similarity.llm_review.error ? `：${similarity.llm_review.error}` : '' }}</div>
          </template>
          <template v-else-if="similarity.llm_review">
            <div class="rounded border border-editorial-border bg-editorial-bg-page px-3 py-2 text-xs text-editorial-text-muted">LLM 审查已跳过</div>
          </template>
        </div>

        <div class="space-y-2">
          <template v-if="similarity.rule_based && (similarity.rule_based.high_risk_segments?.length ?? 0) > 0">
            <div class="rounded border border-editorial-border bg-editorial-bg-page px-3 py-2 text-xs">
              <div class="font-medium text-editorial-text-body mb-1.5">字面重复片段（{{ similarity.rule_based.high_risk_segments!.length }}）</div>
              <div class="space-y-1.5">
                <div v-for="(segment, index) in similarity.rule_based.high_risk_segments" :key="index" class="rounded bg-white px-2 py-1.5 text-[11px] leading-relaxed border border-editorial-border">
                  <a-tooltip :title="segment.article_segment" placement="topLeft"><div class="line-clamp-2 text-editorial-text-muted">文章：<span class="text-editorial-text-body">{{ segment.article_segment }}</span></div></a-tooltip>
                  <a-tooltip :title="segment.source_segment" placement="topLeft"><div class="line-clamp-2 text-editorial-text-muted mt-0.5">原文：<span class="text-editorial-text-body">{{ segment.source_segment }}</span></div></a-tooltip>
                  <div class="text-editorial-text-muted mt-0.5">相似度：{{ Math.round((segment.similarity ?? 0) * 100) }}%</div>
                </div>
              </div>
            </div>
          </template>
          <template v-if="similarity.llm_review && similarity.llm_review.status === 'success' && (similarity.llm_review.high_risk_points?.length ?? 0) > 0">
            <div class="rounded border border-editorial-border bg-editorial-bg-page px-3 py-2 text-xs">
              <div class="font-medium text-editorial-text-body mb-1.5">高风险点（{{ similarity.llm_review.high_risk_points!.length }}）</div>
              <div class="space-y-1">
                <div v-for="(point, index) in similarity.llm_review.high_risk_points" :key="index" class="rounded bg-white px-2 py-1.5 text-[11px] leading-relaxed text-editorial-text-body">{{ point }}</div>
              </div>
            </div>
          </template>
          <template v-if="!similarity.rule_based?.high_risk_segments?.length && !similarity.llm_review?.high_risk_points?.length">
            <div class="rounded border border-editorial-border bg-editorial-bg-page px-3 py-2 text-xs text-editorial-text-muted">无风险片段</div>
          </template>
        </div>
      </div>
    </template>
  </section>
  <section v-else-if="!isManualArticle && similarityCheck === null && articleId">
    <div class="mb-2">
      <h3 class="m-0 text-sm font-semibold text-editorial-text-muted">相似度检测</h3>
    </div>
    <div class="text-xs text-editorial-text-muted">未检测</div>
  </section>
</template>
