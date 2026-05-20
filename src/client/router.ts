import { createRouter, createWebHistory, type RouteRecordRaw, type RouterHistory } from "vue-router";

import { APP_ROUTE_BASE } from "./appBases";

export type ShellPageKey =
  | "ai-new"
  | "ai-hot"
  | "ai-timeline"
  | "ai-timeline-admin"
  | "creative-source-items"
  | "creative-finished-articles"
  | "view-rules"
  | "sources"
  | "profile"
  | "wechat-mp";

export type ShellPageMeta = {
  key: ShellPageKey;
  path: string;
  section: "content" | "system" | "creative";
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

const aiTimelinePageMeta = {
  key: "ai-timeline",
  path: "/ai-timeline",
  section: "content",
  navLabel: "AI 时间线",
  title: "AI 时间线",
  description: "按时间追踪主流 AI 公司官方发布的模型、产品、开发生态和行业动态。"
} as const satisfies ShellPageMeta;

const creativeSourceItemsPageMeta = {
  key: "creative-source-items",
  path: "/creative/source-items",
  section: "creative",
  navLabel: "素材库",
  title: "素材库",
  description: "查看外部 agent 推送的新闻素材和关联的成品文章。"
} as const satisfies ShellPageMeta;

const creativeFinishedArticlesPageMeta = {
  key: "creative-finished-articles",
  path: "/creative/finished-articles",
  section: "creative",
  navLabel: "成品文章",
  title: "成品文章",
  description: "查看、编辑和管理 AI 写作的成品文章。"
} as const satisfies ShellPageMeta;

const viewRulesPageMeta = {
  key: "view-rules",
  path: "/settings/view-rules",
  section: "system",
  navLabel: "筛选策略",
  title: "筛选策略",
  description: "查看反馈池，并保留暂未使用的 LLM 设置入口。"
} as const satisfies ShellPageMeta;

const sourcesPageMeta = {
  key: "sources",
  path: "/settings/sources",
  section: "system",
  navLabel: "数据收集",
  title: "数据收集",
  description: "查看来源状态、维护自定义来源，并执行采集动作。"
} as const satisfies ShellPageMeta;

const aiTimelineAdminPageMeta = {
  key: "ai-timeline-admin",
  path: "/settings/ai-timeline",
  section: "system",
  navLabel: "AI 时间线 feed",
  title: "AI 时间线 feed",
  description: "查看外部 Markdown feed 解析出的官方事件、证据链和展示规则。"
} as const satisfies ShellPageMeta;

const profilePageMeta = {
  key: "profile",
  path: "/settings/profile",
  section: "system",
  navLabel: "当前用户",
  title: "当前用户",
  description: "当前登录账号、会话状态和联系信息。"
} as const satisfies ShellPageMeta;

const wechatMpSettingsPageMeta = {
  key: "wechat-mp",
  path: "/settings/wechat-mp",
  section: "system",
  navLabel: "公众号配置",
  title: "公众号配置",
  description: "管理微信公众号 API 凭证，用于推送草稿到公众号草稿箱。"
} as const satisfies ShellPageMeta;

export const shellPageMetas = [
  aiNewPageMeta,
  aiHotPageMeta,
  // aiTimelinePageMeta, // 暂时下架 AI 时间线（2026-05-17）
  creativeSourceItemsPageMeta,
  creativeFinishedArticlesPageMeta,
  sourcesPageMeta,
  // aiTimelineAdminPageMeta, // 暂时下架 AI 时间线 feed 管理（2026-05-17）
  viewRulesPageMeta,
  wechatMpSettingsPageMeta,
  profilePageMeta
] as const satisfies readonly ShellPageMeta[];
export const systemShellPageMetas = [
  sourcesPageMeta,
  // aiTimelineAdminPageMeta, // 暂时下架 AI 时间线 feed 管理（2026-05-17）
  viewRulesPageMeta,
  wechatMpSettingsPageMeta,
  profilePageMeta
] as const satisfies readonly ShellPageMeta[];

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
const aiTimelineAdminPage = () => import("./pages/settings/AiTimelineAdminPage.vue");
const profilePage = () => import("./pages/settings/ProfilePage.vue");
const wechatMpSettingsPage = () => import("./pages/settings/WechatMpSettingsPage.vue");
const aiNewPage = () => import("./pages/content/AiNewPage.vue");
const aiHotPage = () => import("./pages/content/AiHotPage.vue");
const aiTimelinePage = () => import("./pages/content/AiTimelinePage.vue");
const creativeSourceItemsPage = () => import("./pages/creative/SourceItemsPage.vue");
const creativeFinishedArticlesPage = () => import("./pages/creative/FinishedArticlesPage.vue");

const routes: RouteRecordRaw[] = [
  createShellRoute(aiNewRootPageMeta, aiNewPage),
  createShellRoute(aiNewPageMeta, aiNewPage),
  createShellRoute(aiHotPageMeta, aiHotPage),
  // createShellRoute(aiTimelinePageMeta, aiTimelinePage), // 暂时下架 AI 时间线（2026-05-17）
  createShellRoute(creativeSourceItemsPageMeta, creativeSourceItemsPage),
  createShellRoute(creativeFinishedArticlesPageMeta, creativeFinishedArticlesPage),
  createShellRoute(viewRulesPageMeta, viewRulesPage),
  createShellRoute(sourcesPageMeta, sourcesPage),
  // createShellRoute(aiTimelineAdminPageMeta, aiTimelineAdminPage), // 暂时下架 AI 时间线 feed 管理（2026-05-17）
  createShellRoute(wechatMpSettingsPageMeta, wechatMpSettingsPage),
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
