<script setup lang="ts">
import EditorialEmptyState from "../../content/EditorialEmptyState.vue";
import {
  editorialContentCardClass,
  editorialContentControlButtonClass,
  editorialContentControlButtonDangerClass,
  editorialContentControlButtonIdleClass
} from "../../content/contentCardShared";
import type { SettingsProviderSettingsSummary, SettingsViewRulesResponse } from "../../../services/settingsApi";
import {
  formatDateTime,
  formatProviderLabel,
  providerKindOptions,
  type AlertTone
} from "./viewRulesPageShared";

defineProps<{
  apiKey: string;
  isProviderActionPending: (actionKey: string) => boolean;
  providerCapability: SettingsViewRulesResponse["providerCapability"];
  providerCapabilityTone: AlertTone;
  providerKind: string;
  providerSettings: SettingsProviderSettingsSummary[];
  selectedProviderStatus: { tone: AlertTone; message: string };
}>();

defineEmits<{
  "delete-provider": [providerKind: string];
  "save-provider": [];
  "toggle-provider": [settings: SettingsProviderSettingsSummary];
  "update-api-key": [apiKey: string];
  "update-provider-kind": [providerKind: string];
}>();
</script>

<template>
  <section data-settings-section="provider-settings">
    <a-card
      :class="editorialContentCardClass"
      title="LLM 设置"
      size="small"
      data-view-rules-section="provider-settings"
    >
      <template #extra>
        <a-tag color="default">暂未使用</a-tag>
      </template>

      <div class="flex flex-col gap-4">
        <a-alert
          data-view-rules-provider-alert
          :class="['editorial-inline-alert', `editorial-inline-alert--${providerCapabilityTone}`]"
          :message="'当前版本会继续保存厂商配置，但不会把它用于筛选策略或重算。'"
          :description="providerCapability.message"
          show-icon
        />

        <div class="rounded-editorial-md border border-editorial-border bg-editorial-panel px-4 py-4">
          <p data-view-rules-provider-status-note class="m-0 text-sm leading-6 text-editorial-text-body">
            当前只保留配置入口，后续真正接入时会直接复用这里的厂商设置；现在保存、启用或删除都不会影响反馈池展示。
          </p>

          <a-alert
            data-view-rules-selected-provider-status
            :class="['mt-4 editorial-inline-alert', `editorial-inline-alert--${selectedProviderStatus.tone}`]"
            :message="selectedProviderStatus.message"
            :type="selectedProviderStatus.tone"
            show-icon
          />

          <form
            class="mt-4 grid gap-3 md:grid-cols-[220px_minmax(0,1fr)_auto]"
            data-view-rules-provider-form
            @submit.prevent="$emit('save-provider')"
          >
            <a-select
              :value="providerKind"
              :options="providerKindOptions"
              data-provider-kind-input
              @update:value="$emit('update-provider-kind', String($event))"
            />
            <a-input-password
              :value="apiKey"
              placeholder="输入或更新 API Key"
              data-provider-api-key-input
              @update:value="$emit('update-api-key', String($event))"
            />
            <a-button
              type="primary"
              html-type="submit"
              data-action="save-provider-settings"
              :loading="isProviderActionPending(`provider:save:${providerKind}`)"
            >
              保存设置
            </a-button>
          </form>
        </div>

        <EditorialEmptyState
          v-if="providerSettings.length === 0"
          data-empty-state="provider-settings"
          title="还没有保存任何厂商配置"
          description="先保存 API Key，后续真正接入筛选逻辑时会直接复用这里的配置。"
        />

        <div v-else class="flex flex-col gap-3">
          <article
            v-for="settings in providerSettings"
            :key="settings.providerKind"
            :data-provider-row="settings.providerKind"
            class="flex flex-col gap-3 rounded-editorial-md border border-editorial-border bg-editorial-panel px-4 py-4"
          >
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div class="flex flex-wrap items-center gap-2">
                  <h3 class="m-0 text-base font-semibold text-editorial-text-main">
                    {{ formatProviderLabel(settings.providerKind) }}
                  </h3>
                  <a-tag :color="settings.isEnabled ? 'green' : 'default'">
                    {{ settings.isEnabled ? "已启用" : "未启用" }}
                  </a-tag>
                </div>
                <p class="mt-2 mb-0 text-sm leading-6 text-editorial-text-body">
                  已保存 API Key，尾号 {{ settings.apiKeyLast4 }}。
                </p>
                <p class="mt-1 mb-0 text-xs leading-5 text-editorial-text-muted">
                  最近更新：{{ formatDateTime(settings.updatedAt) }}
                </p>
              </div>

              <div class="flex flex-wrap items-center gap-2">
                <a-button
                  :class="[editorialContentControlButtonClass, editorialContentControlButtonIdleClass]"
                  :data-provider-activation="settings.providerKind"
                  :loading="isProviderActionPending(`provider:activation:${settings.providerKind}`)"
                  @click="$emit('toggle-provider', settings)"
                >
                  {{ settings.isEnabled ? "停用" : "启用" }}
                </a-button>
                <a-button
                  :class="[editorialContentControlButtonClass, editorialContentControlButtonDangerClass]"
                  :data-provider-delete="settings.providerKind"
                  :loading="isProviderActionPending(`provider:delete:${settings.providerKind}`)"
                  @click="$emit('delete-provider', settings.providerKind)"
                >
                  删除
                </a-button>
              </div>
            </div>
          </article>
        </div>
      </div>
    </a-card>
  </section>
</template>
