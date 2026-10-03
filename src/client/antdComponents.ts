import type { App } from "vue";
import Alert from "ant-design-vue/es/alert";
import Button from "ant-design-vue/es/button";
import Card from "ant-design-vue/es/card";
import Checkbox from "ant-design-vue/es/checkbox";
import Collapse from "ant-design-vue/es/collapse";
import ConfigProvider from "ant-design-vue/es/config-provider";
import DatePicker from "ant-design-vue/es/date-picker";
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
import Table from "ant-design-vue/es/table";
import Tag from "ant-design-vue/es/tag";
import Tooltip from "ant-design-vue/es/tooltip";
import Typography from "ant-design-vue/es/typography";
import message from "ant-design-vue/es/message";
import notification from "ant-design-vue/es/notification";
import cssinjs from "ant-design-vue/es/_util/cssinjs";

/** 只注册现役模板使用的组件族；保留子组件、样式提供器及原 AntD 全局提示/确认出口。 */
export function installClientComponents(app: App): void {
  for (const component of [Alert, Button, Card, Checkbox, Collapse, ConfigProvider, DatePicker,
    Descriptions, Empty, Form, Image, Input, InputNumber, Modal, Popconfirm, Radio, Result,
    Segmented, Select, Skeleton, Space, Spin, Steps, Switch, Table, Tag, Tooltip, Typography]) {
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
