<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { RouterLink, RouterView, useRoute } from "vue-router";

import { useTheme, type ThemeMode } from "../composables/useTheme";
import { readSettingsProfile, type SettingsProfile } from "../services/settingsApi";
import { shellPageMetas } from "../router";

type ProfileLoadState = "idle" | "loading" | "loaded" | "empty" | "error";
type SystemShellPageKey = "view-rules" | "sources" | "profile";

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
const contentNavPages = shellPageMetas.filter((page) => page.section === "content");
const systemNavPages = shellPageMetas.filter((page) => page.section === "system");

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

// 内容页还没整体迁进 Vue 前，侧边栏内容菜单统一用真实链接跳回服务端内容页，避免落到占位路由。
function isSystemPageKey(key: string | symbol | undefined): key is SystemShellPageKey {
  return key === "view-rules" || key === "sources" || key === "profile";
}
</script>

<template>
  <a-layout class="unified-shell" data-shell-root>
    <a-layout-sider class="unified-shell__sider" width="280" :theme="isDarkMode ? 'dark' : 'light'">
      <div class="unified-shell__brand">
        <a-typography-text class="unified-shell__eyebrow" type="secondary">HotNow Editorial Desk</a-typography-text>
        <a-typography-title :level="3" class="unified-shell__brand-title">
          AI-first 工作台壳层
        </a-typography-title>
        <a-typography-paragraph class="unified-shell__brand-description">
          AI 新讯、AI 热点和系统工作台共享同一套 Editorial Desk 主题 token 与导航语义。
        </a-typography-paragraph>
      </div>

      <section class="unified-shell__nav-group">
        <p class="unified-shell__nav-kicker">内容菜单</p>
        <a-menu class="unified-shell__nav" mode="inline" :selected-keys="[]">
          <a-menu-item v-for="page in contentNavPages" :key="page.path" :data-shell-nav="page.key">
            <a class="unified-shell__nav-link" :href="page.path">
              <span class="unified-shell__nav-label">{{ page.navLabel }}</span>
              <span class="unified-shell__nav-description">{{ page.description }}</span>
            </a>
          </a-menu-item>
        </a-menu>
      </section>

      <section class="unified-shell__nav-group">
        <p class="unified-shell__nav-kicker">系统菜单</p>
        <a-menu class="unified-shell__nav" mode="inline" :selected-keys="isSystemPageKey(activeNavKey) ? [activeNavKey] : []">
          <a-menu-item v-for="page in systemNavPages" :key="page.key" :data-shell-nav="page.key">
            <RouterLink class="unified-shell__nav-link" :to="page.path">
              <span class="unified-shell__nav-label">{{ page.navLabel }}</span>
              <span class="unified-shell__nav-description">{{ page.description }}</span>
            </RouterLink>
          </a-menu-item>
        </a-menu>
      </section>
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
  color: var(--editorial-text-main);
  background: transparent;
}

.unified-shell__sider {
  padding: 24px 18px;
  background: var(--editorial-bg-sidebar) !important;
  border-right: 1px solid var(--editorial-border-strong);
  box-shadow: var(--editorial-shadow-page);
  backdrop-filter: blur(18px);
}

:deep(.unified-shell__sider .ant-layout-sider-children) {
  display: flex;
  flex-direction: column;
  gap: 18px;
  height: 100%;
}

.unified-shell__brand {
  padding: 20px 18px;
  border: 1px solid var(--editorial-border);
  border-radius: var(--editorial-radius-xl);
  background: var(--editorial-bg-sidebar-panel);
  box-shadow: var(--editorial-shadow-card);
}

.unified-shell__eyebrow {
  display: inline-block;
  margin-bottom: 6px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--editorial-text-sidebar-muted);
}

.unified-shell__brand-title {
  margin: 0;
  color: var(--editorial-text-sidebar) !important;
}

.unified-shell__brand-description {
  margin-bottom: 0;
  color: var(--editorial-text-body);
}

.unified-shell__nav-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.unified-shell__nav-kicker {
  margin: 0;
  padding-left: 4px;
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--editorial-text-sidebar-muted);
}

.unified-shell__nav {
  border-inline-end: 0;
  background: transparent;
}

:deep(.unified-shell__nav .ant-menu-item) {
  height: auto;
  margin: 0 0 10px;
  padding: 0 !important;
  line-height: 1.4;
  border-radius: var(--editorial-radius-lg);
}

:deep(.unified-shell__nav .ant-menu-item::after) {
  display: none;
}

:deep(.unified-shell__nav .ant-menu-item-selected) {
  background: var(--editorial-bg-link-active);
  box-shadow: var(--editorial-shadow-accent);
}

:deep(.unified-shell__nav .ant-menu-item-selected .unified-shell__nav-link) {
  color: var(--editorial-text-on-accent);
  border-color: transparent;
  background: transparent;
}

:deep(.unified-shell__nav .ant-menu-item-selected .unified-shell__nav-description) {
  color: inherit;
}

.unified-shell__nav-link {
  display: flex;
  flex-direction: column;
  gap: 4px;
  line-height: 1.4;
  padding: 14px 16px;
  border: 1px solid var(--editorial-border);
  border-radius: var(--editorial-radius-lg);
  background: var(--editorial-bg-link);
  color: var(--editorial-text-sidebar);
  transition:
    transform 160ms ease,
    border-color 160ms ease,
    background 160ms ease,
    box-shadow 160ms ease;
}

.unified-shell__nav-link:hover {
  transform: translateY(-1px);
  border-color: var(--editorial-border-strong);
  box-shadow: var(--editorial-shadow-floating);
  text-decoration: none;
}

.unified-shell__nav-label {
  font-weight: 600;
}

.unified-shell__nav-description {
  font-size: 12px;
  color: var(--editorial-text-sidebar-muted);
}

.unified-shell__main {
  min-width: 0;
}

.unified-shell__header {
  height: auto;
  margin: 24px 24px 0;
  padding: 24px 28px 18px;
  border: 1px solid var(--editorial-border);
  border-radius: var(--editorial-radius-xl);
  background: var(--editorial-bg-panel);
  box-shadow: var(--editorial-shadow-card);
  backdrop-filter: blur(16px);
  display: flex;
  justify-content: space-between;
  gap: 24px;
}

.unified-shell__header-copy {
  min-width: 0;
}

.unified-shell__header-kicker {
  color: var(--editorial-text-muted);
}

.unified-shell__page-title {
  margin: 4px 0 6px;
  color: var(--editorial-text-main) !important;
}

.unified-shell__page-description {
  margin-bottom: 0;
  color: var(--editorial-text-body);
}

.unified-shell__header-controls {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.unified-shell__content {
  padding: 24px;
}

.unified-shell__stack {
  width: 100%;
}

.unified-shell__profile-card,
.unified-shell__view-port {
  width: 100%;
  border-radius: var(--editorial-radius-xl);
  background: var(--editorial-bg-panel-strong);
  box-shadow: var(--editorial-shadow-card);
}

:deep(.unified-shell__profile-card .ant-card-head),
:deep(.unified-shell__view-port .ant-card-head) {
  border-bottom-color: var(--editorial-border);
}

:deep(.unified-shell__profile-card .ant-card-body),
:deep(.unified-shell__view-port .ant-card-body) {
  padding: 20px 22px;
}

.unified-shell__profile-summary {
  width: 100%;
}

@media (max-width: 1080px) {
  .unified-shell__sider {
    width: 248px !important;
    min-width: 248px !important;
    max-width: 248px !important;
  }

  .unified-shell__header {
    margin: 18px 18px 0;
    padding: 20px 22px 16px;
  }

  .unified-shell__content {
    padding: 18px;
  }
}

@media (max-width: 900px) {
  .unified-shell__header {
    flex-direction: column;
    align-items: stretch;
  }

  .unified-shell__header-controls {
    justify-content: space-between;
  }
}
</style>
