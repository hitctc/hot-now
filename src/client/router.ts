import { createRouter, createWebHistory, type RouteRecordRaw, type RouterHistory } from "vue-router";
import { defineComponent, h } from "vue";
import { APP_ROUTE_BASE } from "./appBases";

function createRoutePage(title: string, description: string) {
  return defineComponent({
    name: `${title}Page`,
    setup() {
      return () =>
        h("section", { class: "app-shell__route-page" }, [
          h("h2", title),
          h("p", description)
        ]);
    }
  });
}

const routes: RouteRecordRaw[] = [
  {
    path: "/",
    redirect: "/settings/view-rules"
  },
  {
    path: "/settings/view-rules",
    component: createRoutePage("筛选策略工作台", "这里会承载 LLM 厂商设置与正式自然语言策略。")
  },
  {
    path: "/settings/sources",
    component: createRoutePage("数据收集工作台", "这里会承载 source 启用状态与手动采集动作。")
  },
  {
    path: "/settings/profile",
    component: createRoutePage("当前用户页", "这里会展示当前登录用户信息。")
  }
];

export function createAppRouter(history: RouterHistory = createWebHistory(APP_ROUTE_BASE)) {
  return createRouter({
    history,
    routes
  });
}

export const router = createAppRouter();
