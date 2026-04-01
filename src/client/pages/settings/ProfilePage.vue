<script setup lang="ts">
import { onMounted, ref } from "vue";

import EditorialEmptyState from "../../components/content/EditorialEmptyState.vue";
import {
  editorialContentCardClass,
  editorialContentIntroSectionClass,
  editorialContentPageClass
} from "../../components/content/contentCardShared";
import { HttpError } from "../../services/http";
import { readSettingsProfile, type SettingsProfile } from "../../services/settingsApi";

const isLoading = ref(true);
const loadError = ref<string | null>(null);
const profile = ref<SettingsProfile | null>(null);

// 账号页和其他系统页保持同一套加载流程，便于后面继续补扩展信息。
async function loadProfile(): Promise<void> {
  isLoading.value = true;
  loadError.value = null;

  try {
    profile.value = await readSettingsProfile();
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) {
      loadError.value = "请先登录后再查看当前用户信息。";
    } else {
      loadError.value = "当前用户信息加载失败，请稍后重试。";
    }
  } finally {
    isLoading.value = false;
  }
}

onMounted(() => {
  void loadProfile();
});
</script>

<template>
  <div :class="editorialContentPageClass" data-settings-page="profile">
    <section :class="editorialContentIntroSectionClass" data-settings-intro="profile">
      <p class="m-0 text-xs font-semibold uppercase tracking-[0.24em] text-editorial-text-muted">
        Profile Workbench
      </p>
      <h1 class="mt-3 text-3xl font-semibold tracking-tight text-editorial-text-main">
        把当前账号摘要收进统一的系统页骨架
      </h1>
      <p class="mt-3 max-w-3xl text-base leading-7 text-editorial-text-body">
        账号信息、登录态提示和错误提示逻辑保持原样，只把页面外层、intro 和 summary panel 迁到 Tailwind。
      </p>
    </section>

    <a-skeleton v-if="isLoading" active :paragraph="{ rows: 6 }" />

    <a-result
      v-else-if="loadError"
      status="error"
      title="当前用户页加载失败"
      :sub-title="loadError"
    >
      <template #extra>
        <a-button type="primary" @click="loadProfile()">重新加载</a-button>
      </template>
    </a-result>

    <EditorialEmptyState
      v-else-if="!profile"
      title="当前没有可读取的用户信息"
      description="可以稍后刷新页面，或重新登录后再试。"
      data-profile-empty-state
    />

    <template v-else>
      <section class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <a-card :class="editorialContentCardClass" size="small">
          <a-statistic title="用户名" :value="profile.username" />
        </a-card>
        <a-card :class="editorialContentCardClass" size="small">
          <a-statistic title="角色" :value="profile.role" />
        </a-card>
        <a-card :class="editorialContentCardClass" size="small">
          <a-statistic title="会话状态" :value="profile.loggedIn ? '已登录' : '公开访问'" />
        </a-card>
      </section>

      <a-card
        :class="editorialContentCardClass"
        title="当前登录用户"
        size="small"
        data-profile-section="summary"
      >
        <div class="flex w-full flex-col gap-4">
          <a-alert
            :type="profile.loggedIn ? 'success' : 'info'"
            :message="profile.loggedIn ? '当前会话有效，可以访问系统菜单。' : '当前处于公开访问模式。'"
            show-icon
          />

          <a-descriptions :column="1" bordered size="small">
            <a-descriptions-item label="username">
              {{ profile.username }}
            </a-descriptions-item>
            <a-descriptions-item label="displayName">
              {{ profile.displayName }}
            </a-descriptions-item>
            <a-descriptions-item label="role">
              {{ profile.role }}
            </a-descriptions-item>
            <a-descriptions-item label="email">
              {{ profile.email || "未设置" }}
            </a-descriptions-item>
            <a-descriptions-item label="登录状态">
              {{ profile.loggedIn ? "已登录（当前会话有效）" : "未登录（公开访问模式）" }}
            </a-descriptions-item>
          </a-descriptions>
        </div>
      </a-card>
    </template>
  </div>
</template>
