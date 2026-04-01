import { computed, ref, watch, type ComputedRef, type Ref } from "vue";
import type { ConfigProviderProps } from "ant-design-vue";

import {
  createEditorialProviderTheme,
  type EditorialThemeMode
} from "../theme/editorialTheme";
import { createEditorialCssVariables } from "../theme/editorialTokens";

export type ThemeMode = EditorialThemeMode;

export const THEME_STORAGE_KEY = "hot-now-theme";

type ProviderThemeConfig = NonNullable<ConfigProviderProps["theme"]>;

type ThemeController = {
  themeMode: Ref<ThemeMode>;
  isDarkMode: ComputedRef<boolean>;
  themeConfig: ComputedRef<ProviderThemeConfig>;
  setThemeMode: (nextThemeMode: ThemeMode) => void;
  toggleTheme: () => void;
};

let themeController: ThemeController | null = null;

// 只有 light / dark 两个受支持值可以进入主题状态，避免把脏数据写回系统。
function isThemeMode(value: string | null): value is ThemeMode {
  return value === "dark" || value === "light";
}

// 读取已保存的主题偏好，空值或非法值都会回落到默认的深色模式。
function readPersistedThemeMode(): ThemeMode {
  if (typeof window === "undefined") {
    return "dark";
  }

  try {
    const storedValue = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeMode(storedValue) ? storedValue : "dark";
  } catch {
    return "dark";
  }
}

// 页面挂载前先把主题状态写进 document，避免首屏等到组件 setup 后才补 CSS variables。
export function bootstrapEditorialTheme(): ThemeMode {
  const nextThemeMode = readPersistedThemeMode();
  syncThemeModeToDocument(nextThemeMode);
  return nextThemeMode;
}

// 把当前主题同步到本地存储和 document 根节点，供样式和测试共享同一份状态。
function syncThemeModeToDocument(nextThemeMode: ThemeMode): void {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.dataset.theme = nextThemeMode;
  document.documentElement.style.colorScheme = nextThemeMode;
  const cssVariables = createEditorialCssVariables(nextThemeMode);

  for (const [name, value] of Object.entries(cssVariables)) {
    document.documentElement.style.setProperty(name, value);
  }
}

// 将主题偏好持久化到 localStorage，失败时静默回退，不阻断页面启动。
function persistThemeMode(nextThemeMode: ThemeMode): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, nextThemeMode);
  } catch {
    // localStorage 可能在隐私模式或受限环境里不可写，这里只做静默降级。
  }
}

function createThemeController(): ThemeController {
  const themeMode = ref<ThemeMode>(readPersistedThemeMode());

  watch(
    themeMode,
    (nextThemeMode) => {
      persistThemeMode(nextThemeMode);
      syncThemeModeToDocument(nextThemeMode);
    },
    {
      immediate: true
    }
  );

  const isDarkMode = computed(() => themeMode.value === "dark");
  const themeConfig = computed<ProviderThemeConfig>(() => createEditorialProviderTheme(themeMode.value));

  // 主题切换只修改唯一状态源，后续同步动作交给 watcher 统一处理。
  function setThemeMode(nextThemeMode: ThemeMode): void {
    themeMode.value = nextThemeMode;
  }

  // 主题切换按钮只负责在深色和浅色之间往返，不直接操作 DOM。
  function toggleTheme(): void {
    setThemeMode(themeMode.value === "dark" ? "light" : "dark");
  }

  return {
    themeMode,
    isDarkMode,
    themeConfig,
    setThemeMode,
    toggleTheme
  };
}

// 整个客户端只共享一份主题控制器，避免多处挂载时出现主题状态不一致。
export function useTheme(): ThemeController {
  if (!themeController) {
    themeController = createThemeController();
  }

  return themeController;
}
