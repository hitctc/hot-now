<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { RouterLink, RouterView, useRoute, useRouter } from "vue-router";

import EditorialEmptyState from "../components/content/EditorialEmptyState.vue";
import EditorialPageIntro from "../components/content/EditorialPageIntro.vue";
import { useTheme, type ThemeMode } from "../composables/useTheme";
import { HttpError, requestJson } from "../services/http";
import { readSettingsProfile, type SettingsProfile } from "../services/settingsApi";
import { shellPageMetas } from "../router";

type ProfileLoadState = "idle" | "loading" | "loaded" | "empty" | "error";

const route = useRoute();
const router = useRouter();
const { themeMode, isDarkMode, setThemeMode } = useTheme();
const profile = ref<SettingsProfile | null>(null);
const profileLoadState = ref<ProfileLoadState>("idle");
const profileError = ref<string | null>(null);
const mobileSystemDrawerOpen = ref(false);

const themeOptions = [
  { label: "浅色", value: "light" },
  { label: "深色", value: "dark" }
];

const contentNavPages = shellPageMetas.filter((page) => page.section === "content");
const systemNavPages = shellPageMetas.filter((page) => page.section === "system");

const currentPageTitle = computed(() => route.meta.title ?? "系统页底座");
const currentPageDescription = computed(
  () => route.meta.description ?? "承接系统页的统一布局、主题和导航。"
);
const loggedInProfile = computed(() => (profile.value?.loggedIn ? profile.value : null));
const guestProfile = computed(() => (profile.value && !profile.value.loggedIn ? profile.value : null));
const shouldShowSystemMenu = computed(() => Boolean(loggedInProfile.value));

function buildGuestProfile(): SettingsProfile {
  return {
    username: "guest",
    displayName: "公开访问",
    role: "viewer",
    email: null,
    loggedIn: false
  };
}

function isActiveContentPath(path: string): boolean {
  return route.path === path || (path === "/ai-new" && route.path === "/");
}

// 导航选中态直接靠 Tailwind class 切换，不再依赖 a-menu 的内部选中结构。
function getShellNavLinkClasses(isActive: boolean): string[] {
  return [
    "group flex min-w-0 select-none flex-col gap-1 rounded-editorial-sm px-3 py-2 text-left no-underline transition duration-150 ease-out",
    isActive
      ? "bg-editorial-link-active text-editorial-text-main"
      : "text-editorial-text-body hover:bg-editorial-link-active hover:text-editorial-text-main hover:no-underline"
  ];
}

// 移动端顶部 tab 只保留更紧凑的 pill 形态， active 态依旧从同一份路由判断里拿。
function getMobileTabClasses(isActive: boolean): string[] {
  return [
    "flex shrink-0 select-none items-center rounded-editorial-sm px-3 py-2 text-[13px] font-medium leading-5 no-underline transition duration-150 ease-out whitespace-nowrap",
    isActive
      ? "bg-editorial-link-active text-editorial-text-main"
      : "text-editorial-text-body hover:bg-editorial-link-active hover:text-editorial-text-main hover:no-underline"
  ];
}

// 激活态辅助文案改回正文色，避免导航在选中时又退回成 dashboard 式的白字蓝块。
function getShellNavDescriptionClasses(isActive: boolean): string {
  return isActive ? "text-editorial-text-body" : "text-editorial-text-muted";
}

// 主题切换只改唯一状态源，不直接碰 DOM，避免双向同步逻辑散到模板里。
function handleThemeModeChange(nextValue: string | number): void {
  if (nextValue === "dark" || nextValue === "light") {
    setThemeMode(nextValue as ThemeMode);
  }
}

// 移动端系统抽屉只保留一份开关状态，路由变化后要立即收起，避免跳页后残留遮罩。
function closeMobileSystemDrawer(): void {
  mobileSystemDrawerOpen.value = false;
}

function toggleMobileSystemDrawer(): void {
  mobileSystemDrawerOpen.value = !mobileSystemDrawerOpen.value;
}

// 登出优先走异步请求，这样内容页可以原地刷新，系统页也能平滑退回公开首页而不是跳登录页。
async function handleLogout(): Promise<void> {
  try {
    await requestJson<{ ok: true }>("/logout", {
      method: "POST"
    });
  } catch (error) {
    profileError.value = error instanceof Error ? error.message : "退出登录失败";
    profileLoadState.value = "error";
    return;
  }

  profile.value = buildGuestProfile();
  profileLoadState.value = "loaded";
  closeMobileSystemDrawer();

  if (route.path.startsWith("/settings/")) {
    await router.replace("/");
    return;
  }

  window.location.reload();
}

// 抽屉打开时锁住 body 滚动，避免移动端出现侧层打开但页面还能一起滑动的错位感。
function syncMobileDrawerBodyScroll(isOpen: boolean): void {
  document.body.classList.toggle("unified-shell-mobile-open", isOpen);
}

// 进入系统页后立即读取当前登录用户摘要，读不到时就用空态兜底，不阻断页面壳层。
async function loadProfileSummary(): Promise<void> {
  profileLoadState.value = "loading";
  profileError.value = null;

  try {
    const nextProfile = await readSettingsProfile();
    profile.value = nextProfile ?? buildGuestProfile();
    profileLoadState.value = "loaded";
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) {
      profile.value = buildGuestProfile();
      profileLoadState.value = "loaded";
      return;
    }

    profile.value = null;
    profileLoadState.value = "error";
    profileError.value = error instanceof Error ? error.message : "读取当前登录用户失败";
  }
}

onMounted(() => {
  void loadProfileSummary();
});

watch(
  () => route.fullPath,
  () => {
    closeMobileSystemDrawer();
  }
);

watch(mobileSystemDrawerOpen, (isOpen) => {
  syncMobileDrawerBodyScroll(isOpen);
});

watch(shouldShowSystemMenu, (isVisible) => {
  if (!isVisible) {
    closeMobileSystemDrawer();
  }
});

onBeforeUnmount(() => {
  syncMobileDrawerBodyScroll(false);
});
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col min-[901px]:flex-row">
    <div
      class="sticky top-0 z-30 hidden border-b border-editorial-border bg-editorial-page/95 px-4 py-3 backdrop-blur max-[900px]:block"
      data-mobile-shell-nav
    >
      <div class="flex items-center gap-3">
        <div class="min-w-0 flex-1">
          <nav
            class="flex min-w-0 flex-1 gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            aria-label="内容菜单"
          >
            <RouterLink
              v-for="page in contentNavPages"
              :key="page.path"
              :to="page.path"
              :class="getMobileTabClasses(isActiveContentPath(page.path))"
              :data-mobile-content-tab="page.path"
              @click="closeMobileSystemDrawer"
            >
              {{ page.navLabel }}
            </RouterLink>
          </nav>
        </div>

        <button
          v-if="shouldShowSystemMenu"
          type="button"
          class="shrink-0 select-none rounded-editorial-sm border border-editorial-border bg-editorial-panel px-3 py-2 text-sm font-medium text-editorial-text-main transition hover:bg-editorial-link-active"
          data-mobile-system-toggle
          :aria-expanded="mobileSystemDrawerOpen ? 'true' : 'false'"
          aria-controls="mobile-system-drawer"
          @click="toggleMobileSystemDrawer"
        >
          系统
        </button>
      </div>
    </div>

    <aside
      class="sticky top-0 hidden h-[100dvh] w-[244px] flex-none flex-col overflow-y-auto border-r border-editorial-border bg-editorial-sidebar px-3 py-4 min-[901px]:flex min-[901px]:w-[244px]"
      data-workspace-sidebar
    >
      <div class="flex min-h-0 flex-1 flex-col gap-5">
        <section class="px-3 py-2" data-workspace-brand>
          <h1 class="mt-1 text-[20px] font-semibold tracking-[-0.01em] text-editorial-text-main">
            热讯
          </h1>
        </section>

        <section class="flex flex-col gap-1">
          <p class="px-3 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">
            内容菜单
          </p>
          <nav class="flex flex-col gap-1" aria-label="内容菜单">
            <RouterLink
              v-for="page in contentNavPages"
              :key="page.path"
              :to="page.path"
              :class="getShellNavLinkClasses(isActiveContentPath(page.path))"
              :data-shell-nav-link="page.path"
            >
              <span class="text-sm font-medium leading-5">{{ page.navLabel }}</span>
              <span :class="getShellNavDescriptionClasses(isActiveContentPath(page.path))" class="text-xs leading-5">
                {{ page.description }}
              </span>
            </RouterLink>
          </nav>
        </section>

        <section v-if="shouldShowSystemMenu" class="flex flex-col gap-1">
          <p class="px-3 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">
            系统菜单
          </p>
          <nav class="flex flex-col gap-1" aria-label="系统菜单">
            <RouterLink
              v-for="page in systemNavPages"
              :key="page.key"
              :to="page.path"
              :class="getShellNavLinkClasses(route.path === page.path)"
              :data-shell-nav-link="page.path"
            >
              <span class="text-sm font-medium leading-5">{{ page.navLabel }}</span>
              <span :class="getShellNavDescriptionClasses(route.path === page.path)" class="text-xs leading-5">
                {{ page.description }}
              </span>
            </RouterLink>
          </nav>
        </section>

        <div class="mt-auto flex flex-col gap-3 pt-2">
          <section
            class="rounded-editorial-md border border-editorial-border bg-editorial-panel px-3 py-3"
            data-shell-theme-toggle
          >
            <p class="mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">
              界面主题
            </p>
            <div class="flex flex-col gap-2">
              <a-segmented
                :value="themeMode"
                :options="themeOptions"
                class="w-full select-none"
                @change="handleThemeModeChange"
              />
              <p class="m-0 text-xs text-editorial-text-muted">{{ isDarkMode ? "当前：深色" : "当前：浅色" }}</p>
            </div>
          </section>

          <section
            class="rounded-editorial-md border border-editorial-border bg-editorial-panel px-3 py-3"
            data-shell-account-panel
          >
            <p class="mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">
              当前登录用户
            </p>

            <template v-if="profileLoadState === 'loading'">
              <a-skeleton :active="true" :paragraph="{ rows: 2 }" />
            </template>

            <template v-else-if="profileLoadState === 'error'">
              <a-alert
                class="editorial-inline-alert editorial-inline-alert--warning"
                type="warning"
                show-icon
                :message="profileError ?? '读取当前登录用户失败'"
              />
            </template>

            <template v-else-if="loggedInProfile">
              <div class="flex flex-col gap-2">
                <p class="m-0 text-sm font-semibold leading-6 text-editorial-text-main" data-shell-account-username>
                  @{{ loggedInProfile.username }}
                </p>
                <div class="flex flex-wrap items-center gap-2 text-xs text-editorial-text-muted" data-shell-account-actions>
                  <span class="inline-flex rounded-editorial-pill bg-editorial-link px-2.5 py-1" data-shell-account-status>
                    已登录
                  </span>
                  <form
                    method="post"
                    action="/logout"
                    enctype="text/plain"
                    class="inline-flex"
                    data-shell-logout-form
                    @submit.prevent="handleLogout"
                  >
                    <button
                      type="submit"
                      class="inline-flex items-center rounded-editorial-pill border border-editorial-border bg-editorial-panel px-2.5 py-1 text-xs font-medium text-editorial-text-main transition hover:bg-editorial-link-active"
                      data-shell-logout-button
                    >
                      退出登录
                    </button>
                  </form>
                </div>
              </div>
            </template>

            <template v-else-if="guestProfile">
              <div class="flex flex-col gap-3">
                <div class="flex flex-wrap gap-2 text-xs text-editorial-text-muted">
                  <span class="inline-flex rounded-editorial-pill bg-editorial-link px-2.5 py-1">
                    {{ guestProfile.role }}
                  </span>
                  <span class="inline-flex rounded-editorial-pill bg-editorial-link px-2.5 py-1">
                    公开访问
                  </span>
                </div>
                <a href="/login" class="inline-flex" data-shell-login-link>
                  <span
                    class="inline-flex items-center rounded-editorial-sm border border-editorial-border bg-editorial-panel px-3 py-2 text-sm font-medium text-editorial-text-main transition hover:bg-editorial-link-active"
                  >
                    去登录
                  </span>
                </a>
              </div>
            </template>

            <template v-else>
              <EditorialEmptyState
                title="暂无用户摘要"
                description="当前没有可读取的用户摘要。"
                :compact="true"
                data-shell-empty-state="sidebar-profile"
              />
            </template>
          </section>
        </div>
      </div>
    </aside>

    <main class="min-w-0 flex-1">
      <div class="flex w-full flex-1 flex-col px-4 pb-10 pt-2 min-[901px]:px-6 min-[901px]:pt-5">
        <EditorialPageIntro
          :title="String(currentPageTitle)"
          :description="String(currentPageDescription)"
          tracking-prefix="page-header"
        />

        <div class="w-full pt-6">
          <RouterView v-slot="{ Component }">
            <component :is="Component" />
          </RouterView>
        </div>
      </div>
    </main>

    <transition
      enter-active-class="transition-opacity duration-150 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-150 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="shouldShowSystemMenu && mobileSystemDrawerOpen"
        class="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
        data-mobile-drawer-backdrop
        @click="closeMobileSystemDrawer"
      >
        <section
          id="mobile-system-drawer"
          class="absolute left-4 right-4 top-[66px] max-h-[calc(100dvh-82px)] overflow-y-auto rounded-editorial-lg border border-editorial-border bg-editorial-panel p-4 shadow-editorial-floating"
          data-mobile-system-drawer
          @click.stop
        >
          <div class="flex flex-col gap-4">
            <EditorialPageIntro
              :title="String(currentPageTitle)"
              :description="String(currentPageDescription)"
              :compact="true"
              tracking-prefix="mobile-page-header"
            />

            <nav class="flex flex-col gap-1" aria-label="移动端系统菜单">
              <RouterLink
                v-for="page in systemNavPages"
                :key="page.key"
                :to="page.path"
                :class="getShellNavLinkClasses(route.path === page.path)"
                :data-mobile-drawer-link="page.path"
                :data-shell-nav-link="page.path"
                @click="closeMobileSystemDrawer"
              >
                <span class="text-sm font-semibold leading-5">{{ page.navLabel }}</span>
                <span :class="getShellNavDescriptionClasses(route.path === page.path)" class="text-xs leading-5">
                  {{ page.description }}
                </span>
              </RouterLink>
            </nav>

            <section class="rounded-editorial-md border border-editorial-border bg-editorial-panel px-3 py-3">
              <p class="mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">
                界面主题
              </p>
              <div class="flex flex-col gap-2">
                <a-segmented
                  :value="themeMode"
                  :options="themeOptions"
                  class="w-full"
                  @change="handleThemeModeChange"
                />
                <p class="m-0 text-xs text-editorial-text-muted">{{ isDarkMode ? "当前：深色" : "当前：浅色" }}</p>
              </div>
            </section>

            <section
              class="rounded-editorial-md border border-editorial-border bg-editorial-panel px-3 py-3"
              data-mobile-account-panel
            >
              <p class="mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">
                当前登录用户
              </p>
              <template v-if="profileLoadState === 'loading'">
                <a-skeleton :active="true" :paragraph="{ rows: 2 }" />
              </template>
              <template v-else-if="loggedInProfile">
                <div class="flex flex-col gap-2">
                  <p class="m-0 text-sm font-semibold leading-6 text-editorial-text-main" data-mobile-account-username>
                    @{{ loggedInProfile.username }}
                  </p>
                  <div
                    class="flex flex-wrap items-center gap-2 text-xs text-editorial-text-muted"
                    data-mobile-account-actions
                  >
                    <span class="inline-flex rounded-editorial-pill bg-editorial-link px-2.5 py-1" data-mobile-account-status>
                      已登录
                    </span>
                    <form
                      method="post"
                      action="/logout"
                      enctype="text/plain"
                      class="inline-flex"
                      data-mobile-logout-form
                      @submit.prevent="handleLogout"
                    >
                      <button
                        type="submit"
                        class="inline-flex items-center rounded-editorial-pill border border-editorial-border bg-editorial-panel px-2.5 py-1 text-xs font-medium text-editorial-text-main transition hover:bg-editorial-link-active"
                        data-mobile-logout-button
                      >
                        退出登录
                      </button>
                    </form>
                  </div>
                </div>
              </template>
              <template v-else-if="profileLoadState === 'error'">
              <a-alert
                class="editorial-inline-alert editorial-inline-alert--warning"
                type="warning"
                show-icon
                :message="profileError ?? '读取当前登录用户失败'"
              />
              </template>
              <template v-else>
                <EditorialEmptyState
                  title="暂无用户摘要"
                  description="当前没有可读取的用户摘要。"
                  :compact="true"
                  data-shell-empty-state="mobile-profile"
                />
              </template>
            </section>
          </div>
        </section>
      </div>
    </transition>
  </div>
</template>
