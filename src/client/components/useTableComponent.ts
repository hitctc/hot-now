import { getCurrentInstance } from "vue";
import Table from "ant-design-vue/es/table";

/** 在真实表格消费者的setup安装原组件族，每应用一次；保留原全局标签/子组件合同，不提前进入公共页依赖。 */
export function useTableComponent(): void {
  const app = getCurrentInstance()?.appContext.app;
  if (!app) throw new Error("表格组件必须在消费者setup内安装");
  // 原AntD表格slot声明固定Record类型；沿用原全局解析，不以类型断言改变业务行/事件。
  if (!app.component("ATable")) app.use(Table);
}
