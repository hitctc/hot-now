<script setup lang="ts">
import ContentFilterRuleCard from "../../components/settings/viewRules/ContentFilterRuleCard.vue";
import FeedbackPoolCard from "../../components/settings/viewRules/FeedbackPoolCard.vue";
import FilterGlossarySection from "../../components/settings/viewRules/FilterGlossarySection.vue";
import FilterOverviewSection from "../../components/settings/viewRules/FilterOverviewSection.vue";
import ProviderSettingsCard from "../../components/settings/viewRules/ProviderSettingsCard.vue";
import ViewRulesIntroSection from "../../components/settings/viewRules/ViewRulesIntroSection.vue";
import { useViewRulesPageController } from "../../components/settings/viewRules/useViewRulesPageController";
import { editorialContentPageClass } from "../../components/content/contentCardShared";

const {
  aiFilterRule,
  aiPrioritySourceNames,
  filterForms,
  filterWeightForms,
  handleClearFeedback,
  handleCopyFeedbackPool,
  handleDeleteFeedback,
  handleDeleteProvider,
  handleFilterToggleChange,
  handleProviderApiKeyChange,
  handleProviderKindChange,
  handleProviderSave,
  handleSaveContentFilterRule,
  handleToggleProviderActivation,
  handleWeightInput,
  hotFilterRule,
  hotPrioritySourceNames,
  isActionPending,
  isLoading,
  isRefreshing,
  loadError,
  loadWorkbench,
  pageNotice,
  providerCapabilityTone,
  providerForm,
  selectedProviderStatus,
  workbench
} = useViewRulesPageController();
</script>

<template>
  <a-spin :spinning="isRefreshing">
    <div :class="editorialContentPageClass" data-settings-page="view-rules">
      <a-alert
        v-if="pageNotice"
        :class="['editorial-inline-alert', `editorial-inline-alert--${pageNotice.tone}`]"
        :message="pageNotice.message"
        :type="pageNotice.tone"
        show-icon
        closable
        @close="pageNotice = null"
      />

      <a-skeleton v-if="isLoading" active :paragraph="{ rows: 10 }" />

      <a-result
        v-else-if="loadError"
        status="error"
        title="筛选策略页面加载失败"
        :sub-title="loadError"
      >
        <template #extra>
          <a-button type="primary" @click="loadWorkbench()">重新加载</a-button>
        </template>
      </a-result>

      <template v-else-if="workbench">
        <ViewRulesIntroSection />

        <FilterOverviewSection :ai-filter-rule="aiFilterRule" :hot-filter-rule="hotFilterRule" />

        <FilterGlossarySection
          :ai-priority-source-names="aiPrioritySourceNames"
          :hot-priority-source-names="hotPrioritySourceNames"
        />

        <ContentFilterRuleCard
          :is-saving="isActionPending('content-filter:save:ai')"
          :rule="aiFilterRule"
          rule-key="ai"
          :toggles="filterForms.ai"
          :weights="filterWeightForms.ai"
          @save="handleSaveContentFilterRule('ai')"
          @toggle-change="handleFilterToggleChange('ai', $event)"
          @weight-change="handleWeightInput('ai', $event)"
        />

        <ContentFilterRuleCard
          :is-saving="isActionPending('content-filter:save:hot')"
          :rule="hotFilterRule"
          rule-key="hot"
          :toggles="filterForms.hot"
          :weights="filterWeightForms.hot"
          @save="handleSaveContentFilterRule('hot')"
          @toggle-change="handleFilterToggleChange('hot', $event)"
          @weight-change="handleWeightInput('hot', $event)"
        />

        <FeedbackPoolCard
          :feedback-pool="workbench.feedbackPool"
          :is-clear-pending="isActionPending('feedback:clear')"
          :is-delete-pending="(feedbackId) => isActionPending(`feedback:delete:${feedbackId}`)"
          @clear="handleClearFeedback"
          @copy="handleCopyFeedbackPool"
          @delete="handleDeleteFeedback"
        />

        <ProviderSettingsCard
          :api-key="providerForm.apiKey"
          :is-provider-action-pending="isActionPending"
          :provider-capability="workbench.providerCapability"
          :provider-capability-tone="providerCapabilityTone"
          :provider-kind="providerForm.providerKind"
          :provider-settings="workbench.providerSettings"
          :selected-provider-status="selectedProviderStatus"
          @delete-provider="handleDeleteProvider"
          @save-provider="handleProviderSave"
          @toggle-provider="handleToggleProviderActivation"
          @update-api-key="handleProviderApiKeyChange"
          @update-provider-kind="handleProviderKindChange"
        />
      </template>
    </div>
  </a-spin>
</template>
