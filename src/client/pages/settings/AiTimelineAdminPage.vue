<script setup lang="ts">
import {
  editorialContentIntroSectionClass,
  editorialContentPageClass
} from "../../components/content/contentCardShared";
import AiTimelineAdminOverview from "../../components/settings/aiTimeline/AiTimelineAdminOverview.vue";
import AiTimelineCandidateEventTable from "../../components/settings/aiTimeline/AiTimelineCandidateEventTable.vue";
import AiTimelineEventEditDrawer from "../../components/settings/aiTimeline/AiTimelineEventEditDrawer.vue";
import AiTimelineRulesPanel from "../../components/settings/aiTimeline/AiTimelineRulesPanel.vue";
import AiTimelineSourceHealthTable from "../../components/settings/aiTimeline/AiTimelineSourceHealthTable.vue";
import { useAiTimelineAdminPageController } from "../../components/settings/aiTimeline/useAiTimelineAdminPageController";

const {
  isLoading,
  isRefreshing,
  loadError,
  pageNotice,
  adminModel,
  overview,
  sourceHealthRows,
  eventsModel,
  editingEvent,
  editDraft,
  isEditDrawerOpen,
  isActionPending,
  loadWorkbench,
  handleManualCollect,
  openEditEvent,
  closeEditDrawer,
  saveEditedEvent,
  setEventVisibility
} = useAiTimelineAdminPageController();
</script>

<template>
  <a-spin :spinning="isRefreshing">
    <div :class="editorialContentPageClass" data-ai-timeline-admin-page>
      <a-alert
        v-if="pageNotice"
        :class="['editorial-inline-alert', 'editorial-inline-alert--' + pageNotice.tone]"
        :message="pageNotice.message"
        :type="pageNotice.tone"
        show-icon
        closable
        @close="pageNotice = null"
      />

      <a-skeleton v-if="isLoading" active :paragraph="{ rows: 8 }" />

      <a-result
        v-else-if="loadError"
        status="error"
        title="AI 时间线管理页加载失败"
        :sub-title="loadError"
      >
        <template #extra>
          <a-button type="primary" @click="loadWorkbench()">重新加载</a-button>
        </template>
      </a-result>

      <template v-else-if="adminModel && overview && eventsModel">
        <section :class="editorialContentIntroSectionClass" data-settings-intro="ai-timeline-admin">
          <div
            class="pointer-events-none absolute right-[-56px] top-[-72px] h-48 w-48 rounded-full bg-[radial-gradient(circle,_rgba(81,220,255,0.22),_transparent_72%)] blur-3xl"
            aria-hidden="true"
          />
          <div class="relative z-[1] flex flex-col gap-4">
            <div class="flex flex-wrap items-center gap-2">
              <span class="rounded-editorial-pill border border-editorial-border bg-editorial-panel/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-editorial-text-muted">
                AI Timeline Operations
              </span>
              <span class="text-xs leading-6 text-editorial-text-muted">官方源健康、候选事件、证据链和展示规则集中管理。</span>
            </div>
            <div class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div class="space-y-2">
                <h2 class="m-0 text-[28px] font-semibold tracking-[-0.04em] text-editorial-text-main">
                  AI 时间线管理
                </h2>
                <p class="m-0 max-w-3xl text-sm leading-7 text-editorial-text-body">
                  这里不再混在普通数据收集里，而是专门处理主流 AI 官方发布事件的可靠性、及时性和人工修正。
                </p>
              </div>
              <a-button
                type="primary"
                data-action="manual-ai-timeline-admin-collect"
                :loading="isActionPending('manual:ai-timeline-collect')"
                @click="handleManualCollect"
              >
                手动采集官方事件
              </a-button>
            </div>
          </div>
        </section>

        <AiTimelineAdminOverview :overview="overview" />
        <AiTimelineSourceHealthTable :sources="sourceHealthRows" />
        <AiTimelineCandidateEventTable
          :events-model="eventsModel"
          :is-action-pending="isActionPending"
          @edit="openEditEvent"
          @set-visibility="setEventVisibility"
        />
        <AiTimelineRulesPanel />
      </template>

      <AiTimelineEventEditDrawer
        :open="isEditDrawerOpen"
        :event="editingEvent"
        :draft="editDraft"
        :is-saving="editingEvent ? isActionPending(`ai-timeline-event:${editingEvent.id}`) : false"
        @close="closeEditDrawer"
        @save="saveEditedEvent"
      />
    </div>
  </a-spin>
</template>
