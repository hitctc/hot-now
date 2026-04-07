import { createRouter, createWebHistory, type RouteRecordRaw, type RouterHistory } from "vue-router";

import { APP_ROUTE_BASE } from "./appBases";

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
  title: "AI 新讯",
  description: "最近采集到的 AI 新消息、模型更新和产品动态。"
} as const satisfies ShellPageMeta;

const aiNewRootPageMeta = {
  ...aiNewPageMeta,
  path: "/"
} as const satisfies ShellPageMeta;

const aiHotPageMeta = {
  key: "ai-hot",
  path: "/ai-hot",
  section: "content",
  navLabel: "AI 热点",
  title: "AI 热点",
  description: "已经形成热度、值得继续追踪的 AI 信号。"
} as const satisfies ShellPageMeta;

const viewRulesPageMeta = {
  key: "view-rules",
  path: "/settings/view-rules",
  section: "system",
  navLabel: "筛选策略",
  title: "筛选策略",
  description: "维护自然语言规则、反馈池、草稿池和重算状态。"
} as const satisfies ShellPageMeta;

const sourcesPageMeta = {
  key: "sources",
  path: "/settings/sources",
  section: "system",
  navLabel: "数据收集",
  title: "数据收集",
  description: "查看来源状态、采集动作和当前展示口径。"
} as const satisfies ShellPageMeta;

const profilePageMeta = {
  key: "profile",
  path: "/settings/profile",
  section: "system",
  navLabel: "当前用户",
  title: "当前用户",
  description: "当前登录账号、会话状态和联系信息。"
} as const satisfies ShellPageMeta;

export const shellPageMetas = [aiNewPageMeta, aiHotPageMeta, sourcesPageMeta, viewRulesPageMeta, profilePageMeta] as const satisfies readonly ShellPageMeta[];
export const systemShellPageMetas = [sourcesPageMeta, viewRulesPageMeta, profilePageMeta] as const satisfies readonly ShellPageMeta[];

type ShellRouteComponent = () => Promise<unknown>;

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

// 壳层页面统一走懒加载，这样 Vite 可以按路由拆 chunk，而不是把所有页面都塞进首屏入口。
function createShellRoute(meta: ShellPageMeta, component: ShellRouteComponent): RouteRecordRaw {
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

const viewRulesPage = () => import("./pages/settings/ViewRulesPage.vue");
const sourcesPage = () => import("./pages/settings/SourcesPage.vue");
const profilePage = () => import("./pages/settings/ProfilePage.vue");
const aiNewPage = () => import("./pages/content/AiNewPage.vue");
const aiHotPage = () => import("./pages/content/AiHotPage.vue");

const routes: RouteRecordRaw[] = [
  createShellRoute(aiNewRootPageMeta, aiNewPage),
  createShellRoute(aiNewPageMeta, aiNewPage),
  createShellRoute(aiHotPageMeta, aiHotPage),
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
