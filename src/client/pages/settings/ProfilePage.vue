<script setup lang="ts">
import { onMounted, ref } from "vue";

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
  <a-space direction="vertical" size="large" class="profile-page">
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

    <a-empty v-else-if="!profile" description="当前没有可读取的用户信息。" />

    <template v-else>
      <a-row :gutter="[16, 16]">
        <a-col :xs="24" :sm="12" :xl="8">
          <a-card size="small">
            <a-statistic title="用户名" :value="profile.username" />
          </a-card>
        </a-col>
        <a-col :xs="24" :sm="12" :xl="8">
          <a-card size="small">
            <a-statistic title="角色" :value="profile.role" />
          </a-card>
        </a-col>
        <a-col :xs="24" :sm="12" :xl="8">
          <a-card size="small">
            <a-statistic title="会话状态" :value="profile.loggedIn ? '已登录' : '公开访问'" />
          </a-card>
        </a-col>
      </a-row>

      <a-card title="当前登录用户" size="small" data-profile-section="summary">
        <a-space direction="vertical" size="middle" class="profile-page__stack">
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
        </a-space>
      </a-card>
    </template>
  </a-space>
</template>

<style scoped>
.profile-page,
.profile-page__stack {
  width: 100%;
}
</style>
