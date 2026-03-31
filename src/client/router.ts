import { defineComponent, h } from "vue";
import { createRouter, createWebHistory, type RouteRecordRaw, type RouterHistory } from "vue-router";

import { APP_ROUTE_BASE } from "./appBases";

export type ShellPageKey = "view-rules" | "sources" | "profile";

export type ShellPageMeta = {
  key: ShellPageKey;
  path: string;
  navLabel: string;
  title: string;
  description: string;
};

export const shellPageMetas = [
  {
    key: "view-rules",
    path: "/settings/view-rules",
    navLabel: "筛选策略",
    title: "筛选策略工作台",
    description: "当前会承载 LLM 厂商设置与正式自然语言策略。"
  },
  {
    key: "sources",
    path: "/settings/sources",
    navLabel: "数据收集",
    title: "数据收集工作台",
    description: "当前会承载 source 启用状态与手动采集动作。"
  },
  {
    key: "profile",
    path: "/settings/profile",
    navLabel: "当前用户",
    title: "当前登录用户页",
    description: "当前会展示登录用户摘要和会话上下文。"
  }
] as const satisfies readonly ShellPageMeta[];

declare module "vue-router" {
  interface RouteMeta {
    shellKey: ShellPageKey;
    navLabel: string;
    title: string;
    description: string;
  }
}

function createRoutePage(meta: ShellPageMeta) {
  return defineComponent({
    name: `${meta.key}RoutePage`,
    setup() {
      return () =>
        h("section", { class: "unified-shell__route-page", "data-shell-route-page": meta.key }, [
          h("h2", meta.title),
          h("p", meta.description),
          h("p", `这里先保留 ${meta.navLabel} 的占位区域，后续业务页会在同一路径下继续展开。`)
        ]);
    }
  });
}

function createShellRoute(meta: ShellPageMeta): RouteRecordRaw {
  return {
    path: meta.path,
    name: meta.key,
    component: createRoutePage(meta),
    meta: {
      shellKey: meta.key,
      navLabel: meta.navLabel,
      title: meta.title,
      description: meta.description
    }
  };
}

const routes: RouteRecordRaw[] = [
  {
    path: "/",
    redirect: "/settings/view-rules"
  },
  ...shellPageMetas.map((meta) => createShellRoute(meta))
];

export function createAppRouter(history: RouterHistory = createWebHistory(APP_ROUTE_BASE)) {
  // 路由只负责页面元数据和占位页装配，真实业务实现会继续挂在同一组路径上。
  return createRouter({
    history,
    routes
  });
}

export const router = createAppRouter();
