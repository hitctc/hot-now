<!-- 文章详情弹窗：展示标题/立意/摘要 + 正文编辑器（左编辑右预览），底部悬浮工具栏 -->
<template>
  <a-modal
    :open="open"
    :closable="true"
    :mask-closable="true"
    :destroy-on-close="true"
    width="90%"
    centered
    wrap-class-name="article-detail-modal"
    :body-style="{ padding: '24px', overflowY: 'auto' }"
    :z-index="1000"
    @cancel="handleClose"
  >
    <template #title>
      <span v-if="article" class="flex items-center gap-2">
        <span
          class="cursor-pointer text-xs text-editorial-link-active hover:underline"
          @click="copyArticleId(article.id)"
        >#{{ article.id }}</span>
        <span class="text-base font-semibold">{{ getFirstTitle(article.titles) }}</span>
      </span>
    </template>

    <template #footer>
      <div v-if="article" class="article-detail-footer">
        <!-- 第一组：编辑操作（直接生效） -->
        <div class="article-detail-footer__group">
          <a-tooltip :mouse-enter-delay="0.5" title="保存正文内容到数据库">
            <a-button type="primary" :loading="saving" @click="handleSave">保存</a-button>
          </a-tooltip>
          <a-tooltip :mouse-enter-delay="0.5" title="按选定主题渲染后复制到剪贴板，可粘贴到公众号编辑器">
            <a-button :loading="wechatCopying" @click="copyAsWechatFormat">复制格式</a-button>
          </a-tooltip>
        </div>

        <div class="article-detail-footer__divider" />

        <!-- 第二组：内容生成（触发生成流程） -->
        <div class="article-detail-footer__group">
          <a-tooltip v-if="!pipelineOn" title="管线已紧急制动，请先恢复管线">
            <a-dropdown disabled>
              <a-button disabled>写文章</a-button>
            </a-dropdown>
          </a-tooltip>
          <a-dropdown v-else-if="article.sourceItemId">
            <a-button>写文章</a-button>
            <template #overlay>
              <a-menu @click="handleWriteMenuClick">
                <a-menu-item key="auto">自动判断</a-menu-item>
                <a-menu-item key="A">短篇观点文（A）</a-menu-item>
                <a-menu-item key="B">短篇随笔（B）</a-menu-item>
                <a-menu-item key="C">长篇观点文（C）</a-menu-item>
              </a-menu>
            </template>
          </a-dropdown>
          <a-button @click="imageActionVisible = true">手动生图</a-button>
          <a-button v-if="canRepairImagePrompts" :loading="repairingPrompts" @click="handleRepairImagePrompts">修复提示词</a-button>
        </div>

        <div class="article-detail-footer__divider" />

        <!-- 第三组：状态流转（二次确认） -->
        <div class="article-detail-footer__group">
          <a-button v-if="article.status === 'needs_review'" type="primary" @click="reviewModalVisible = true">审核</a-button>
          <a-button v-if="getAvailableActions(article).some(a => a.type === 'mark_publishable')" @click="handleDetailMarkPublishable">标记可推送</a-button>
          <a-tooltip v-else-if="getAvailableActions(article).some(a => a.type === 'mark_publishable_disabled')" :title="getAvailableActions(article).find(a => a.type === 'mark_publishable_disabled')!.missing.join('、')">
            <a-button disabled>不可推送</a-button>
          </a-tooltip>
          <a-button v-if="getAvailableActions(article).some(a => a.type === 'cancel_publishable')" @click="handleDetailCancelPublishable">取消推送</a-button>
          <a-tooltip v-if="canPush" :mouse-enter-delay="0.5" title="自动保存正文后推送到微信公众号草稿箱">
            <a-button type="primary" :loading="saving" @click="saveAndPush">推送草稿箱</a-button>
          </a-tooltip>
          <a-tooltip v-else-if="article.status !== 'needs_review'" :mouse-enter-delay="0.3">
            <template #title>{{ missingConditions.join('；') }}</template>
            <a-button type="primary" disabled>推送草稿箱</a-button>
          </a-tooltip>
        </div>
      </div>
    </template>

    <template v-if="article">
      <div class="flex flex-col gap-6">
        <!-- 顶部元信息 -->
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span class="text-xs text-editorial-text-muted">{{ modeLabel(article.mode) }}</span>
          <span class="text-xs text-editorial-text-muted">{{ formatLocalTime(article.createdAt) }}</span>
          <a
            class="inline-block max-w-[260px] truncate md:max-w-none md:whitespace-nowrap align-bottom cursor-pointer text-xs text-editorial-link-active hover:underline"
            @click.prevent="$emit('openSourceItem', article.sourceItemId)"
            >素材 #{{ article.sourceItemId }}{{ (article as any).sourceTitle ? ' · ' + (article as any).sourceTitle : '' }}{{ (article as any).sourceName ? ' · ' + (article as any).sourceName : '' }}</a>
        </div>

        <!-- 异常/审核信息（统一展示区） -->
        <section v-if="hasAnomalyInfo" class="rounded border bg-red-50 border-red-200 px-3 py-2.5 space-y-1">
          <div class="text-xs font-semibold text-red-700">
            {{ article.status === 'anomaly' ? '⚠ 异常' : article.status === 'needs_review' ? '⚠ 待审核' : '⚠ 警告' }}
          </div>
          <div v-if="article.anomalyReason" class="text-xs text-red-600">
            <span class="text-editorial-text-muted">异常原因：</span>{{ formatAnomalyReason(article.anomalyReason) }}
          </div>
          <div v-if="article.reasonCode" class="text-xs text-red-500">
            <span class="text-editorial-text-muted">异常代码：</span>
            <span class="font-mono">{{ article.reasonCode }}</span>
          </div>
          <div v-if="article.reasonText" class="text-xs text-red-500">
            <span class="text-editorial-text-muted">异常说明：</span>{{ article.reasonText }}
          </div>
          <div v-if="article.manualReviewReason || (article.manualReviewReasons?.length ?? 0) > 0" class="text-xs text-yellow-700">
            <span class="text-editorial-text-muted">审核标记：</span>
            <span v-if="article.manualReviewReason">{{ manualReviewReasonText }}</span>
            <span v-for="(r, i) in (article.manualReviewReasons ?? [])" :key="r">{{ i > 0 || article.manualReviewReason ? '、' : '' }}{{ formatReviewReason(r) }}</span>
          </div>
        </section>

        <!-- 备选标题 -->
        <section v-if="displayTitles.length > 0 || regenTitleLoading">
          <div class="mb-2 flex items-center justify-between">
            <h3 class="m-0 text-sm font-semibold text-editorial-text-muted">备选标题</h3>
            <div class="flex items-center gap-3">
              <a-button
                type="link"
                size="small"
                class="!p-0 !text-[11px]"
                :loading="regenTitleLoading"
                :disabled="regenTitleLoading"
                @click="handleRegenTitle"
              >{{ regenTitleLoading ? '生成中...' : '生成新标题' }}</a-button>
              <a-button type="link" size="small" class="!p-0 !text-[11px]" @click="copyText(displayTitles.join('\n'))">复制全部</a-button>
            </div>
          </div>
          <ul class="m-0 list-none space-y-1 pl-0">
            <li
              v-for="(t, idx) in displayTitles"
              :key="idx"
              class="group/title relative flex items-start gap-3 rounded-editorial-sm border px-3 py-2 transition-colors"
              :class="idx === activeTitleIndex
                ? 'border-editorial-accent ring-2 ring-editorial-ring'
                : 'border-editorial-border hover:border-editorial-link-active/40'"
            >
              <span class="flex-shrink-0 text-[11px] font-bold tabular-nums text-editorial-text-muted">{{ idx + 1 }}</span>
              <span class="flex-1 text-sm leading-6 text-editorial-text-main">{{ t }}</span>
              <span class="flex-shrink-0 text-[10px] text-editorial-text-muted">{{ countWords(t) }}字</span>
              <!-- 选中标记 -->
              <span
                v-if="idx === activeTitleIndex"
                class="flex-shrink-0 rounded bg-editorial-accent px-1.5 py-0.5 text-[10px] font-semibold text-white"
              >✓ 发布标题</span>
              <span v-if="idx === 0 && idx !== activeTitleIndex" class="flex-shrink-0 rounded bg-black/40 px-1 py-0.5 text-[10px] text-white">最新</span>
              <button
                v-if="idx !== activeTitleIndex"
                class="flex-shrink-0 rounded bg-black/50 px-1 py-0.5 text-[10px] text-white opacity-0 transition-opacity group-hover/title:opacity-100 hover:!bg-black/70"
                @click.stop="selectTitle(idx)"
              >设为发布标题</button>
              <a-button type="link" size="small" class="!p-0 !text-[11px] opacity-0 group-hover/title:opacity-100" @click="copyText(t)">复制</a-button>
            </li>
          </ul>
        </section>

        <!-- 核心立意（只读） -->
        <section v-if="article.thesis">
          <div class="mb-2 flex items-center justify-between">
            <h3 class="m-0 text-sm font-semibold text-editorial-text-muted">核心立意</h3>
            <a-button type="link" size="small" class="!p-0 !text-[11px]" @click="copyText(article.thesis!)">复制</a-button>
          </div>
          <p class="m-0 text-sm leading-7 text-editorial-text-body">{{ article.thesis }}</p>
        </section>

        <!-- 导语（始终显示，可重新生成） -->
        <section>
          <div class="mb-2 flex items-center justify-between">
            <h3 class="m-0 text-sm font-semibold text-editorial-text-muted">导语</h3>
            <div class="flex items-center gap-3">
              <a-button
                type="link"
                size="small"
                class="!p-0 !text-[11px]"
                :loading="regenIntroLoading"
                :disabled="regenIntroLoading"
                @click="handleRegenIntro"
              >{{ regenIntroLoading ? '生成中...' : '生成新导语' }}</a-button>
              <a-button v-if="displayIntros.length > 0" type="link" size="small" class="!p-0 !text-[11px]" @click="copyText(displayIntros[activeIntroIndex] ?? '')">复制</a-button>
            </div>
          </div>
          <p v-if="displayIntros.length === 0" class="m-0 text-sm text-editorial-text-muted">暂无导语，点击上方按钮生成</p>
          <ul v-else class="m-0 list-none space-y-1 pl-0">
            <li
              v-for="(text, idx) in displayIntros"
              :key="idx"
              class="group/intro relative flex items-start gap-3 rounded-editorial-sm border px-3 py-2 transition-colors"
              :class="idx === activeIntroIndex
                ? 'border-editorial-accent ring-2 ring-editorial-ring'
                : 'border-editorial-border hover:border-editorial-link-active/40'"
            >
              <span class="flex-shrink-0 text-[11px] font-bold tabular-nums text-editorial-text-muted">{{ idx + 1 }}</span>
              <span class="flex-1 text-sm leading-6 text-editorial-text-main">{{ text }}</span>
              <span class="flex-shrink-0 text-[10px] text-editorial-text-muted">{{ countWords(text) }}字</span>
              <span
                v-if="idx === activeIntroIndex"
                class="flex-shrink-0 rounded bg-editorial-accent px-1.5 py-0.5 text-[10px] font-semibold text-white"
              >✓ 发布</span>
              <span v-if="idx === 0 && idx !== activeIntroIndex" class="flex-shrink-0 rounded bg-black/40 px-1 py-0.5 text-[10px] text-white">最新</span>
              <button
                v-if="idx !== activeIntroIndex"
                class="flex-shrink-0 rounded bg-black/50 px-1 py-0.5 text-[10px] text-white opacity-0 transition-opacity group-hover/intro:opacity-100 hover:!bg-black/70"
                @click.stop="selectIntro(idx)"
              >设为发布</button>
            </li>
          </ul>
        </section>

        <!-- 百字摘要（只读展示） -->
        <section v-if="displaySummaries.length > 0">
          <div class="mb-2 flex items-center justify-between">
            <h3 class="m-0 text-sm font-semibold text-editorial-text-muted">百字摘要 <span class="font-normal text-[11px] text-editorial-text-muted/60">{{ charCount(displaySummaries[0]) }}字</span></h3>
            <a-button type="link" size="small" class="!p-0 !text-[11px]" @click="copyText(displaySummaries[0] ?? '')">复制</a-button>
          </div>
          <p class="m-0 text-sm leading-7 text-editorial-text-body">{{ displaySummaries[0] }}</p>
        </section>

        <!-- 相似度检测 -->
        <section v-if="article?.similarityCheck">
          <div class="mb-2">
            <h3 class="m-0 text-sm font-semibold text-editorial-text-muted">相似度检测</h3>
          </div>
          <template v-if="sc">
            <!-- 左中右三列布局 -->
            <div class="grid grid-cols-3 gap-3">
              <!-- 左：总览 + 规则检测 -->
              <div class="space-y-2">
                <div class="rounded border border-editorial-border bg-editorial-bg-page px-3 py-2 text-xs space-y-1">
                  <div class="font-medium text-editorial-text-body mb-1">总览</div>
                  <div class="flex justify-between"><span class="text-editorial-text-muted">风险等级</span><span class="font-medium" :class="sc.risk_level === 'high' ? 'text-red-500' : sc.risk_level === 'medium' ? 'text-yellow-600' : 'text-green-600'">{{ riskLevelLabel }}</span></div>
                  <div class="flex justify-between"><span class="text-editorial-text-muted">字面重复率</span><span>{{ Math.round((sc.literal_similarity ?? 0) * 100) }}%</span></div>
                </div>
                <!-- 规则检测 -->
                <div v-if="sc.rule_based" class="rounded border border-editorial-border bg-editorial-bg-page px-3 py-2 text-xs space-y-1">
                  <div class="font-medium text-editorial-text-body mb-1">规则检测</div>
                  <div class="flex justify-between"><span class="text-editorial-text-muted">字面重复率</span><span>{{ Math.round((sc.rule_based.literal_similarity ?? 0) * 100) }}%</span></div>
                  <div class="flex justify-between"><span class="text-editorial-text-muted">结构相似度</span><span>{{ Math.round((sc.rule_based.literal_structure_similarity ?? 0) * 100) }}%</span></div>
                  <div class="flex justify-between"><span class="text-editorial-text-muted">原文摘要相似度</span><span>{{ Math.round((sc.rule_based.source_content_similarity ?? 0) * 100) }}%</span></div>
                  <div class="flex justify-between"><span class="text-editorial-text-muted">最长连续重叠</span><span>{{ sc.rule_based.max_continuous_overlap_chars ?? 0 }} 字</span></div>
                  <div class="flex justify-between"><span class="text-editorial-text-muted">规则风险</span><span :class="sc.rule_based.risk_level === 'high' ? 'text-red-500' : sc.rule_based.risk_level === 'medium' ? 'text-yellow-600' : 'text-green-600'">{{ sc.rule_based.risk_level ?? '未知' }}</span></div>
                </div>
              </div>

              <!-- 中：LLM 实质审查 -->
              <div class="space-y-2">
                <template v-if="sc.llm_review && sc.llm_review.status === 'success'">
                  <div class="rounded border border-editorial-border bg-editorial-bg-page px-3 py-2 text-xs space-y-1">
                    <div class="font-medium text-editorial-text-body mb-1">LLM 实质审查</div>
                    <div class="flex justify-between"><span class="text-editorial-text-muted">来源依赖</span><span :class="riskDimClass(sc.llm_review.source_dependency)">{{ sc.llm_review.source_dependency }}</span></div>
                    <div class="flex justify-between"><span class="text-editorial-text-muted">叙事相似度</span><span :class="riskDimClass(sc.llm_review.narrative_similarity)">{{ sc.llm_review.narrative_similarity }}</span></div>
                    <div class="flex justify-between"><span class="text-editorial-text-muted">观点重叠</span><span :class="riskDimClass(sc.llm_review.claim_overlap)">{{ sc.llm_review.claim_overlap }}</span></div>
                    <div class="flex justify-between"><span class="text-editorial-text-muted">实体重叠</span><span :class="riskDimClass(sc.llm_review.entity_overlap)">{{ sc.llm_review.entity_overlap }}</span></div>
                    <div class="flex justify-between"><span class="text-editorial-text-muted">案例复用</span><span :class="riskDimClass(sc.llm_review.case_reuse)">{{ sc.llm_review.case_reuse }}</span></div>
                    <div class="flex justify-between"><span class="text-editorial-text-muted">第一人称风险</span><span :class="riskDimClass(sc.llm_review.first_person_risk)">{{ sc.llm_review.first_person_risk }}</span></div>
                    <div class="flex justify-between"><span class="text-editorial-text-muted">LLM 综合风险</span><span class="font-medium" :class="riskDimClass(sc.llm_review.overall_risk)">{{ sc.llm_review.overall_risk }}</span></div>
                    <div class="flex justify-between"><span class="text-editorial-text-muted">建议操作</span><span>{{ llmActionLabel }}</span></div>
                    <template v-if="sc.llm_review.reason">
                      <div class="mt-1 pt-1 border-t border-editorial-border">
                        <div class="text-editorial-text-muted mb-0.5">原因</div>
                        <a-tooltip :title="sc.llm_review.reason" placement="topLeft"><div class="line-clamp-2">{{ sc.llm_review.reason }}</div></a-tooltip>
                      </div>
                    </template>
                  </div>
                </template>
                <template v-else-if="sc.llm_review && sc.llm_review.status === 'failed'">
                  <div class="rounded border border-editorial-border bg-editorial-bg-page px-3 py-2 text-xs text-editorial-text-muted">LLM 审查失败{{ sc.llm_review.error ? `：${sc.llm_review.error}` : '' }}</div>
                </template>
                <template v-else-if="sc.llm_review">
                  <div class="rounded border border-editorial-border bg-editorial-bg-page px-3 py-2 text-xs text-editorial-text-muted">LLM 审查已跳过</div>
                </template>
              </div>

              <!-- 右：风险点（完整展示） -->
              <div class="space-y-2">
                <!-- 字面重复片段 -->
                <template v-if="sc.rule_based && (sc.rule_based.high_risk_segments?.length ?? 0) > 0">
                  <div class="rounded border border-editorial-border bg-editorial-bg-page px-3 py-2 text-xs">
                    <div class="font-medium text-editorial-text-body mb-1.5">字面重复片段（{{ sc.rule_based.high_risk_segments!.length }}）</div>
                    <div class="space-y-1.5">
                      <div v-for="(seg, i) in sc.rule_based.high_risk_segments" :key="i" class="rounded bg-white px-2 py-1.5 text-[11px] leading-relaxed border border-editorial-border">
                        <a-tooltip :title="seg.article_segment" placement="topLeft"><div class="line-clamp-2 text-editorial-text-muted">文章：<span class="text-editorial-text-body">{{ seg.article_segment }}</span></div></a-tooltip>
                        <a-tooltip :title="seg.source_segment" placement="topLeft"><div class="line-clamp-2 text-editorial-text-muted mt-0.5">原文：<span class="text-editorial-text-body">{{ seg.source_segment }}</span></div></a-tooltip>
                        <div class="text-editorial-text-muted mt-0.5">相似度：{{ Math.round((seg.similarity ?? 0) * 100) }}%</div>
                      </div>
                    </div>
                  </div>
                </template>
                <!-- LLM 高风险点（完整展示） -->
                <template v-if="sc.llm_review && sc.llm_review.status === 'success' && (sc.llm_review.high_risk_points?.length ?? 0) > 0">
                  <div class="rounded border border-editorial-border bg-editorial-bg-page px-3 py-2 text-xs">
                    <div class="font-medium text-editorial-text-body mb-1.5">高风险点（{{ sc.llm_review.high_risk_points!.length }}）</div>
                    <div class="space-y-1">
                      <div v-for="(point, i) in sc.llm_review.high_risk_points" :key="i" class="rounded bg-white px-2 py-1.5 text-[11px] leading-relaxed border border-editorial-border">{{ point }}</div>
                    </div>
                  </div>
                </template>
                <!-- 无风险点时的占位 -->
                <template v-if="(!sc.rule_based?.high_risk_segments?.length) && (!sc.llm_review?.high_risk_points?.length)">
                  <div class="rounded border border-editorial-border bg-editorial-bg-page px-3 py-2 text-xs text-editorial-text-muted">无风险片段</div>
                </template>
              </div>
            </div>
          </template>
        </section>
        <section v-else-if="article?.similarityCheck === null && article?.id">
          <div class="mb-2">
            <h3 class="m-0 text-sm font-semibold text-editorial-text-muted">相似度检测</h3>
          </div>
          <div class="text-xs text-editorial-text-muted">未检测</div>
        </section>

        <!-- 写作流程时间线 -->
        <StepTraceTimeline
          :step-trace="article?.stepTrace ?? null"
          :stop-step="article?.stopStep"
          :reason-text="article?.reasonText"
        />

        <!-- 开头钩子（只读） -->
        <section v-if="parseJsonArray(article.hooks).length > 0">
          <div class="mb-2 flex items-center justify-between">
            <h3 class="m-0 text-sm font-semibold text-editorial-text-muted">开头钩子</h3>
            <a-button type="link" size="small" class="!p-0 !text-[11px]" @click="copyText(parseJsonArray(article.hooks).join('\n'))">复制全部</a-button>
          </div>
          <ul class="m-0 list-none space-y-1 pl-0">
            <li
              v-for="(h, idx) in parseJsonArray(article.hooks)"
              :key="idx"
              class="group flex items-start gap-3 rounded-editorial-sm bg-editorial-panel/40 px-3 py-2"
            >
              <span class="flex-1 text-sm leading-6 text-editorial-text-body">{{ h }}</span>
              <a-button type="link" size="small" class="!p-0 !text-[11px] opacity-0 group-hover:opacity-100" @click="copyText(h)">复制</a-button>
            </li>
          </ul>
        </section>

        <!-- 可摘句（只读） -->
        <section v-if="parseJsonArray(article.quotes).length > 0">
          <div class="mb-2 flex items-center justify-between">
            <h3 class="m-0 text-sm font-semibold text-editorial-text-muted">可摘句</h3>
            <a-button type="link" size="small" class="!p-0 !text-[11px]" @click="copyText(parseJsonArray(article.quotes).join('\n'))">复制全部</a-button>
          </div>
          <ul class="m-0 list-inside list-disc pl-1">
            <li v-for="(q, idx) in parseJsonArray(article.quotes)" :key="idx" class="text-sm leading-6 text-editorial-text-body">{{ q }}</li>
          </ul>
        </section>

        <!-- 封面图 -->
        <section>
          <div class="mb-2 flex items-center justify-between">
            <h3 class="m-0 text-sm font-semibold text-editorial-text-muted">封面图</h3>
            <a-button
              type="link"
              size="small"
              class="!p-0 !text-[11px]"
              :loading="regenerating"
              :disabled="regenerating"
              @click="handleRegenCover"
            >{{ regenerating ? '生成中...' : (displayCoverImages.length > 0 ? '生成新封面图' : '生成封面图') }}</a-button>
          </div>
          <template v-if="displayCoverImages.length > 0">
            <a-image-preview-group>
              <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div
                  v-for="(url, idx) in displayCoverImages"
                  :key="idx"
                  class="relative overflow-hidden rounded-editorial-md border transition-all"
                  :class="idx === activeCoverIndex
                    ? 'border-editorial-accent ring-2 ring-editorial-ring'
                    : 'border-editorial-border opacity-60 hover:opacity-100 hover:border-editorial-link-active/40'"
                >
                  <a-image
                    :src="url"
                    :alt="`封面图 ${idx + 1}`"
                    class="block w-full object-cover"
                    loading="lazy"
                  />
                  <!-- 选中标记 / 最新标记 -->
                  <div
                    v-if="idx === activeCoverIndex"
                    class="absolute right-1 top-1 flex items-center gap-0.5 rounded bg-editorial-accent px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm"
                  >
                    <span class="inline-block h-3 w-3 leading-none text-center">✓</span> 发布封面
                  </div>
                  <div v-if="idx === 0 && idx !== activeCoverIndex" class="absolute left-1 top-1 rounded bg-black/40 px-1 py-0.5 text-[10px] text-white">最新</div>
                  <!-- 设为发布：始终可见，不遮挡图片 -->
                  <button
                    v-if="idx !== activeCoverIndex"
                    class="absolute right-1 bottom-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white hover:bg-black/80"
                    @click.stop="selectCoverImage(idx)"
                  >设为发布封面</button>
                </div>
              </div>
            </a-image-preview-group>
          </template>
          <div v-else class="flex items-center justify-center rounded-editorial-md border border-dashed border-editorial-border bg-editorial-bg-page px-4 py-6 text-xs text-editorial-text-muted">
            暂无封面图，点击上方按钮生成
          </div>
          <div v-if="article?.coverImagePrompt" class="mt-1.5 flex items-start gap-1.5 rounded border border-editorial-border bg-editorial-bg-page px-2 py-1">
            <span class="flex-1 text-[11px] leading-relaxed text-editorial-text-muted">Prompt（{{ charCount(article.coverImagePrompt) }}字）：{{ article.coverImagePrompt }}</span>
            <button class="shrink-0 text-[11px] text-editorial-link-active hover:underline" @click="copyPrompt(article.coverImagePrompt!)">复制</button>
          </div>
        </section>

        <!-- 正文配图 -->
        <section v-if="articleImages.length > 0 || inlineImageSlotCount > 0">
          <div class="mb-2 flex items-center justify-between">
            <h3 class="m-0 text-sm font-semibold text-editorial-text-muted">正文配图</h3>
            <div class="flex items-center gap-1">
              <template v-for="idx in totalImageSlotCount" :key="idx">
                <span class="inline-flex items-center gap-1">
                  <a-button
                    type="link"
                    size="small"
                    class="!p-0 !text-[11px]"
                    :loading="regenInlineImageLoading.has(idx)"
                    :disabled="regenInlineImageLoading.has(idx)"
                    @click="handleRegenInlineImage(idx)"
                  >{{ regenInlineImageLoading.has(idx) ? `配图${idx} 生成中...` : remainingImageSlots.includes(idx) ? `生成配图${idx}` : `生成新配图${idx}` }}</a-button>
                  <span v-if="idx < totalImageSlotCount" class="text-editorial-text-muted/40">|</span>
                </span>
              </template>
            </div>
          </div>
          <template v-if="articleImages.length > 0">
            <a-image-preview-group>
              <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div
                  v-for="(img, idx) in articleImages"
                  :key="idx"
                  class="relative overflow-hidden rounded-editorial-md border border-editorial-border"
                >
                  <a-image
                    :src="extractImageUrl(img)"
                    :alt="typeof img === 'object' && img.alt ? img.alt : `配图 ${idx + 1}`"
                    class="block w-full object-cover"
                    loading="lazy"
                  />
                  <div v-if="typeof img === 'object' && img.purpose" class="absolute right-1 top-1 rounded bg-black/50 px-1.5 py-0.5 text-[10px] text-white">
                    {{ img.purpose }}
                  </div>
                </div>
              </div>
            </a-image-preview-group>
          </template>
          <div v-else class="flex items-center justify-center rounded-editorial-md border border-dashed border-editorial-border bg-editorial-bg-page px-4 py-6 text-xs text-editorial-text-muted">
            正文含 {{ inlineImageSlotCount }} 张配图占位符未生成，点击上方按钮逐张补图
          </div>
          <template v-if="article?.inlineImagePrompts && Object.keys(article.inlineImagePrompts).length > 0">
            <div class="mt-1.5 space-y-1">
              <div v-for="(prompt, idx) in article.inlineImagePrompts" :key="idx" class="flex items-start gap-1.5 rounded border border-editorial-border bg-editorial-bg-page px-2 py-1">
                <span class="flex-1 text-[11px] leading-relaxed text-editorial-text-muted">配图{{ idx }} Prompt（{{ charCount(String(prompt)) }}字）：{{ prompt }}</span>
                <button class="shrink-0 text-[11px] text-editorial-link-active hover:underline" @click="copyPrompt(String(prompt))">复制</button>
              </div>
            </div>
          </template>
        </section>

        <!-- 正文：左右分屏编辑器 + 主题切换 -->
        <section>
          <div class="mb-2 flex items-center justify-between">
            <div class="flex items-center gap-2">
              <h3 class="m-0 text-sm font-semibold text-editorial-text-muted">正文</h3>
              <span class="text-[11px] text-editorial-text-muted">{{ countWords(editContent) }}字</span>
              <span v-if="lastSavedAt" class="text-[11px] text-editorial-text-muted">{{ lastSavedAt }}</span>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <div v-if="article.contentMarkdown" class="flex flex-wrap gap-1">
                <a-button
                  v-for="opt in previewThemeOptions"
                  :key="opt.key"
                  :type="activePreviewTheme === opt.key ? 'primary' : 'default'"
                  size="small"
                  class="!text-[11px] !px-2 !py-0.5"
                  @click="switchPreviewTheme(opt.key)"
                >{{ opt.label }}</a-button>
              </div>
              <a-button type="link" size="small" class="!p-0 !text-[11px]" @click="copyText(editContent)">复制原文</a-button>
              <a-button type="link" size="small" class="!p-0 !text-[11px]" @click="copyMarkdownAsPlainText(editContent)">复制纯文本</a-button>
              <a-button type="link" size="small" class="!p-0 !text-[11px]" @click="toggleEditorFullscreen">{{ editorFullscreen ? '退出全屏' : '全屏' }}</a-button>
            </div>
          </div>
          <div v-if="!editorFullscreen" class="article-editor-wrapper">
            <ArticleMarkdownEditor
              v-model="editContent"
              :preview-html="activePreviewHtml"
              :preview-label="activePreviewLabel"
            />
          </div>
        </section>
      </div>
    </template>

    <!-- 全屏编辑器覆盖层 -->
    <Teleport to="body">
      <div
        v-if="editorFullscreen && article"
        class="fixed inset-0 z-[9999] flex flex-col"
        style="background: var(--editorial-bg-page);"
      >
        <div class="fullscreen-toolbar flex flex-col gap-2 border-b px-3 py-2 md:flex-row md:flex-wrap md:items-center md:justify-between md:gap-x-4 md:gap-y-2 md:px-4" style="border-color: var(--editorial-border);">
          <div class="flex flex-wrap items-center gap-2">
            <h3 class="m-0 text-sm font-semibold" style="color: var(--editorial-text-main);">正文编辑（全屏）</h3>
            <span class="text-[11px]" style="color: var(--editorial-text-muted);">{{ countWords(editContent) }}字</span>
            <span v-if="lastSavedAt" class="text-[11px]" style="color: var(--editorial-text-muted);">{{ lastSavedAt }}</span>
          </div>
          <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
            <div class="flex flex-wrap gap-1">
              <a-button
                v-for="opt in previewThemeOptions"
                :key="opt.key"
                :type="activePreviewTheme === opt.key ? 'primary' : 'default'"
                size="small"
                class="!text-[11px] !px-2 !py-0.5"
                @click="switchPreviewTheme(opt.key)"
              >{{ opt.label }}</a-button>
            </div>
            <a-button type="link" size="small" class="!p-0 !text-[11px]" @click="copyText(editContent)">复制原文</a-button>
            <a-button type="link" size="small" class="!p-0 !text-[11px]" @click="copyMarkdownAsPlainText(editContent)">复制纯文本</a-button>
            <a-button type="link" size="small" class="!p-0 !text-[11px]" @click="handleSave" :loading="saving">保存</a-button>
            <a-button type="link" size="small" class="!p-0 !text-[11px]" @click="toggleEditorFullscreen">退出全屏</a-button>
          </div>
        </div>
        <div class="flex-1 overflow-hidden p-2 md:p-4">
          <ArticleMarkdownEditor
            v-model="editContent"
            :preview-html="activePreviewHtml"
            :preview-label="activePreviewLabel"
          />
        </div>
      </div>
    </Teleport>
  </a-modal>

  <!-- 审核弹窗（独立于详情弹窗，z-index 更高） -->
  <Teleport to="body">
    <ArticleReviewModal
      v-model:visible="reviewModalVisible"
      :article="article"
      @reviewed="handleReviewDone"
    />
  </Teleport>

  <!-- 手动生图弹窗 -->
  <ImageActionModal
    v-model:open="imageActionVisible"
    :article="article"
    @done="handleImageActionDone"
  />
</template>

<script setup lang="ts">
import { ref, watch, computed } from "vue";
import { message } from "ant-design-vue";

import ArticleMarkdownEditor from "./ArticleMarkdownEditor.vue";
import StepTraceTimeline from "./StepTraceTimeline.vue";
import ArticleReviewModal from "./ArticleReviewModal.vue";
import ImageActionModal from "./ImageActionModal.vue";
import { checkPublishConditions, getAvailableActions } from "./articleStatusShared.js";
import { usePipelineStatus } from "../../composables/usePipelineStatus.js";
import {
  editFinishedArticle,
  regenCover,
  regenTitle,
  regenIntro,
  regenInlineImage,
  writeSourceItemArticle,
  repairImagePrompts,
  parseArticleImages,
  extractImageUrl,
  type CreativeFinishedArticle,
  type WechatThemeId,
} from "../../services/creativeApi.js";
import { HttpError } from "../../services/http.js";
import { renderWechatThemePreview } from "../../services/wechatRenderer.js";

const props = defineProps<{
  open: boolean;
  article: CreativeFinishedArticle | null;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
  saved: [];
  openSourceItem: [sourceItemId: number];
  openPush: [article: CreativeFinishedArticle, themeId: WechatThemeId];
}>();

const { pipelineOn } = usePipelineStatus();

// ─── 重试生成图片提示词 ───

const IMAGE_PROMPT_ANOMALY_PREFIXES = [
  "image_prompt_missing",
  "image_prompt_count_mismatch",
  "image_prompt_parse_failed",
];

/** 判断当前文章是否为图片提示词异常，可以重试 */
const canRepairImagePrompts = computed(() => {
  if (!props.article?.anomalyReason) return false;
  return IMAGE_PROMPT_ANOMALY_PREFIXES.some(p => props.article!.anomalyReason!.startsWith(p));
});

const repairingPrompts = ref(false);

async function handleRepairImagePrompts(): Promise<void> {
  if (!props.article) return;
  repairingPrompts.value = true;
  try {
    const res = await repairImagePrompts(props.article.id);
    if (res.ok) {
      message.success("图片提示词修复成功");
      emit("saved");
    } else {
      message.error(res.error ?? "修复失败");
    }
  } catch {
    message.error("修复请求失败");
  } finally {
    repairingPrompts.value = false;
  }
}

// ─── 异常信息翻译 ───

const ANOMALY_REASON_MAP: Record<string, string> = {
  originality_risk_high: "原创风险过高",
  c_mode_word_count_insufficient: "C 模式字数不足",
  image_prompt_missing: "图片提示词缺失",
  image_prompt_count_mismatch: "图片提示词数量不匹配",
  image_prompt_parse_failed: "图片提示词解析失败",
};

const REVIEW_REASON_MAP: Record<string, string> = {
  originality_risk_high: "原创风险过高（originality_risk_high）",
  similarity_high: "相似度过高（similarity_high）",
  first_person_risk: "第一人称风险（first_person_risk）",
  c_mode_word_count_insufficient: "C 模式字数不足（c_mode_word_count_insufficient）",
};

/** 异常原因中文翻译 + 英文原文 */
function formatAnomalyReason(raw: string): string {
  for (const [key, cn] of Object.entries(ANOMALY_REASON_MAP)) {
    if (raw === key) return `${cn}（${key}）`;
    if (raw.startsWith(key + ":") || raw.startsWith(key + " - ")) {
      const rest = raw.slice(key.length).replace(/^[: -]+/, "");
      return `${cn}（${key}）${rest ? "——" + rest : ""}`;
    }
  }
  return raw;
}

/** 审核标记翻译 */
function formatReviewReason(raw: string): string {
  return REVIEW_REASON_MAP[raw] ?? raw;
}

/** 是否有任何异常信息需要展示 */
const hasAnomalyInfo = computed(() => {
  if (!props.article) return false;
  const a = props.article;
  return a.status === "anomaly" || a.status === "needs_review"
    || !!a.anomalyReason || !!a.reasonCode || !!a.reasonText
    || !!a.manualReviewReason || (a.manualReviewReasons?.length ?? 0) > 0;
});

// ─── 正文全屏编辑 ───
const editorFullscreen = ref(false);

function copyArticleId(id: number): void {
  navigator.clipboard.writeText(`【成品文章id: ${id}】`).then(() => {
    message.success("已复制");
  });
}

function copyPrompt(text: string): void {
  navigator.clipboard.writeText(text).then(() => {
    message.success("已复制");
  });
}

// 统计中文字符数（去掉空格、标点后的纯文字长度）
function charCount(text: string | null | undefined): number {
  if (!text) return 0;
  return text.replace(/[\s\n]/g, "").length;
}

function toggleEditorFullscreen(): void {
  editorFullscreen.value = !editorFullscreen.value;
  if (editorFullscreen.value) {
    document.body.style.overflow = "hidden";
  } else {
    document.body.style.overflow = "";
  }
}

// ESC 退出全屏
function handleFullscreenEsc(e: KeyboardEvent): void {
  if (e.key === "Escape" && editorFullscreen.value) {
    editorFullscreen.value = false;
    document.body.style.overflow = "";
  }
}

// ─── 正文编辑 ───

const editContent = ref("");
const saving = ref(false);
const lastSavedAt = ref("");
// 记住打开时的原始内容，用于判断是否真正发生变化
let lastSavedContent = "";

// ─── 标题选择 & 重新生成 ───

const regenTitleLoading = ref(false);
const activeTitleIndex = ref(0);
const localTitles = ref<string[]>([]);

const displayTitles = computed(() => {
  return localTitles.value.length > 0 ? localTitles.value : parseJsonArray(props.article?.titles ?? null);
});

async function handleRegenTitle(): Promise<void> {
  if (!props.article || regenTitleLoading.value) return;
  regenTitleLoading.value = true;
  try {
    const result = await regenTitle(props.article.id);
    if (result.ok && result.titles) {
      localTitles.value = result.titles;
      activeTitleIndex.value = 0;
      props.article.titles = JSON.stringify(result.titles);
      props.article.titleIndex = 0;

      // 联动：替换 markdown 中的 H1，渲染并保存 wechatHtml
      const newTitle = result.titles[0] ?? "";
      let md = editContent.value;
      if (/^# .+/m.test(md)) {
        md = md.replace(/^# .+/m, `# ${newTitle}`);
      }
      editContent.value = md;
      props.article.contentMarkdown = md;
      lastSavedContent = md;

      const saveFields: Record<string, unknown> = {
        titles: result.titles,
        titleIndex: 0,
        contentMarkdown: md,
      };
      if (activePreviewTheme.value !== "live" && md) {
        const html = renderWechatThemePreview(md, themeIdMap[activePreviewTheme.value]);
        props.article.wechatHtml = html;
        saveFields.wechatHtml = html;
      }
      editFinishedArticle(props.article.id, saveFields).catch(() => {});

      message.success("新标题已生成");
    } else {
      message.error(result.reason ?? "标题生成失败");
    }
  } catch {
    message.error("标题生成请求失败");
  } finally {
    regenTitleLoading.value = false;
  }
}

// 选择发布标题：替换 markdown 中的 H1，保存 titleIndex + contentMarkdown
async function selectTitle(idx: number): Promise<void> {
  if (!props.article || idx === activeTitleIndex.value) return;

  const titles = displayTitles.value;
  const oldTitle = titles[activeTitleIndex.value];
  const newTitle = titles[idx];

  // 替换 markdown 中的 H1 标题行
  let content = editContent.value;
  if (oldTitle && content.includes(oldTitle)) {
    content = content.replaceAll(oldTitle, newTitle);
  } else if (/^# .+/m.test(content)) {
    content = content.replace(/^# .+/m, `# ${newTitle}`);
  }

  activeTitleIndex.value = idx;
  editContent.value = content;

  try {
    const saveFields: Record<string, unknown> = {
      titleIndex: idx,
      contentMarkdown: content,
    };

    if (activePreviewTheme.value !== "live" && content) {
      const themeId = themeIdMap[activePreviewTheme.value];
      const html = renderWechatThemePreview(content, themeId);
      props.article.wechatHtml = html;
      saveFields.wechatHtml = html;
    }

    await editFinishedArticle(props.article.id, saveFields);
    props.article.titleIndex = idx;
    props.article.contentMarkdown = content;
    lastSavedContent = content;

    emit("saved");
  } catch { /* 静默失败，本地状态已更新 */ }
}

// ─── 导语选择 & 重新生成 ───

const regenIntroLoading = ref(false);
const activeIntroIndex = ref(0);
const localIntros = ref<string[]>([]);

const displayIntros = computed(() => {
  return localIntros.value.length > 0 ? localIntros.value : (props.article?.intros ?? []);
});

async function handleRegenIntro(): Promise<void> {
  if (!props.article || regenIntroLoading.value) return;
  regenIntroLoading.value = true;
  try {
    const result = await regenIntro(props.article.id);
    if (result.ok && result.intros) {
      localIntros.value = result.intros;
      activeIntroIndex.value = 0;
      props.article.intros = result.intros;
      props.article.introIndex = 0;

      // 联动：替换 markdown 中的 blockquote，渲染并保存 wechatHtml
      const newIntro = result.intros[0] ?? "";
      let md = editContent.value;
      const bqMatch = md.match(/\n\n(> [^\n]+(?:\n> [^\n]+)*)\n\n/);
      if (bqMatch) {
        md = md.replace(bqMatch[1], `> ${newIntro}`);
      }
      editContent.value = md;
      props.article.contentMarkdown = md;
      lastSavedContent = md;

      const saveFields: Record<string, unknown> = {
        intros: result.intros,
        introIndex: 0,
        contentMarkdown: md,
      };
      if (activePreviewTheme.value !== "live" && md) {
        const html = renderWechatThemePreview(md, themeIdMap[activePreviewTheme.value]);
        props.article.wechatHtml = html;
        saveFields.wechatHtml = html;
      }
      editFinishedArticle(props.article.id, saveFields).catch(() => {});

      message.success("新导语已生成");
    } else {
      message.error(result.reason ?? "导语生成失败");
    }
  } catch {
    message.error("导语生成请求失败");
  } finally {
    regenIntroLoading.value = false;
  }
}

async function selectIntro(idx: number): Promise<void> {
  if (!props.article || idx === activeIntroIndex.value) return;

  const intros = displayIntros.value;
  const selectedIntro = intros[idx];

  // 在 markdown 中替换/插入导语 blockquote
  let content = editContent.value;

  // 查找已有 blockquote（> 开头的连续段落，通常在标题之后、### 之前）
  const existingBqMatch = content.match(/\n\n(> [^\n]+(?:\n> [^\n]+)*)\n\n/);
  if (existingBqMatch) {
    content = content.replace(existingBqMatch[1], `> ${selectedIntro}`);
  } else {
    // 没有已有 blockquote，在 H1 标题后或封面图后插入
    const h1Match = /^(#[^\n]+)\n/.exec(content);
    if (h1Match) {
      content = content.replace(h1Match[0], `${h1Match[1]}\n\n> ${selectedIntro}\n\n`);
    } else {
      // 没有标题，在封面图后插入（封面图是 ![...](...) 格式）
      const coverMatch = /^!\[[^\]]*\]\([^)]+\)\n*/.exec(content);
      if (coverMatch) {
        content = content.slice(coverMatch[0].length);
        content = `${coverMatch[0]}\n> ${selectedIntro}\n\n${content}`;
      } else {
        content = `> ${selectedIntro}\n\n${content}`;
      }
    }
  }

  activeIntroIndex.value = idx;
  editContent.value = content;

  try {
    const saveFields: Record<string, unknown> = {
      introIndex: idx,
      contentMarkdown: content,
    };

    if (activePreviewTheme.value !== "live" && content) {
      const themeId = themeIdMap[activePreviewTheme.value];
      const html = renderWechatThemePreview(content, themeId);
      props.article.wechatHtml = html;
      saveFields.wechatHtml = html;
    }

    await editFinishedArticle(props.article.id, saveFields);
    props.article.introIndex = idx;
    props.article.contentMarkdown = content;
    lastSavedContent = content;

    emit("saved");
  } catch { /* 静默失败，本地状态已更新 */ }
}

// ─── 百字摘要（只读展示） ───

const displaySummaries = computed(() => {
  return props.article?.summary100 ?? [];
});

// 相似度检测数据
const sc = computed(() => {
  const raw = props.article?.similarityCheck;
  if (!raw || typeof raw !== "object") return null;
  return raw as {
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
});

const riskLevelLabel = computed(() => {
  const level = sc.value?.risk_level;
  if (level === "low") return "低";
  if (level === "medium") return "中";
  if (level === "high") return "高";
  return "未知";
});

// 人工审核原因可读文本
const manualReviewReasonText = computed(() => {
  const reason = props.article?.manualReviewReason;
  if (reason === "originality_risk_high") return "原创风险过高";
  if (reason === "similarity_high") return "相似度过高";
  if (reason === "first_person_risk") return "第一人称风险";
  if (reason === "c_mode_word_count_insufficient") return "C 模式字数不足";
  return reason ?? "";
});

// LLM 建议操作可读文本
const llmActionLabel = computed(() => {
  const action = sc.value?.llm_review?.suggested_action;
  if (action === "pass") return "通过";
  if (action === "revise") return "建议修改";
  if (action === "manual_review") return "人工审核";
  return action ?? "未知";
});

// 风险维度颜色
function riskDimClass(level: string | undefined): string {
  if (level === "high") return "text-red-500";
  if (level === "medium") return "text-yellow-600";
  return "text-green-600";
}

// 审核弹窗
const reviewModalVisible = ref(false);

// 手动生图弹窗
const imageActionVisible = ref(false);

function handleReviewDone(): void {
  emit("saved");
}

function handleImageActionDone(): void {
  tickArticleChange();
  emit("saved");
}

// ─── 写文章（统一走 write-article 异步接口） ───

const writeArticleSubmitting = ref(false);

function handleWriteMenuClick({ key }: { key: string }): void {
  void handleWriteArticle(key === "auto" ? undefined : key);
}

async function handleWriteArticle(mode?: string): Promise<void> {
  if (!props.article || writeArticleSubmitting.value) return;
  writeArticleSubmitting.value = true;
  try {
    const result = await writeSourceItemArticle(props.article.sourceItemId, mode);
    if (result.ok) {
      message.success(`写作任务已提交${result.status === "queued" ? "（排队中）" : ""}，完成后可在成品文章列表查看`);
    } else {
      message.error(result.reason ?? "写文章失败");
    }
  } catch (err) {
    // 409 = 素材已在写作中或已排队
    if (err instanceof HttpError && err.status === 409) {
      const detail = (err.body as { error?: string })?.error ?? "该素材正在写作中";
      message.warning(detail);
    } else {
      message.error("写文章请求失败");
    }
  } finally {
    writeArticleSubmitting.value = false;
  }
}

// ─── 正文配图重新生成 ───

const regenInlineImageLoading = ref<Set<number>>(new Set());

const articleImages = computed(() => {
  return parseArticleImages(props.article?.imagesJson ?? null);
});

// 检测正文中剩余的 [IMAGE1]/[IMAGE2] 占位符索引
const remainingImageSlots = computed(() => {
  if (!editContent.value) return [];
  const matches = editContent.value.match(/\[IMAGE(\d+)\]/gi) ?? [];
  return matches.map(m => parseInt(m.replace(/\[IMAGE|\]/gi, ""), 10));
});

// 总配图槽数 = 已生成 + 未替换占位符的最大索引
const totalImageSlotCount = computed(() => {
  const fromImages = articleImages.value.length;
  const fromPlaceholders = remainingImageSlots.value.length > 0 ? Math.max(...remainingImageSlots.value) : 0;
  return Math.max(fromImages, fromPlaceholders);
});

const inlineImageSlotCount = computed(() => remainingImageSlots.value.length);

// 正文配图是否完整（占位符已全部替换为实际图片）
const inlineImagesComplete = computed(() => {
  return articleImages.value.length > 0 && inlineImageSlotCount.value === 0;
});

async function handleRegenInlineImage(imageIndex: number): Promise<void> {
  if (!props.article || regenInlineImageLoading.value.has(imageIndex)) return;
  regenInlineImageLoading.value = new Set([...regenInlineImageLoading.value, imageIndex]);
  try {
    const result = await regenInlineImage(props.article.id, imageIndex);
    if (result.ok) {
      // Hermes 已回写 contentMarkdown 和 images，更新本地状态并同步保存 wechatHtml
      if (result.contentMarkdown) {
        editContent.value = result.contentMarkdown;
        props.article.contentMarkdown = result.contentMarkdown;
        lastSavedContent = result.contentMarkdown;

        // 同步渲染并保存公众号预览 HTML（总是更新，live 模式用 bauhaus 兜底）
        const saveFields: Record<string, unknown> = { contentMarkdown: result.contentMarkdown };
        const themeId = activePreviewTheme.value !== "live"
          ? themeIdMap[activePreviewTheme.value]
          : "bauhaus" as WechatThemeId;
        const html = renderWechatThemePreview(result.contentMarkdown, themeId);
        props.article.wechatHtml = html;
        saveFields.wechatHtml = html;
        editFinishedArticle(props.article.id, saveFields).catch(() => {});
      }
      if (result.images) {
        props.article.imagesJson = result.images as typeof props.article.imagesJson;
      }
      message.success(`配图 ${imageIndex} 已重新生成`);
      tickArticleChange();
    } else {
      message.error(result.reason ?? "配图生成失败");
    }
  } catch {
    message.error("配图生成请求失败");
  } finally {
    regenInlineImageLoading.value = new Set([...regenInlineImageLoading.value].filter(i => i !== imageIndex));
  }
}

// ─── 封面图选择 & 重新生成 ───

const activeCoverIndex = ref(0);
const regenerating = ref(false);
// 本地缓存最新的 coverImage 数组，regen 后不依赖父组件刷新
const localCoverImages = ref<string[]>([]);

const displayCoverImages = computed(() => {
  const src = localCoverImages.value.length > 0 ? localCoverImages.value : (props.article?.coverImage ?? []);
  return src.slice(0, 10);
});

async function handleRegenCover(): Promise<void> {
  if (!props.article || regenerating.value) return;
  regenerating.value = true;
  try {
    const result = await regenCover(props.article.id);
    if (result.ok && result.coverImage) {
      localCoverImages.value = result.coverImage;
      activeCoverIndex.value = 0;
      props.article.coverImage = result.coverImage;
      props.article.coverImageIndex = 0;

      // 联动：替换 markdown 中的封面图行，渲染并保存 wechatHtml
      const newUrl = result.coverImage[0] ?? "";
      let md = editContent.value;
      const coverRegex = /^!\[封面图[^\]]*\]\([^)]+\)/m;
      if (newUrl && coverRegex.test(md)) {
        md = md.replace(coverRegex, `![封面图](${newUrl})`);
      } else if (newUrl) {
        md = `![封面图](${newUrl})\n\n${md}`;
      }
      editContent.value = md;
      props.article.contentMarkdown = md;
      lastSavedContent = md;

      const saveFields: Record<string, unknown> = {
        coverImageIndex: 0,
        contentMarkdown: md,
      };
      if (activePreviewTheme.value !== "live" && md) {
        const html = renderWechatThemePreview(md, themeIdMap[activePreviewTheme.value]);
        props.article.wechatHtml = html;
        saveFields.wechatHtml = html;
      }
      editFinishedArticle(props.article.id, saveFields).catch(() => {});

      message.success("新封面图已生成");
      tickArticleChange();
    } else {
      message.error(result.reason ?? "封面图生成失败");
    }
  } catch {
    message.error("封面图生成请求失败");
  } finally {
    regenerating.value = false;
  }
}

async function selectCoverImage(idx: number): Promise<void> {
  if (!props.article || idx === activeCoverIndex.value) return;

  const imgs = displayCoverImages.value;
  const oldUrl = imgs[activeCoverIndex.value];
  const newUrl = imgs[idx];

  // 精确替换 markdown 中的封面图行，避免 URL 重复导致误替换或额外插入
  let content = editContent.value;
  const coverLineRegex = /^!\[封面图[^\]]*\]\([^)]+\)/m;
  if (coverLineRegex.test(content)) {
    content = content.replace(coverLineRegex, `![封面图](${newUrl})`);
  } else if (newUrl) {
    content = `![封面图](${newUrl})\n\n${content}`;
  }

  activeCoverIndex.value = idx;
  editContent.value = content;

  try {
    const saveFields: Record<string, unknown> = {
      coverImageIndex: idx,
      contentMarkdown: content,
    };

    if (activePreviewTheme.value !== "live" && content) {
      const themeId = themeIdMap[activePreviewTheme.value];
      const html = renderWechatThemePreview(content, themeId);
      props.article.wechatHtml = html;
      saveFields.wechatHtml = html;
    }

    await editFinishedArticle(props.article.id, saveFields);
    props.article.coverImageIndex = idx;
    props.article.contentMarkdown = content;
    lastSavedContent = content;

    emit("saved");
  } catch { /* 静默失败，本地状态已更新 */ }
}

// 10 秒防抖自动保存正文
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

watch(editContent, (val) => {
  if (!props.open || val === lastSavedContent) return;
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    if (val !== lastSavedContent && props.article) {
      doSaveContent(val);
    }
  }, 10_000);
});

watch(() => props.open, (val) => {
  if (val && props.article) {
    const md = props.article.contentMarkdown || "";
    editContent.value = md;
    lastSavedContent = md;
    // 重置本地缓存状态
    localCoverImages.value = [];
    localTitles.value = [];
    localIntros.value = [];
    activeCoverIndex.value = props.article.coverImageIndex ?? 0;
    activeTitleIndex.value = props.article.titleIndex ?? 0;
    activeIntroIndex.value = props.article.introIndex ?? 0;
    if (autoSaveTimer) { clearTimeout(autoSaveTimer); autoSaveTimer = null; }
    editorFullscreen.value = false;
    document.body.style.overflow = "";
    document.addEventListener("keydown", handleFullscreenEsc);
    // 恢复文章保存的主题偏好，无记录时默认包豪斯
    const saved = props.article.wechatThemeId;
    const previewKey = saved ? reverseThemeIdMap[saved] : undefined;
    activePreviewTheme.value = previewKey ?? "bauhaus";
  }
});

async function doSaveContent(content: string): Promise<void> {
  if (!props.article) return;
  saving.value = true;
  try {
    await editFinishedArticle(props.article.id, { contentMarkdown: content });
    lastSavedContent = content;
    lastSavedAt.value = `保存成功(${new Date().toLocaleTimeString("zh-CN", { hour12: false })})`;
    emit("saved");
  } catch {
    message.error("自动保存失败");
  } finally {
    saving.value = false;
  }
}

async function handleSave(): Promise<void> {
  if (!props.article) return;
  saving.value = true;
  try {
    await editFinishedArticle(props.article.id, {
      contentMarkdown: editContent.value,
    });
    lastSavedContent = editContent.value;
    lastSavedAt.value = `保存成功(${new Date().toLocaleTimeString("zh-CN", { hour12: false })})`;
    emit("saved");
  } catch {
    message.error("保存失败");
  } finally {
    saving.value = false;
  }
}

// 推送前先保存正文，确保 DB 中是最新内容
async function saveAndPush(): Promise<void> {
  if (!props.article) return;
  // 取消自动保存定时器，手动触发一次保存
  if (autoSaveTimer) { clearTimeout(autoSaveTimer); autoSaveTimer = null; }
  if (editContent.value !== lastSavedContent) {
    await doSaveContent(editContent.value);
  }
  emit("openPush", props.article, currentWechatThemeId.value);
}

function handleClose(): void {
  if (editorFullscreen.value) {
    editorFullscreen.value = false;
    document.body.style.overflow = "";
  }
  document.removeEventListener("keydown", handleFullscreenEsc);
  emit("update:open", false);
}

// ─── 预览主题切换 ───

type PreviewThemeKey = "live" | "bauhaus" | "sunsetFilm" | "receipt";

const previewThemeOptions: { key: PreviewThemeKey; label: string }[] = [
  { key: "bauhaus", label: "包豪斯" },
  { key: "sunsetFilm", label: "落日胶片" },
  { key: "receipt", label: "购物小票" },
  { key: "live", label: "实时预览" },
];

const activePreviewTheme = ref<PreviewThemeKey>("live");

const themeIdMap: Record<Exclude<PreviewThemeKey, "live">, WechatThemeId> = {
  bauhaus: "bauhaus",
  sunsetFilm: "sunset-film",
  receipt: "receipt",
};

const reverseThemeIdMap: Record<string, Exclude<PreviewThemeKey, "live">> = {
  bauhaus: "bauhaus",
  "sunset-film": "sunsetFilm",
  receipt: "receipt",
};

// 切换预览主题：客户端即时渲染
function switchPreviewTheme(key: PreviewThemeKey): void {
  activePreviewTheme.value = key;
  if (key === "live" || !editContent.value) return;

  const themeId = themeIdMap[key];
  const html = renderWechatThemePreview(editContent.value, themeId);

  // 首次选中该主题时保存偏好和渲染结果
  if (props.article && (props.article.wechatThemeId !== themeId || props.article.wechatHtml !== html)) {
    props.article.wechatThemeId = themeId;
    props.article.wechatHtml = html;
    editFinishedArticle(props.article.id, { wechatThemeId: themeId, wechatHtml: html }).catch(() => {});
  }
}

// 根据当前选中的预览主题返回 HTML，编辑时即时重新渲染
const activePreviewHtml = computed(() => {
  if (activePreviewTheme.value === "live") return "";
  const themeId = themeIdMap[activePreviewTheme.value];
  if (!editContent.value) return "";
  return renderWechatThemePreview(editContent.value, themeId);
});

const activePreviewLabel = computed(() => {
  const opt = previewThemeOptions.find(o => o.key === activePreviewTheme.value);
  return opt?.label ?? "预览";
});

// ─── 辅助函数 ───

function parseJsonArray(raw: string | string[] | null): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const modeMap: Record<string, string> = {
  A: "模式A · 短篇观点文",
  B: "模式B · 短篇观察随笔",
};

function modeLabel(mode: string | null): string {
  if (!mode) return "模式 -";
  return modeMap[mode] ?? `模式${mode}`;
}

/** 计算中文字数：中文按字数计，英文按单词计 */
function countWords(text: string): number {
  const chinese = text.match(/[一-鿿㐀-䶿]/g);
  const chineseCount = chinese ? chinese.length : 0;
  const withoutChinese = text.replace(/[一-鿿㐀-䶿]/g, " ");
  const englishWords = withoutChinese.match(/[a-zA-Z0-9]+/g);
  const englishCount = englishWords ? englishWords.length : 0;
  return chineseCount + englishCount;
}

function getFirstTitle(titles: string | null): string {
  const parsed = parseJsonArray(titles);
  return parsed.length > 0 ? parsed[0] : "无标题";
}

function formatLocalTime(value: string): string {
  const fixed = /^[0-9]{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(value) && !/[Zz+\-]\d{0,4}$/.test(value)
    ? value.replace(" ", "T") + "Z"
    : value;
  const date = new Date(fixed);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

// 当前主题对应的 WechatThemeId（用于复制公众号格式和推送）
const currentWechatThemeId = computed<WechatThemeId>(() => {
  if (activePreviewTheme.value !== "live") {
    return themeIdMap[activePreviewTheme.value as Exclude<PreviewThemeKey, "live">];
  }
  // 实时预览模式下回退到文章保存的主题
  return (props.article?.wechatThemeId as WechatThemeId) ?? "bauhaus";
});

// ─── 微信公众号格式复制 ───

const wechatCopying = ref(false);

async function copyAsWechatFormat(): Promise<void> {
  if (!editContent.value) {
    message.warning("文章无正文内容");
    return;
  }
  if (!props.article) return;
  wechatCopying.value = true;
  try {
    const html = renderWechatThemePreview(editContent.value, currentWechatThemeId.value);
    const htmlBlob = new Blob([html], { type: "text/html" });
    const textBlob = new Blob([editContent.value], { type: "text/plain" });
    await navigator.clipboard.write([
      new ClipboardItem({ "text/html": htmlBlob, "text/plain": textBlob })
    ]);
    message.success("已复制公众号格式，可直接粘贴到编辑器");
  } catch {
    message.error("复制失败，请检查浏览器剪贴板权限");
  } finally {
    wechatCopying.value = false;
  }
}

// ─── 纯文本复制 ───

async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
  message.success("已复制到剪贴板");
}

async function copyMarkdownAsPlainText(mdText: string): Promise<void> {
  const text = mdText
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`(.*?)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^[-*]\s+/gm, "")
    .replace(/^>\s+/gm, "")
    .replace(/---+/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  await navigator.clipboard.writeText(text);
  message.success("已复制纯文本到剪贴板");
}

// ─── 推送条件检查（复用共享模块） ───
// props.article 深层属性修改不会触发响应式，用一个计数器手动刷新
const articleChangeTick = ref(0);
function tickArticleChange() { articleChangeTick.value++; }

const canPush = computed(() => {
  void articleChangeTick.value;
  const article = props.article;
  if (!article) return false;
  if (article.status !== "ready_for_publish" && article.status !== "wechat_draft") return false;
  return checkPublishConditions(article).qualified;
});

const missingConditions = computed(() => {
  void articleChangeTick.value;
  const article = props.article;
  if (!article) return [];
  const missing: string[] = [];
  if (article.status !== "ready_for_publish" && article.status !== "wechat_draft") missing.push("状态不允许推送");
  missing.push(...checkPublishConditions(article).missing);
  return missing;
});

// ─── 状态操作（标记可推送 / 取消推送标记） ───

async function handleDetailMarkPublishable(): Promise<void> {
  if (!props.article) return;
  const { Modal } = await import("ant-design-vue");
  const confirmed = await new Promise<boolean>(resolve => {
    Modal.confirm({
      title: "标记可推送",
      content: "确认标记该文章为可推送？后续可在平台手动推送到微信公众号草稿箱。",
      okText: "确认", cancelText: "取消",
      onOk: () => resolve(true), onCancel: () => resolve(false),
    });
  });
  if (!confirmed) return;
  try {
    const res = await editFinishedArticle(props.article.id, { status: "ready_for_publish" } as any);
    if (res.ok) {
      message.success("已标记为可推送");
      emit("saved");
    } else {
      message.error("操作失败");
    }
  } catch (err: unknown) {
    const httpErr = err as { body?: { reason?: string } };
    message.error(httpErr?.body?.reason ?? "操作失败");
  }
}

async function handleDetailCancelPublishable(): Promise<void> {
  if (!props.article) return;
  const { Modal } = await import("ant-design-vue");
  const confirmed = await new Promise<boolean>(resolve => {
    Modal.confirm({
      title: "取消推送标记",
      content: "确认取消推送标记？文章将回到已生成状态。",
      okText: "确认", cancelText: "取消",
      onOk: () => resolve(true), onCancel: () => resolve(false),
    });
  });
  if (!confirmed) return;
  try {
    const res = await editFinishedArticle(props.article.id, { status: "generated" } as any);
    if (res.ok) {
      message.success("已取消推送标记");
      emit("saved");
    } else {
      message.error("操作失败");
    }
  } catch (err: unknown) {
    const httpErr = err as { body?: { reason?: string } };
    message.error(httpErr?.body?.reason ?? "操作失败");
  }
}
</script>

<style>
/* 弹窗打开时禁止蒙层滚动 */
.article-detail-modal {
  overflow: hidden !important;
}
/* modal content 固定 90vh，body 内部滚动 */
.article-detail-modal .ant-modal-content {
  max-height: 100vh;
  display: flex;
  flex-direction: column;
}
.article-detail-modal .ant-modal-header {
  flex-shrink: 0;
}
.article-detail-modal .ant-modal-body {
  background: #ffffff;
  flex: 1;
  overflow-y: auto;
}
.article-detail-modal .ant-modal-footer {
  flex-shrink: 0;
  border-top: 1px solid #f0f0f0;
  padding: 12px 24px;
}

/* ─── 移动端适配 ─── */
@media (max-width: 768px) {
  /* wrap 容器改为顶部对齐，覆盖 centered 的垂直居中 */
  .article-detail-modal .ant-modal-wrap {
    align-items: flex-start !important;
    padding: 0 !important;
  }
  .article-detail-modal .ant-modal {
    max-width: 100% !important;
    width: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
    top: 0 !important;
  }
  .article-detail-modal .ant-modal-content {
    max-height: 100dvh;
    border-radius: 0;
  }
  .article-detail-modal .ant-modal-body {
    padding: 12px !important;
  }
  .article-detail-modal .ant-modal-header {
    padding: 12px 16px !important;
  }
  .article-detail-modal .ant-modal-footer {
    padding: 8px 12px !important;
  }
  .article-detail-footer {
    flex-wrap: wrap;
    gap: 8px !important;
  }
  .article-detail-footer__divider {
    display: none;
  }
  .article-detail-footer__group {
    flex-wrap: wrap;
    gap: 4px;
  }
  .article-detail-footer .ant-btn {
    font-size: 12px !important;
    padding: 0 8px !important;
    height: 28px !important;
  }
  .article-editor-wrapper {
    height: calc(100dvh - 600px);
    min-height: 200px;
  }
  /* 全屏编辑器工具栏：移动端紧凑布局 */
  .fullscreen-toolbar {
    overflow: visible;
  }
  .fullscreen-toolbar .ant-btn {
    font-size: 11px !important;
    padding: 0 6px !important;
    height: 24px !important;
    line-height: 24px !important;
  }
}

.article-detail-footer {
  display: flex;
  align-items: center;
  gap: 0;
}
.article-detail-footer__group {
  display: flex;
  align-items: center;
  gap: 8px;
}
.article-detail-footer__divider {
  width: 1px;
  height: 20px;
  background: #e5e7eb;
  margin: 0 12px;
  flex-shrink: 0;
}

.article-editor-wrapper {
  height: calc(100vh - 480px);
  min-height: 300px;
}

.article-markdown-body {
  font-size: 14px;
  line-height: 1.75;
  color: #374151;
}
.article-markdown-body h1,
.article-markdown-body h2,
.article-markdown-body h3,
.article-markdown-body h4 {
  margin: 1em 0 0.5em;
  font-weight: 600;
  color: #111827;
}
.article-markdown-body h1 { font-size: 1.25em; }
.article-markdown-body h2 { font-size: 1.15em; }
.article-markdown-body h3 { font-size: 1.05em; }
.article-markdown-body p { margin: 0.5em 0; }
.article-markdown-body ul,
.article-markdown-body ol {
  margin: 0.5em 0;
  padding-left: 1.5em;
}
.article-markdown-body li { margin: 0.25em 0; }
.article-markdown-body blockquote {
  margin: 0.75em 0;
  padding: 0.5em 1em;
  border-left: 3px solid #d1d5db;
  color: #6b7280;
  background: #f9fafb;
  border-radius: 0 4px 4px 0;
}
.article-markdown-body img {
  max-width: 100%;
  height: auto;
  border-radius: 6px;
  margin: 0.75em 0;
}
.article-markdown-body a {
  color: #caa9fa;
  text-decoration: underline;
}
.article-markdown-body strong { font-weight: 600; }
.article-markdown-body code {
  background: #f3f4f6;
  padding: 0.15em 0.35em;
  border-radius: 3px;
  font-size: 0.9em;
}
.article-markdown-body hr {
  border: none;
  border-top: 1px solid #e5e7eb;
  margin: 1em 0;
}
</style>
