<script setup lang="ts">
import { onMounted, ref } from "vue";

import EditorialEmptyState from "../../components/content/EditorialEmptyState.vue";
import {
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
    <section class="flex flex-col gap-2" data-settings-intro="profile">
      <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">
        Account Settings
      </p>
      <h1 class="m-0 text-2xl font-semibold tracking-[-0.02em] text-editorial-text-main">
        当前登录用户
      </h1>
      <p class="m-0 max-w-3xl text-sm leading-6 text-editorial-text-body">
        查看当前账号、会话状态和联系信息。
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
      <section class="grid gap-3 md:grid-cols-3" data-profile-section="overview">
        <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel px-4 py-4">
          <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">用户名</p>
          <p class="mt-2 mb-0 text-base font-medium text-editorial-text-main">{{ profile.username }}</p>
        </article>
        <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel px-4 py-4">
          <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">角色</p>
          <p class="mt-2 mb-0 text-base font-medium text-editorial-text-main">{{ profile.role }}</p>
        </article>
        <article class="rounded-editorial-md border border-editorial-border bg-editorial-panel px-4 py-4">
          <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">会话状态</p>
          <p class="mt-2 mb-0 text-base font-medium text-editorial-text-main">
            {{ profile.loggedIn ? "已登录" : "公开访问" }}
          </p>
        </article>
      </section>

      <section
        class="rounded-editorial-lg border border-editorial-border bg-editorial-panel px-5 py-5"
        data-profile-section="summary"
      >
        <div class="flex flex-col gap-4">
          <div>
            <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">当前账号摘要</p>
            <h2 class="mt-2 mb-0 text-lg font-medium text-editorial-text-main">{{ profile.displayName }}</h2>
            <p class="mt-2 mb-0 text-sm leading-6 text-editorial-text-body">
              {{ profile.loggedIn ? "当前会话有效，可以访问系统菜单。" : "当前处于公开访问模式。" }}
            </p>
          </div>

          <div class="grid gap-3 md:grid-cols-2">
            <article class="rounded-editorial-md border border-editorial-border bg-editorial-link px-4 py-4">
              <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">显示名称</p>
              <p class="mt-2 mb-0 text-sm text-editorial-text-main" data-profile-field="display-name">{{ profile.displayName }}</p>
            </article>
            <article class="rounded-editorial-md border border-editorial-border bg-editorial-link px-4 py-4">
              <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">邮箱</p>
              <p class="mt-2 mb-0 text-sm text-editorial-text-main" data-profile-field="email">{{ profile.email || "未设置" }}</p>
            </article>
            <article class="rounded-editorial-md border border-editorial-border bg-editorial-link px-4 py-4">
              <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">username</p>
              <p class="mt-2 mb-0 text-sm text-editorial-text-main" data-profile-field="username">{{ profile.username }}</p>
            </article>
            <article class="rounded-editorial-md border border-editorial-border bg-editorial-link px-4 py-4">
              <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">登录状态</p>
              <p class="mt-2 mb-0 text-sm text-editorial-text-main" data-profile-field="session-status">
                {{ profile.loggedIn ? "已登录（当前会话有效）" : "未登录（公开访问模式）" }}
              </p>
            </article>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>
