# 2026-04-08 HotNow 微信公众号桥接来源设计

## 1. 背景与目标

当前 HotNow 的 source 体系是明确的 `RSS-first` 结构：

- `content_sources` 以 `rss_url` 作为采集入口核心字段。
- `loadEnabledSourceIssues` 会读取启用来源的 `rss_url`，再统一走 feed 拉取和解析流程。
- `/settings/sources` 当前只支持围绕 RSS 来源做启停、展示口径和手动采集操作。

现在的新需求是：在不推翻现有 `RSS-first` 主架构的前提下，支持把**第三方微信公众号**作为新来源，并且后续能够**批量接入多个公众号**，且这些来源需要能在 `/settings/sources` 中完成可视化新增、编辑和删除。

本设计的目标是：

- 继续保留 HotNow 主链路的 `RSS-first` 语义。
- 在仓库内新增一个“微信公众号桥接模块”，把第三方公众号转换成 HotNow 可消费的 feed。
- 让 `/settings/sources` 支持可视化维护这类公众号来源。
- 第一阶段只做最小可行实现，不引入多 provider 扩展面板、批量导入或复杂健康检查。

## 2. 设计结论

采用下面的总体方案：

- `content_sources` 继续作为统一来源表，不新建平行的“公众号来源表”。
- 为来源新增类型语义，至少区分：
  - `rss`
  - `wechat_bridge`
- 对于 `wechat_bridge` 类型，HotNow 不直接抓取公众号页面，而是先通过仓库内置 bridge 模块生成可消费的 feed 地址。
- 采集链路继续只认“feed 输入”，不让微信抓取细节渗透到后续聚类、评分、报告和内容页模型。
- `/settings/sources` 提供统一来源列表和统一新增/编辑弹窗，允许维护 RSS 来源和公众号桥接来源。

这意味着本轮不会把整个 source 系统升级成“任意 source adapter 框架”。微信公众号接入只是作为现有 `RSS-first` 体系上的一层 bridge 扩展。

## 3. 数据模型

### 3.1 content_sources 扩展

继续复用 `content_sources`，新增以下字段：

- `source_type`
  - 字符串枚举
  - 第一阶段取值：
    - `rss`
    - `wechat_bridge`
- `bridge_kind`
  - 可空字符串
  - 仅在 `source_type = wechat_bridge` 时有意义
- `bridge_config_json`
  - 可空字符串
  - 存桥接来源的结构化配置

现有字段保留：

- `kind`
- `name`
- `site_url`
- `rss_url`
- `is_enabled`
- `is_builtin`
- `show_all_when_selected`
- `updated_at`

### 3.2 字段语义

- `source_type = rss`
  - 语义与现状一致
  - 继续直接使用 `rss_url`
- `source_type = wechat_bridge`
  - `rss_url` 不再是人工录入的主字段
  - `bridge_kind` 决定桥接 provider
  - `bridge_config_json` 保存公众号标识和桥接所需参数

### 3.3 第一阶段 bridge 配置结构

第一阶段只支持一种 bridge provider，因此配置结构保持最小：

```json
{
  "accountId": "provider-specific-id"
}
```

如果后续确实需要扩展 provider，再在 `bridge_config_json` 上做版本化或字段扩展。本轮不预留额外复杂度。

## 4. Bridge 模块设计

### 4.1 模块边界

新增目录：

- `src/core/wechat/`

建议新增文件：

- `resolveWechatBridgeFeed.ts`
- `wechatBridgeProviders.ts`
- `wechatBridgeTypes.ts`

职责划分：

- `resolveWechatBridgeFeed`
  - 输入一条 `wechat_bridge` source 记录
  - 输出一个最终 feed 地址
- `wechatBridgeProviders`
  - 根据 `bridge_kind` 生成具体 feed 地址
- `wechatBridgeTypes`
  - 定义 bridge 来源类型和配置结构

### 4.2 明确不做的事

bridge 模块本轮不负责：

- 直接输出 content items
- 自己做文章去重
- 自己做正文抽取
- 自己做策略评估
- 自己做报告生成

bridge 模块只负责一件事：

- **把第三方公众号来源转成 HotNow 现有链路能理解的 feed 输入**

### 4.3 Provider 范围

第一阶段只支持一个 provider。

选择原则：

- 能稳定生成 feed 地址
- 参数结构简单
- 不要求 HotNow 自己去模拟公众号页面抓取

第一阶段不做多 provider UI，也不做 provider 优先级切换。后续需要扩展时，再在 `bridge_kind` 上继续加。

## 5. 采集链路改造

### 5.1 入口逻辑

当前 `loadEnabledSourceIssues` / `loadActiveSourceIssue` 是按 `rss_url` 直接拉源。

本轮调整为：

- 如果 `source_type = rss`
  - 继续按当前逻辑直接使用 `rss_url`
- 如果 `source_type = wechat_bridge`
  - 先调用 `resolveWechatBridgeFeed`
  - 得到最终 feed 地址
  - 再沿用现有 feed 拉取与解析逻辑

### 5.2 兼容原则

RSS 来源行为保持不变。

也就是说：

- 现有 built-in source 不需要迁移
- 现有 source 统计、内容页来源筛选、手动采集逻辑继续基于 `source_id` 工作
- 微信公众号桥接来源在后续链路中与普通 source 等价

## 6. /settings/sources 页面交互

### 6.1 列表形态

来源列表继续统一展示，不拆分成“RSS 区”和“公众号区”。

每条来源除现有字段外，新增展示：

- `来源类型`
- 如果为公众号桥接源，则展示 `桥接方式摘要`
- 如果为公众号桥接源，则展示 `公众号标识摘要`

### 6.2 新增来源

在 `/settings/sources` 新增统一“添加来源”入口，使用弹窗或抽屉表单。

表单字段：

- `来源类型`
  - `RSS`
  - `微信公众号`
- `来源名称`
- `来源主页`

当来源类型为 `RSS`：

- `RSS 地址`

当来源类型为 `微信公众号`：

- `桥接方式`
- `公众号标识`

### 6.3 编辑与删除

列表项支持：

- 启用 / 停用
- 编辑
- 删除

删除规则沿用现有 source 语义，但仍需保护内置源不被误删。桥接源默认属于用户新增来源，因此允许删除。

## 7. 校验与错误处理

### 7.1 RSS 来源

- `rss_url` 必填
- 必须是合法 URL

### 7.2 微信公众号桥接来源

- `bridge_kind` 必填
- `公众号标识` 必填
- 服务端必须能基于配置成功生成 bridge feed 地址
- 如果 feed 地址生成失败，则保存失败并返回明确错误信息

### 7.3 第一阶段不做的校验

本轮不做：

- 保存时的实时联网抓取校验
- provider 健康检查面板
- 失败重试配置
- 自动兜底切换其他 bridge provider

理由：

- 第三方桥接本身可能瞬时不可用
- 保存表单时做联网拉取会恶化交互体验
- 第一阶段的目标是让 source 能被正确维护和被采集链路识别，而不是一次性把可观测性做满

## 8. 测试门禁

### 8.1 服务端

至少覆盖：

- source CRUD API 能保存和读取 `wechat_bridge`
- `listSourceWorkbench` / `listSourceCards` 能正确展示 `source_type`
- `loadEnabledSourceIssues` 能区分 `rss` 和 `wechat_bridge`
- bridge 配置非法时能返回明确错误

### 8.2 客户端

至少覆盖：

- `/settings/sources` 的新增来源弹窗
- 公众号来源表单字段显隐
- 编辑公众号来源
- 删除公众号来源

### 8.3 构建与验证

推荐验证顺序：

1. 最相关前端测试
2. 最相关服务端测试
3. `npm run build:client`
4. 如入口和类型定义被波及，再跑 `npm run build`

最小 smoke test：

1. 在 `/settings/sources` 新增一个公众号桥接来源
2. 保存后确认该来源出现在列表
3. 执行一次手动采集，确认采集链路能够识别该来源

## 9. 范围边界

本轮明确不做：

- 批量导入公众号
- 自动发现公众号标识
- 多 provider 并行回退
- 公众号 bridge 监控面板
- 独立于 `content_sources` 的第二套来源体系
- 直接抓取 `mp.weixin.qq.com` 页面

## 10. 推荐实施顺序

1. 先扩展 `content_sources` 数据模型与读写模型
2. 再增加 bridge 模块与 source loader 分支
3. 再接 `/settings/sources` 的新增/编辑/删除交互
4. 最后补测试、文档和 smoke test

这样可以最大限度把改动控制在“source 维护”和“feed 解析入口”两层，不把不相关模块一起拖进来。
