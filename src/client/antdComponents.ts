import type { App } from "vue";
import Alert from "ant-design-vue/es/alert";
import Button from "ant-design-vue/es/button";
import Card from "ant-design-vue/es/card";
import Checkbox from "ant-design-vue/es/checkbox";
import Collapse from "ant-design-vue/es/collapse";
import ConfigProvider from "ant-design-vue/es/config-provider";
import Descriptions from "ant-design-vue/es/descriptions";
import Empty from "ant-design-vue/es/empty";
import Form from "ant-design-vue/es/form";
import Image from "ant-design-vue/es/image";
import Input from "ant-design-vue/es/input";
import InputNumber from "ant-design-vue/es/input-number";
import Modal from "ant-design-vue/es/modal";
import Popconfirm from "ant-design-vue/es/popconfirm";
import Radio from "ant-design-vue/es/radio";
import Result from "ant-design-vue/es/result";
import Segmented from "ant-design-vue/es/segmented";
import Select from "ant-design-vue/es/select";
import Skeleton from "ant-design-vue/es/skeleton";
import Space from "ant-design-vue/es/space";
import Spin from "ant-design-vue/es/spin";
import Steps from "ant-design-vue/es/steps";
import Switch from "ant-design-vue/es/switch";
import Tag from "ant-design-vue/es/tag";
import Tooltip from "ant-design-vue/es/tooltip";
import Typography from "ant-design-vue/es/typography";
import message from "ant-design-vue/es/message";
import notification from "ant-design-vue/es/notification";
import cssinjs from "ant-design-vue/es/_util/cssinjs";

/** 注册壳层/公共展示所需组件族；重表格和日期选择由消费者局部导入，保留全局提示与样式出口。 */
export function installClientComponents(app: App): void {
  for (const component of [Alert, Button, Card, Checkbox, Collapse, ConfigProvider,
    Descriptions, Empty, Form, Image, Input, InputNumber, Modal, Popconfirm, Radio, Result,
    Segmented, Select, Skeleton, Space, Spin, Steps, Switch, Tag, Tooltip, Typography]) {
    app.use(component);
  }
  app.use(cssinjs.StyleProvider);
  Object.assign(app.config.globalProperties, {
    $message: message,
    $notification: notification,
    $info: Modal.info,
    $success: Modal.success,
    $error: Modal.error,
    $warning: Modal.warning,
    $confirm: Modal.confirm,
    $destroyAll: Modal.destroyAll,
  });
}
