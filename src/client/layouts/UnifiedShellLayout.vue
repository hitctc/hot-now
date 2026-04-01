<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { RouterLink, RouterView, useRoute } from "vue-router";

import { useTheme, type ThemeMode } from "../composables/useTheme";
import { HttpError } from "../services/http";
import { readSettingsProfile, type SettingsProfile } from "../services/settingsApi";
import { shellPageMetas } from "../router";

type ProfileLoadState = "idle" | "loading" | "loaded" | "empty" | "error";

const route = useRoute();
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
    "group flex min-w-0 flex-col gap-1 rounded-editorial-lg border px-4 py-3 text-left no-underline transition duration-150 ease-out",
    isActive
      ? "border-transparent bg-editorial-link-active text-editorial-text-on-accent shadow-editorial-accent"
      : "border-editorial-border bg-editorial-link text-editorial-text-sidebar hover:-translate-y-px hover:border-editorial-border-strong hover:bg-editorial-control-hover hover:shadow-editorial-floating hover:no-underline"
  ];
}

// 移动端顶部 tab 只保留更紧凑的 pill 形态， active 态依旧从同一份路由判断里拿。
function getMobileTabClasses(isActive: boolean): string[] {
  return [
    "flex shrink-0 items-center rounded-editorial-pill border px-3 py-2 text-[13px] font-semibold leading-5 no-underline transition duration-150 ease-out whitespace-nowrap",
    isActive
      ? "border-transparent bg-editorial-link-active text-editorial-text-on-accent shadow-editorial-accent"
      : "border-editorial-border bg-editorial-link text-editorial-text-sidebar hover:-translate-y-px hover:border-editorial-border-strong hover:bg-editorial-control-hover hover:shadow-editorial-floating hover:no-underline"
  ];
}

// 激活态描述文案直接继承链接前景色，这样对比度会和高亮背景一起走，不会退回成 muted。
function getShellNavDescriptionClasses(isActive: boolean): string {
  return isActive ? "text-inherit" : "text-editorial-text-sidebar-muted";
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

onBeforeUnmount(() => {
  syncMobileDrawerBodyScroll(false);
});
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col min-[901px]:flex-row">
    <div
      class="sticky top-0 z-30 hidden px-4 pt-4 max-[900px]:block"
      data-mobile-shell-nav
    >
      <div
        class="flex items-center gap-3 rounded-editorial-xl border border-editorial-border bg-editorial-panel px-3 py-3 shadow-editorial-card backdrop-blur-xl"
      >
        <nav
          class="flex min-w-0 flex-1 gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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

        <button
          type="button"
          class="shrink-0 rounded-editorial-pill border border-editorial-border bg-editorial-control px-3 py-2 text-sm font-semibold text-editorial-text-main shadow-editorial-card transition hover:border-editorial-border-strong hover:bg-editorial-control-hover"
          data-mobile-system-toggle
          :aria-expanded="mobileSystemDrawerOpen ? 'true' : 'false'"
          aria-controls="mobile-system-drawer"
          @click="toggleMobileSystemDrawer"
        >
          系统菜单
        </button>
      </div>
    </div>

    <aside
      class="sticky top-0 hidden h-[100dvh] w-[248px] flex-none flex-col overflow-y-auto border-r border-editorial-border-strong bg-editorial-sidebar px-[18px] py-6 shadow-editorial-page backdrop-blur-[18px] min-[901px]:flex min-[901px]:min-w-[248px] min-[901px]:max-w-[248px] min-[901px]:w-[248px] min-[1081px]:min-w-[280px] min-[1081px]:max-w-[280px] min-[1081px]:w-[280px]"
    >
      <div class="flex min-h-0 flex-1 flex-col gap-4">
        <section class="rounded-editorial-xl border border-editorial-border bg-editorial-sidebar-panel px-4 py-5 shadow-editorial-card">
          <p class="mb-1.5 inline-block text-xs font-semibold uppercase tracking-[0.12em] text-editorial-text-sidebar-muted">
            HotNow Editorial Desk
          </p>
          <h1 class="mb-1 text-xl font-semibold leading-tight text-editorial-text-sidebar">
            AI-first 工作台壳层
          </h1>
          <p class="mb-0 text-sm leading-6 text-editorial-text-body">
            AI 新讯、AI 热点和系统工作台共享同一套 Editorial Desk 主题 token 与导航语义。
          </p>
        </section>

        <section
          class="rounded-editorial-xl border border-editorial-border bg-editorial-sidebar-panel px-4 py-4 shadow-editorial-card"
          data-shell-page-summary
        >
          <p class="mb-1.5 inline-block text-xs font-semibold uppercase tracking-[0.12em] text-editorial-text-sidebar-muted">
            当前页面
          </p>
          <h2 class="mb-1.5 text-lg font-semibold leading-tight text-editorial-text-sidebar" data-shell-page-title>
            {{ currentPageTitle }}
          </h2>
          <p class="mb-0 text-sm leading-6 text-editorial-text-body" data-shell-page-description>
            {{ currentPageDescription }}
          </p>
        </section>

        <section class="flex flex-col gap-2">
          <p class="pl-1 text-xs font-semibold uppercase tracking-[0.12em] text-editorial-text-sidebar-muted">
            内容菜单
          </p>
          <nav class="flex flex-col gap-2" aria-label="内容菜单">
            <RouterLink
              v-for="page in contentNavPages"
              :key="page.path"
              :to="page.path"
              :class="getShellNavLinkClasses(isActiveContentPath(page.path))"
              :data-shell-nav-link="page.path"
            >
              <span class="text-sm font-semibold leading-5">{{ page.navLabel }}</span>
              <span :class="getShellNavDescriptionClasses(isActiveContentPath(page.path))" class="text-xs leading-5">
                {{ page.description }}
              </span>
            </RouterLink>
          </nav>
        </section>

        <section class="flex flex-col gap-2">
          <p class="pl-1 text-xs font-semibold uppercase tracking-[0.12em] text-editorial-text-sidebar-muted">
            系统菜单
          </p>
          <nav class="flex flex-col gap-2" aria-label="系统菜单">
            <template v-if="profile?.loggedIn">
              <RouterLink
                v-for="page in systemNavPages"
                :key="page.key"
                :to="page.path"
                :class="getShellNavLinkClasses(route.path === page.path)"
                :data-shell-nav-link="page.path"
              >
                <span class="text-sm font-semibold leading-5">{{ page.navLabel }}</span>
                <span :class="getShellNavDescriptionClasses(route.path === page.path)" class="text-xs leading-5">
                  {{ page.description }}
                </span>
              </RouterLink>
            </template>
            <template v-else>
              <a
                v-for="page in systemNavPages"
                :key="page.key"
                :href="page.path"
                :class="getShellNavLinkClasses(route.path === page.path)"
                :data-shell-nav-link="page.path"
              >
                <span class="text-sm font-semibold leading-5">{{ page.navLabel }}</span>
                <span :class="getShellNavDescriptionClasses(route.path === page.path)" class="text-xs leading-5">
                  {{ page.description }}
                </span>
              </a>
            </template>
          </nav>
        </section>

        <div class="mt-auto flex flex-col gap-3 pt-2">
          <section
            class="rounded-editorial-xl border border-editorial-border bg-editorial-panel px-4 py-4 shadow-editorial-card"
            data-shell-theme-toggle
          >
            <p class="mb-1.5 inline-block text-xs font-semibold uppercase tracking-[0.12em] text-editorial-text-sidebar-muted">
              界面主题
            </p>
            <div class="flex flex-col gap-3">
              <a-segmented
                :value="themeMode"
                :options="themeOptions"
                class="w-full"
                @change="handleThemeModeChange"
              />
              <div class="inline-flex items-center">
                <span
                  class="inline-flex items-center rounded-editorial-pill border border-editorial-border bg-editorial-control px-3 py-1 text-xs font-semibold"
                  :class="isDarkMode ? 'text-sky-300' : 'text-emerald-700'"
                >
                  {{ isDarkMode ? "深色模式" : "浅色模式" }}
                </span>
              </div>
            </div>
          </section>

          <section
            class="rounded-editorial-xl border border-editorial-border bg-editorial-panel px-4 py-4 shadow-editorial-card"
            data-shell-account-panel
          >
            <p class="mb-1.5 inline-block text-xs font-semibold uppercase tracking-[0.12em] text-editorial-text-sidebar-muted">
              当前登录用户
            </p>

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

            <template v-else-if="loggedInProfile">
              <div class="flex flex-col gap-2">
                <p class="m-0 text-sm font-semibold leading-6 text-editorial-text-main">
                  {{ loggedInProfile.displayName }}
                </p>
                <p class="m-0 text-sm leading-6 text-editorial-text-body">
                  @{{ loggedInProfile.username }}
                </p>
                <div class="flex flex-wrap gap-2">
                  <a-tag color="blue">{{ loggedInProfile.role }}</a-tag>
                  <a-tag color="green">已登录</a-tag>
                </div>
                <p v-if="loggedInProfile.email" class="m-0 text-sm leading-6 text-editorial-text-body">
                  邮箱：{{ loggedInProfile.email }}
                </p>
              </div>
            </template>

            <template v-else-if="guestProfile">
              <div class="flex flex-col gap-3">
                <div class="flex flex-wrap gap-2">
                  <a-tag color="blue">{{ guestProfile.role }}</a-tag>
                  <a-tag color="gold">公开访问</a-tag>
                </div>
                <p class="m-0 text-sm leading-6 text-editorial-text-body">
                  你现在看到的是公开内容。登录后才能进入系统菜单、保存策略和执行采集动作。
                </p>
                <a href="/login" class="inline-flex" data-shell-login-link>
                  <span
                    class="inline-flex items-center rounded-editorial-pill border border-editorial-border bg-editorial-control px-4 py-2 text-sm font-semibold text-editorial-text-main shadow-editorial-card transition hover:border-editorial-border-strong hover:bg-editorial-control-hover"
                  >
                    去登录
                  </span>
                </a>
              </div>
            </template>

            <template v-else>
              <a-empty description="当前没有可读取的用户摘要" />
            </template>
          </section>
        </div>
      </div>
    </aside>

    <main class="min-w-0 flex-1">
      <div class="mx-auto flex w-full max-w-editorial-shell flex-1 flex-col px-4 py-4 min-[901px]:px-[18px] min-[901px]:py-[18px] min-[1081px]:px-6 min-[1081px]:py-6">
        <section class="rounded-editorial-xl border border-editorial-border bg-editorial-panel shadow-editorial-card">
          <div class="p-4 min-[901px]:px-[22px] min-[901px]:py-[20px]">
            <RouterView v-slot="{ Component }">
              <component :is="Component" />
            </RouterView>
          </div>
        </section>
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
        v-if="mobileSystemDrawerOpen"
        class="fixed inset-0 z-40 bg-slate-950/55 backdrop-blur-sm"
        data-mobile-drawer-backdrop
        @click="closeMobileSystemDrawer"
      >
        <section
          id="mobile-system-drawer"
          class="absolute left-4 right-4 top-[74px] max-h-[calc(100dvh-90px)] overflow-y-auto rounded-editorial-xl border border-editorial-border-strong bg-editorial-panel-strong p-4 shadow-editorial-page"
          data-mobile-system-drawer
          @click.stop
        >
          <div class="flex flex-col gap-4">
            <div class="flex flex-col gap-1.5">
              <p class="m-0 text-xs font-semibold uppercase tracking-[0.12em] text-editorial-text-sidebar-muted">
                系统菜单
              </p>
              <h2 class="m-0 text-lg font-semibold leading-tight text-editorial-text-main">
                {{ currentPageTitle }}
              </h2>
              <p class="m-0 text-sm leading-6 text-editorial-text-body">
                {{ currentPageDescription }}
              </p>
            </div>

            <nav class="flex flex-col gap-2" aria-label="移动端系统菜单">
              <template v-if="profile?.loggedIn">
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
              </template>
              <template v-else>
                <a
                  v-for="page in systemNavPages"
                  :key="page.key"
                  :href="page.path"
                  :class="getShellNavLinkClasses(route.path === page.path)"
                  :data-mobile-drawer-link="page.path"
                  :data-shell-nav-link="page.path"
                  @click="closeMobileSystemDrawer"
                >
                  <span class="text-sm font-semibold leading-5">{{ page.navLabel }}</span>
                  <span :class="getShellNavDescriptionClasses(route.path === page.path)" class="text-xs leading-5">
                    {{ page.description }}
                  </span>
                </a>
              </template>
            </nav>

            <section class="rounded-editorial-xl border border-editorial-border bg-editorial-panel px-4 py-4 shadow-editorial-card">
              <p class="mb-1.5 inline-block text-xs font-semibold uppercase tracking-[0.12em] text-editorial-text-sidebar-muted">
                界面主题
              </p>
              <div class="flex flex-col gap-3">
                <a-segmented
                  :value="themeMode"
                  :options="themeOptions"
                  class="w-full"
                  @change="handleThemeModeChange"
                />
                <div class="inline-flex items-center">
                  <span
                    class="inline-flex items-center rounded-editorial-pill border border-editorial-border bg-editorial-control px-3 py-1 text-xs font-semibold"
                    :class="isDarkMode ? 'text-sky-300' : 'text-emerald-700'"
                  >
                    {{ isDarkMode ? "深色模式" : "浅色模式" }}
                  </span>
                </div>
              </div>
            </section>

            <section class="rounded-editorial-xl border border-editorial-border bg-editorial-panel px-4 py-4 shadow-editorial-card">
              <p class="mb-1.5 inline-block text-xs font-semibold uppercase tracking-[0.12em] text-editorial-text-sidebar-muted">
                当前登录用户
              </p>
              <template v-if="profileLoadState === 'loading'">
                <a-skeleton :active="true" :paragraph="{ rows: 2 }" />
              </template>
              <template v-else-if="loggedInProfile">
                <div class="flex flex-col gap-2">
                  <p class="m-0 text-sm font-semibold leading-6 text-editorial-text-main">
                    {{ loggedInProfile.displayName }}
                  </p>
                  <p class="m-0 text-sm leading-6 text-editorial-text-body">
                    @{{ loggedInProfile.username }}
                  </p>
                  <div class="flex flex-wrap gap-2">
                    <a-tag color="blue">{{ loggedInProfile.role }}</a-tag>
                    <a-tag color="green">已登录</a-tag>
                  </div>
                </div>
              </template>
              <template v-else-if="guestProfile">
                <div class="flex flex-col gap-3">
                  <div class="flex flex-wrap gap-2">
                    <a-tag color="blue">{{ guestProfile.role }}</a-tag>
                    <a-tag color="gold">公开访问</a-tag>
                  </div>
                  <p class="m-0 text-sm leading-6 text-editorial-text-body">
                    登录后才能进入系统菜单和工作台操作。
                  </p>
                  <a href="/login" class="inline-flex" data-mobile-login-link>
                    <span
                    class="inline-flex items-center rounded-editorial-pill border border-editorial-border bg-editorial-control px-4 py-2 text-sm font-semibold text-editorial-text-main shadow-editorial-card transition hover:border-editorial-border-strong hover:bg-editorial-control-hover"
                    >
                      去登录
                    </span>
                  </a>
                </div>
              </template>
              <template v-else-if="profileLoadState === 'error'">
                <a-alert
                  type="warning"
                  show-icon
                  :message="profileError ?? '读取当前登录用户失败'"
                />
              </template>
              <template v-else>
                <a-empty description="当前没有可读取的用户摘要" />
              </template>
            </section>
          </div>
        </section>
      </div>
    </transition>
  </div>
</template>
