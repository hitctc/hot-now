import "ant-design-vue/dist/reset.css";
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  Popconfirm,
  Result,
  Segmented,
  Select,
  Skeleton,
  Space,
  Spin,
  Statistic,
  Switch,
  Table,
  Tag,
  Typography
} from "ant-design-vue";
import { createApp } from "vue";

import App from "./App.vue";
import { router } from "./router";
import { bootstrapEditorialTheme } from "./composables/useTheme";
import "./styles/tailwind.css";

const clientUiComponents = [
  Alert,
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  Popconfirm,
  Result,
  Segmented,
  Select,
  Skeleton,
  Space,
  Spin,
  Statistic,
  Switch,
  Table,
  Tag,
  Typography
];

bootstrapEditorialTheme();

const app = createApp(App);

// 这里只注册当前壳层实际用到的 AntD 组件，避免整套组件库继续压进一个超大的 vendor chunk。
for (const component of clientUiComponents) {
  app.use(component);
}

app.use(router);
app.mount("#app");
