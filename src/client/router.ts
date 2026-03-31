import { type Component } from "vue";
import { createRouter, createWebHistory, type RouteRecordRaw, type RouterHistory } from "vue-router";

import { APP_ROUTE_BASE } from "./appBases";
import ProfilePage from "./pages/settings/ProfilePage.vue";
import SourcesPage from "./pages/settings/SourcesPage.vue";
import ViewRulesPage from "./pages/settings/ViewRulesPage.vue";

export type ShellPageKey = "ai-new" | "ai-hot" | "view-rules" | "sources" | "profile";

export type ShellPageMeta = {
  key: ShellPageKey;
  path: string;
  section: "content" | "system";
  navLabel: string;
  title: string;
  description: string;
};

const aiNewPageMeta = {
  key: "ai-new",
  path: "/ai-new",
  section: "content",
  navLabel: "AI 新讯",
  title: "AI 新讯工作台",
  description: "这里会展示最新 AI 新闻、模型、事件与智能体信号。"
} as const satisfies ShellPageMeta;

const aiHotPageMeta = {
  key: "ai-hot",
  path: "/ai-hot",
  section: "content",
  navLabel: "AI 热点",
  title: "AI 热点工作台",
  description: "这里会承接已经开始形成热度的 AI 热点内容。"
} as const satisfies ShellPageMeta;

const viewRulesPageMeta = {
  key: "view-rules",
  path: "/settings/view-rules",
  section: "system",
  navLabel: "筛选策略",
  title: "筛选策略工作台",
  description: "当前会承载 AI 新讯与 AI 热点的筛选规则。"
} as const satisfies ShellPageMeta;

const sourcesPageMeta = {
  key: "sources",
  path: "/settings/sources",
  section: "system",
  navLabel: "数据收集",
  title: "数据收集工作台",
  description: "当前会承载 source 启用状态与手动采集动作。"
} as const satisfies ShellPageMeta;

const profilePageMeta = {
  key: "profile",
  path: "/settings/profile",
  section: "system",
  navLabel: "当前用户",
  title: "当前登录用户页",
  description: "当前会展示登录用户摘要和会话上下文。"
} as const satisfies ShellPageMeta;

export const shellPageMetas = [aiNewPageMeta, aiHotPageMeta, viewRulesPageMeta, sourcesPageMeta, profilePageMeta] as const satisfies readonly ShellPageMeta[];
export const systemShellPageMetas = [viewRulesPageMeta, sourcesPageMeta, profilePageMeta] as const satisfies readonly ShellPageMeta[];

declare module "vue-router" {
  interface RouteMeta {
    shellKey: ShellPageKey;
    navLabel: string;
    title: string;
    description: string;
  }
}

function createRouteName(meta: ShellPageMeta): string {
  const pathSegment = meta.path === "/" ? "root" : meta.path.slice(1).replaceAll("/", "-");

  return `${meta.key}-${pathSegment}`;
}

function createShellRoute(meta: ShellPageMeta, component: Component): RouteRecordRaw {
  return {
    path: meta.path,
    name: createRouteName(meta),
    component,
    meta: createRouteMeta(meta)
  };
}

function createRouteMeta(meta: ShellPageMeta) {
  return {
    shellKey: meta.key,
    navLabel: meta.navLabel,
    title: meta.title,
    description: meta.description
  };
}

const viewRulesPage = ViewRulesPage;
const sourcesPage = SourcesPage;
const profilePage = ProfilePage;

const routes: RouteRecordRaw[] = [
  {
    path: "/",
    redirect: "/settings/view-rules"
  },
  createShellRoute(viewRulesPageMeta, viewRulesPage),
  createShellRoute(sourcesPageMeta, sourcesPage),
  createShellRoute(profilePageMeta, profilePage)
];

export function createAppRouter(history: RouterHistory = createWebHistory(APP_ROUTE_BASE)) {
  // 路由只负责页面元数据和占位页装配，真实业务实现会继续挂在同一组路径上。
  return createRouter({
    history,
    routes
  });
}

export const router = createAppRouter();
