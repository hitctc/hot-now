<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { RouterLink, RouterView, useRoute } from "vue-router";

import { useTheme, type ThemeMode } from "../composables/useTheme";
import { readSettingsProfile, type SettingsProfile } from "../services/settingsApi";
import { shellPageMetas } from "../router";

type ProfileLoadState = "idle" | "loading" | "loaded" | "empty" | "error";

const route = useRoute();
const { themeMode, isDarkMode, setThemeMode } = useTheme();
const profile = ref<SettingsProfile | null>(null);
const profileLoadState = ref<ProfileLoadState>("idle");
const profileError = ref<string | null>(null);

const themeOptions = [
  { label: "浅色", value: "light" },
  { label: "深色", value: "dark" }
];

const currentPageTitle = computed(() => route.meta.title ?? "系统页底座");
const currentPageDescription = computed(
  () => route.meta.description ?? "承接系统页的统一布局、主题和导航。"
);
const activeNavKey = computed(() => route.meta.shellKey ?? shellPageMetas[0]?.key ?? "view-rules");

// 当前页面标题和描述直接读路由元数据，这样后续新增页面时只需补 route record。
function handleThemeModeChange(nextValue: string | number): void {
  if (nextValue === "dark" || nextValue === "light") {
    setThemeMode(nextValue as ThemeMode);
  }
}

// 进入系统页后立即读取当前登录用户摘要，读不到时就用空态兜底，不阻断页面壳层。
async function loadProfileSummary(): Promise<void> {
  profileLoadState.value = "loading";
  profileError.value = null;

  try {
    const nextProfile = await readSettingsProfile();
    profile.value = nextProfile;
    profileLoadState.value = nextProfile ? "loaded" : "empty";
  } catch (error) {
    profile.value = null;
    profileLoadState.value = "error";
    profileError.value = error instanceof Error ? error.message : "读取当前登录用户失败";
  }
}

onMounted(() => {
  void loadProfileSummary();
});
</script>

<template>
  <a-layout class="unified-shell" data-shell-root>
    <a-layout-sider class="unified-shell__sider" width="280" :theme="isDarkMode ? 'dark' : 'light'">
      <div class="unified-shell__brand">
        <a-typography-text class="unified-shell__eyebrow" type="secondary">HotNow</a-typography-text>
        <a-typography-title :level="3" class="unified-shell__brand-title">
          系统页前端底座
        </a-typography-title>
        <a-typography-paragraph class="unified-shell__brand-description">
          Vue 3 + Ant Design Vue 的统一壳层，后续系统页都会沿着同一套组件基线扩展。
        </a-typography-paragraph>
      </div>

      <a-menu class="unified-shell__nav" mode="inline" :selected-keys="[activeNavKey]">
        <a-menu-item v-for="page in shellPageMetas" :key="page.key" :data-shell-nav="page.key">
          <RouterLink class="unified-shell__nav-link" :to="page.path">
            <span class="unified-shell__nav-label">{{ page.navLabel }}</span>
            <span class="unified-shell__nav-description">{{ page.description }}</span>
          </RouterLink>
        </a-menu-item>
      </a-menu>
    </a-layout-sider>

    <a-layout class="unified-shell__main">
      <a-layout-header class="unified-shell__header">
        <div class="unified-shell__header-copy">
          <a-typography-text class="unified-shell__header-kicker" type="secondary">
            系统页工作台
          </a-typography-text>
          <a-typography-title :level="2" class="unified-shell__page-title" data-shell-page-title>
            {{ currentPageTitle }}
          </a-typography-title>
          <a-typography-paragraph
            class="unified-shell__page-description"
            data-shell-page-description
          >
            {{ currentPageDescription }}
          </a-typography-paragraph>
        </div>

        <div class="unified-shell__header-controls">
          <div class="unified-shell__theme-switch" data-shell-theme-toggle>
            <a-segmented
              :value="themeMode"
              :options="themeOptions"
              @change="handleThemeModeChange"
            />
          </div>
          <a-tag :color="isDarkMode ? 'blue' : 'green'">
            {{ isDarkMode ? "深色模式" : "浅色模式" }}
          </a-tag>
        </div>
      </a-layout-header>

      <a-layout-content class="unified-shell__content">
        <a-space direction="vertical" size="large" class="unified-shell__stack">
          <a-card class="unified-shell__profile-card" size="small" title="当前登录用户">
            <template v-if="profileLoadState === 'loading'">
              <a-skeleton :active="true" :paragraph="{ rows: 2 }" />
            </template>

            <template v-else-if="profileLoadState === 'error'">
              <a-alert
                type="warning"
                show-icon
                :message="profileError ?? '读取当前登录用户失败'"
              />
            </template>

            <template v-else-if="profile">
              <a-space direction="vertical" size="small" class="unified-shell__profile-summary">
                <a-typography-text strong>{{ profile.displayName }}</a-typography-text>
                <a-typography-text type="secondary">@{{ profile.username }}</a-typography-text>
                <a-space wrap size="small">
                  <a-tag color="blue">{{ profile.role }}</a-tag>
                  <a-tag :color="profile.loggedIn ? 'green' : 'gold'">
                    {{ profile.loggedIn ? "已登录" : "公开访问" }}
                  </a-tag>
                </a-space>
                <a-typography-text v-if="profile.email">
                  邮箱：{{ profile.email }}
                </a-typography-text>
              </a-space>
            </template>

            <template v-else>
              <a-empty description="当前没有可读取的用户摘要" />
            </template>
          </a-card>

          <a-card class="unified-shell__view-port" size="small" :bordered="false">
            <RouterView v-slot="{ Component }">
              <component :is="Component" />
            </RouterView>
          </a-card>
        </a-space>
      </a-layout-content>
    </a-layout>
  </a-layout>
</template>

<style scoped>
.unified-shell {
  min-height: 100vh;
}

.unified-shell__sider {
  padding: 24px 16px;
}

.unified-shell__brand {
  margin-bottom: 24px;
}

.unified-shell__eyebrow {
  display: inline-block;
  margin-bottom: 4px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.unified-shell__brand-title {
  margin: 0;
}

.unified-shell__brand-description {
  margin-bottom: 0;
}

.unified-shell__nav {
  border-inline-end: 0;
  background: transparent;
}

.unified-shell__nav-link {
  display: flex;
  flex-direction: column;
  line-height: 1.4;
}

.unified-shell__nav-label {
  font-weight: 600;
}

.unified-shell__nav-description {
  font-size: 12px;
  opacity: 0.75;
}

.unified-shell__main {
  min-width: 0;
}

.unified-shell__header {
  height: auto;
  padding: 24px 32px 12px;
  background: transparent;
  display: flex;
  justify-content: space-between;
  gap: 24px;
}

.unified-shell__header-copy {
  min-width: 0;
}

.unified-shell__page-title {
  margin: 4px 0 6px;
}

.unified-shell__page-description {
  margin-bottom: 0;
}

.unified-shell__header-controls {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.unified-shell__content {
  padding: 0 32px 32px;
}

.unified-shell__stack {
  width: 100%;
}

.unified-shell__profile-card,
.unified-shell__view-port {
  width: 100%;
}

.unified-shell__profile-summary {
  width: 100%;
}
</style>
