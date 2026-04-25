<script setup lang="ts">
import {
  editorialContentIntroSectionClass,
  editorialContentPageClass
} from "../../components/content/contentCardShared";
import AiTimelineOfficialSourcesCard from "../../components/settings/sources/AiTimelineOfficialSourcesCard.vue";
import BilibiliQueriesCard from "../../components/settings/sources/BilibiliQueriesCard.vue";
import BilibiliQueryModal from "../../components/settings/sources/BilibiliQueryModal.vue";
import HackerNewsQueriesCard from "../../components/settings/sources/HackerNewsQueriesCard.vue";
import HackerNewsQueryModal from "../../components/settings/sources/HackerNewsQueryModal.vue";
import ManualSendLatestEmailCard from "../../components/settings/sources/ManualSendLatestEmailCard.vue";
import RssSourceModal from "../../components/settings/sources/RssSourceModal.vue";
import SourceInventoryCard from "../../components/settings/sources/SourceInventoryCard.vue";
import SourcesOverviewCards from "../../components/settings/sources/SourcesOverviewCards.vue";
import TwitterAccountModal from "../../components/settings/sources/TwitterAccountModal.vue";
import TwitterAccountsCard from "../../components/settings/sources/TwitterAccountsCard.vue";
import TwitterKeywordModal from "../../components/settings/sources/TwitterKeywordModal.vue";
import TwitterKeywordsCard from "../../components/settings/sources/TwitterKeywordsCard.vue";
import WechatRssSourceModal from "../../components/settings/sources/WechatRssSourceModal.vue";
import WechatRssSourcesCard from "../../components/settings/sources/WechatRssSourcesCard.vue";
import WeiboTrendingCard from "../../components/settings/sources/WeiboTrendingCard.vue";
import { useSourcesPageController } from "../../components/settings/sources/useSourcesPageController";
import { publicOfficialAiTimelineSources } from "../../../core/aiTimeline/officialAiTimelineSources";

const {
  isLoading,
  isRefreshing,
  loadError,
  pageNotice,
  sourcesModel,
  aiTimelineEventsModel,
  isAiTimelineEventsLoading,
  isSourceModalOpen,
  isTwitterAccountModalOpen,
  isTwitterKeywordModalOpen,
  isHackerNewsQueryModalOpen,
  isBilibiliQueryModalOpen,
  isWechatRssModalOpen,
  sourceModalMode,
  twitterAccountModalMode,
  twitterKeywordModalMode,
  hackerNewsQueryModalMode,
  bilibiliQueryModalMode,
  wechatRssModalMode,
  sourceFormError,
  twitterAccountFormError,
  twitterKeywordFormError,
  hackerNewsQueryFormError,
  bilibiliQueryFormError,
  wechatRssFormError,
  sourceForm,
  twitterAccountForm,
  twitterKeywordForm,
  hackerNewsQueryForm,
  bilibiliQueryForm,
  wechatRssForm,
  relativeNow,
  enabledSourceCount,
  totalSourceCount,
  totalTwitterAccountCount,
  enabledTwitterAccountCount,
  totalTwitterKeywordCount,
  enabledTwitterKeywordCollectCount,
  enabledTwitterKeywordVisibleCount,
  totalHackerNewsQueryCount,
  enabledHackerNewsQueryCount,
  totalBilibiliQueryCount,
  enabledBilibiliQueryCount,
  totalWechatRssSourceCount,
  enabledWechatRssSourceCount,
  fixedWeiboKeywordCount,
  twitterAccountCollectionMessage,
  twitterKeywordCollectionMessage,
  hackerNewsCollectionMessage,
  bilibiliCollectionMessage,
  wechatRssCollectionMessage,
  weiboTrendingMessage,
  isActionPending,
  loadSources,
  loadAiTimelineEvents,
  openCreateSourceModal,
  openCreateTwitterAccountModal,
  openCreateTwitterKeywordModal,
  openCreateHackerNewsQueryModal,
  openCreateBilibiliQueryModal,
  openCreateWechatRssModal,
  openEditSourceModal,
  openEditTwitterAccountModal,
  openEditTwitterKeywordModal,
  openEditHackerNewsQueryModal,
  openEditBilibiliQueryModal,
  openEditWechatRssSource,
  closeSourceModal,
  closeTwitterAccountModal,
  closeTwitterKeywordModal,
  closeHackerNewsQueryModal,
  closeBilibiliQueryModal,
  closeWechatRssModal,
  handleToggleSource,
  handleToggleSourceDisplayMode,
  handleManualCollect,
  handleManualTwitterCollect,
  handleManualTwitterKeywordCollect,
  handleManualHackerNewsCollect,
  handleManualBilibiliCollect,
  handleManualWechatRssCollect,
  handleManualWeiboTrendingCollect,
  handleManualAiTimelineCollect,
  handleSetAiTimelineEventVisibility,
  handleSaveAiTimelineEventManualText,
  handleManualSendLatestEmail,
  handleSubmitSource,
  handleSubmitTwitterAccount,
  handleSubmitTwitterKeyword,
  handleSubmitHackerNewsQuery,
  handleSubmitBilibiliQuery,
  handleSubmitWechatRssSources,
  handleToggleTwitterAccount,
  handleDeleteTwitterAccount,
  handleToggleTwitterKeywordCollect,
  handleToggleTwitterKeywordVisible,
  handleDeleteTwitterKeyword,
  handleToggleHackerNewsQuery,
  handleDeleteHackerNewsQuery,
  handleToggleBilibiliQuery,
  handleDeleteBilibiliQuery,
  handleDeleteWechatRssSource,
  handleDeleteSource
} = useSourcesPageController();
</script>

<template>
  <a-spin :spinning="isRefreshing">
    <div :class="editorialContentPageClass" data-settings-page="sources">
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
        title="数据收集页加载失败"
        :sub-title="loadError"
      >
        <template #extra>
          <a-button type="primary" @click="loadSources()">重新加载</a-button>
        </template>
      </a-result>

      <template v-else-if="sourcesModel">
        <section :class="editorialContentIntroSectionClass" data-settings-intro="sources">
          <div
            class="pointer-events-none absolute right-[-56px] top-[-72px] h-48 w-48 rounded-full bg-[radial-gradient(circle,_rgba(81,220,255,0.22),_transparent_72%)] blur-3xl"
            aria-hidden="true"
          />
          <div class="relative z-[1] flex flex-col gap-4">
            <div class="flex flex-wrap items-center gap-2">
              <span class="rounded-editorial-pill border border-editorial-border bg-editorial-panel/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-editorial-text-muted">
                Source Inventory
              </span>
              <span class="text-xs leading-6 text-editorial-text-muted">来源接入、手动采集和库存巡检都在这一页完成。</span>
            </div>
            <div class="flex flex-col gap-2">
              <h2 class="m-0 text-[28px] font-semibold tracking-[-0.04em] text-editorial-text-main">
                数据来源工作台
              </h2>
              <p class="m-0 max-w-3xl text-sm leading-7 text-editorial-text-body">
                这里负责管理 RSS 来源与现有来源状态、查看调度节奏、执行手动采集和人工发信，同时把库存管理与核心统计合并在一张表里。
              </p>
            </div>
          </div>
        </section>

        <SourcesOverviewCards
          :total-source-count="totalSourceCount"
          :enabled-source-count="enabledSourceCount"
          :operations="sourcesModel.operations"
          :now="relativeNow"
        />

        <ManualSendLatestEmailCard
          :operations="sourcesModel.operations"
          :is-action-pending="isActionPending"
          @send="handleManualSendLatestEmail"
        />

        <TwitterAccountsCard
          :accounts="sourcesModel.twitterAccounts ?? []"
          :total-count="totalTwitterAccountCount"
          :enabled-count="enabledTwitterAccountCount"
          :collection-message="twitterAccountCollectionMessage"
          :operations="sourcesModel.operations"
          :is-action-pending="isActionPending"
          @add="openCreateTwitterAccountModal"
          @collect="handleManualTwitterCollect"
          @toggle="handleToggleTwitterAccount"
          @edit="openEditTwitterAccountModal"
          @delete="handleDeleteTwitterAccount"
        />

        <TwitterKeywordsCard
          :keywords="sourcesModel.twitterSearchKeywords ?? []"
          :total-count="totalTwitterKeywordCount"
          :collect-enabled-count="enabledTwitterKeywordCollectCount"
          :visible-enabled-count="enabledTwitterKeywordVisibleCount"
          :collection-message="twitterKeywordCollectionMessage"
          :operations="sourcesModel.operations"
          :is-action-pending="isActionPending"
          @add="openCreateTwitterKeywordModal"
          @collect="handleManualTwitterKeywordCollect"
          @toggle-collect="handleToggleTwitterKeywordCollect"
          @toggle-visible="handleToggleTwitterKeywordVisible"
          @edit="openEditTwitterKeywordModal"
          @delete="handleDeleteTwitterKeyword"
        />

        <HackerNewsQueriesCard
          :queries="sourcesModel.hackerNewsQueries ?? []"
          :total-count="totalHackerNewsQueryCount"
          :enabled-count="enabledHackerNewsQueryCount"
          :collection-message="hackerNewsCollectionMessage"
          :operations="sourcesModel.operations"
          :is-action-pending="isActionPending"
          @add="openCreateHackerNewsQueryModal"
          @collect="handleManualHackerNewsCollect"
          @toggle="handleToggleHackerNewsQuery"
          @edit="openEditHackerNewsQueryModal"
          @delete="handleDeleteHackerNewsQuery"
        />

        <BilibiliQueriesCard
          :queries="sourcesModel.bilibiliQueries ?? []"
          :total-count="totalBilibiliQueryCount"
          :enabled-count="enabledBilibiliQueryCount"
          :collection-message="bilibiliCollectionMessage"
          :operations="sourcesModel.operations"
          :is-action-pending="isActionPending"
          @add="openCreateBilibiliQueryModal"
          @collect="handleManualBilibiliCollect"
          @toggle="handleToggleBilibiliQuery"
          @edit="openEditBilibiliQueryModal"
          @delete="handleDeleteBilibiliQuery"
        />

        <WechatRssSourcesCard
          :sources="sourcesModel.wechatRssSources ?? []"
          :total-count="totalWechatRssSourceCount"
          :enabled-count="enabledWechatRssSourceCount"
          :collection-message="wechatRssCollectionMessage"
          :operations="sourcesModel.operations"
          :is-action-pending="isActionPending"
          @add="openCreateWechatRssModal"
          @collect="handleManualWechatRssCollect"
          @edit="openEditWechatRssSource"
          @delete="handleDeleteWechatRssSource"
        />

        <WeiboTrendingCard
          :weibo-trending="sourcesModel.weiboTrending"
          :fixed-keyword-count="fixedWeiboKeywordCount"
          :collection-message="weiboTrendingMessage"
          :operations="sourcesModel.operations"
          :is-action-pending="isActionPending"
          @collect="handleManualWeiboTrendingCollect"
        />

        <AiTimelineOfficialSourcesCard
          :sources="publicOfficialAiTimelineSources"
          :events-model="aiTimelineEventsModel"
          :events-loading="isAiTimelineEventsLoading"
          :operations="sourcesModel.operations"
          :is-action-pending="isActionPending"
          @collect="handleManualAiTimelineCollect"
          @refresh-events="loadAiTimelineEvents"
          @set-visibility="handleSetAiTimelineEventVisibility"
          @save-manual-text="handleSaveAiTimelineEventManualText"
        />

        <SourceInventoryCard
          :sources="sourcesModel.sources"
          :operations="sourcesModel.operations"
          :now="relativeNow"
          :is-action-pending="isActionPending"
          @add="openCreateSourceModal"
          @collect="handleManualCollect"
          @edit="openEditSourceModal"
          @delete="handleDeleteSource"
          @toggle="handleToggleSource"
          @toggle-display-mode="handleToggleSourceDisplayMode"
        />
      </template>

      <RssSourceModal
        :open="isSourceModalOpen"
        :mode="sourceModalMode"
        :form="sourceForm"
        :error="sourceFormError"
        :submitting="isActionPending('source:submit')"
        @cancel="closeSourceModal"
        @submit="handleSubmitSource"
      />

      <TwitterAccountModal
        :open="isTwitterAccountModalOpen"
        :mode="twitterAccountModalMode"
        :form="twitterAccountForm"
        :error="twitterAccountFormError"
        :capability-message="twitterAccountCollectionMessage"
        :submitting="isActionPending('twitter-account:submit')"
        @cancel="closeTwitterAccountModal"
        @submit="handleSubmitTwitterAccount"
      />

      <HackerNewsQueryModal
        :open="isHackerNewsQueryModalOpen"
        :mode="hackerNewsQueryModalMode"
        :form="hackerNewsQueryForm"
        :error="hackerNewsQueryFormError"
        :capability-message="hackerNewsCollectionMessage"
        :submitting="isActionPending('hackernews-query:submit')"
        @cancel="closeHackerNewsQueryModal"
        @submit="handleSubmitHackerNewsQuery"
      />

      <BilibiliQueryModal
        :open="isBilibiliQueryModalOpen"
        :mode="bilibiliQueryModalMode"
        :form="bilibiliQueryForm"
        :error="bilibiliQueryFormError"
        :capability-message="bilibiliCollectionMessage"
        :submitting="isActionPending('bilibili-query:submit')"
        @cancel="closeBilibiliQueryModal"
        @submit="handleSubmitBilibiliQuery"
      />

      <WechatRssSourceModal
        :open="isWechatRssModalOpen"
        :mode="wechatRssModalMode"
        :form="wechatRssForm"
        :error="wechatRssFormError"
        :capability-message="wechatRssCollectionMessage"
        :submitting="isActionPending('wechat-rss:submit')"
        @cancel="closeWechatRssModal"
        @submit="handleSubmitWechatRssSources"
      />

      <TwitterKeywordModal
        :open="isTwitterKeywordModalOpen"
        :mode="twitterKeywordModalMode"
        :form="twitterKeywordForm"
        :error="twitterKeywordFormError"
        :capability-message="twitterKeywordCollectionMessage"
        :submitting="isActionPending('twitter-keyword:submit')"
        @cancel="closeTwitterKeywordModal"
        @submit="handleSubmitTwitterKeyword"
      />
    </div>
  </a-spin>
</template>
