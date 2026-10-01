import "ant-design-vue/dist/reset.css";
import Antd from "ant-design-vue";
import { createApp } from "vue";

import App from "./App.vue";
import { router } from "./router";
import { bootstrapEditorialTheme } from "./composables/useTheme";
import { disablePageZoom } from "./utils/disablePageZoom";
import "./styles/tailwind.css";

bootstrapEditorialTheme();
// H5 全局禁止双指缩放；仅拦截手势与多指，单指滚动和点击不受影响。
disablePageZoom();

const app = createApp(App);

app.use(Antd);
app.use(router);
app.mount("#app");
