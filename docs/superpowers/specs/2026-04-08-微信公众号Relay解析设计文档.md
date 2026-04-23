# 2026-04-08 HotNow 微信公众号 Relay 解析设计

## 1. 背景

当前 HotNow 已经支持在 `/settings/sources` 中新增 RSS 来源和微信公众号来源，但微信来源解析仍然依赖 HotNow 进程直接访问 bridge / 索引服务。这不符合当前产品目标：

- 用户不应该理解或准备 bridge 相关配置
- 用户不应该为了新增公众号来源而接触 feed URL、provider id、token 等内部概念
- 本地 HotNow 不应该直接把用户当前网络出口暴露给多个公共 bridge / 索引服务

同时，第三方公众号并没有稳定的官方开放接口可直接获取全量文章列表，因此“系统内部完全不依赖任何 bridge / 索引服务”并不现实。正确方向是：

- 对用户隐藏 bridge/provider 复杂性
- 把对 bridge/provider 的访问下沉到受控的远端 relay 层
- 让 HotNow 本地只面对一个稳定、可控的 resolver 接口

## 2. 目标

本设计的目标是：

- HotNow 本地只接入一个远端 relay 服务，不再直接调用任何公共 bridge/provider
- `/settings/sources` 中新增公众号来源时，用户仍然只填写：
  - `公众号名称`
  - `公众号文章链接`（可选，建议填写）
- relay 负责：
  - provider fallback
  - bridge/provider 调用
  - 缓存、限频、超时、熔断
  - 统一输出最终 `rssUrl`
- HotNow 保存时只落最终 `rssUrl` 和必要审计信息；后续采集继续沿用现有 RSS 主链路

## 3. 非目标

本设计当前不做：

- 在 HotNow 本地继续扩展多个公共 bridge/provider 直连逻辑
- 在 HotNow 本地实现反爬、代理池、IP 池等网络层能力
- 对用户暴露 provider 选择、bridge 方式或调试信息
- 在采集阶段重复调用 relay 重新解析公众号来源
- 一次性实现 relay 的完整运维平台、监控后台或管理 UI

## 4. 总体架构

### 4.1 责任划分

#### HotNow 本地

职责：

- 接收用户输入：`RSS URL` 或 `公众号名称 + 可选文章链接`
- 调用远端 relay resolver
- 保存最终标准化 source 记录到 `content_sources`
- 后续采集继续按现有 RSS-first 流水线读取 `rss_url`

不再负责：

- 直接访问 `Wechat2RSS`
- 直接访问 `RSSHub` 微信路由
- 直接访问任何 bridge/provider 的检索或注册接口

#### 远端 Relay

职责：

- 接收公众号解析请求
- 内部管理 provider registry
- 执行 provider fallback
- 做缓存、限频、超时、熔断
- 把不同 provider 的结果规范化为统一响应

#### 公共 Bridge / 索引服务

职责：

- 提供公众号到 feed 的间接解析能力
- 不直接暴露给用户
- 不直接由 HotNow 本地访问

### 4.2 数据流

#### 新增 RSS 来源

1. 用户在 `/settings/sources` 输入 `RSS URL`
2. HotNow 本地读取 feed 元数据
3. HotNow 自动生成 `kind / name / siteUrl`
4. HotNow 保存标准化 source

#### 新增公众号来源

1. 用户在 `/settings/sources` 输入：
   - `公众号名称`
   - `公众号文章链接`（可选）
2. HotNow 调用远端 relay：`POST /wechat/resolve-source`
3. relay 内部：
   - 优先尝试文章链接解析
   - 无文章链接时走名称检索
   - 按 provider 顺序 fallback
   - 命中缓存则直接返回
4. relay 返回最终标准化结果：`rssUrl / resolvedName / siteUrl`
5. HotNow 生成最终 source 并写入 `content_sources`
6. 后续采集继续走现有 feed 拉取和解析链路

## 5. HotNow 与 Relay 契约

### 5.1 HotNow 本地配置

HotNow 本地不再使用：

- `WECHAT_BRIDGE_BASE_URL`
- `WECHAT_BRIDGE_TOKEN`

改为只保留 relay 级配置：

- `WECHAT_RESOLVER_BASE_URL`
- `WECHAT_RESOLVER_TOKEN`（可选，若 relay 需要鉴权）

这里的 token 语义是：

- `HotNow -> 你自己的 relay` 的内部鉴权
- 不是公共 bridge/provider 的 token
- 不应再被产品文案描述成用户必须准备的 bridge 凭据

### 5.2 Resolver API

#### 请求

`POST /wechat/resolve-source`

请求体：

```json
{
  "wechatName": "数字生命卡兹克",
  "articleUrl": "https://mp.weixin.qq.com/s?..."
}
```

约束：

- `wechatName` 与 `articleUrl` 至少提供一个
- 两个都提供时，relay 优先使用 `articleUrl`
- `wechatName` 主要用于名称检索和展示名兜底

#### 成功响应

```json
{
  "ok": true,
  "rssUrl": "https://relay.example.com/feed/xxx.xml",
  "resolvedName": "数字生命卡兹克",
  "siteUrl": "https://mp.weixin.qq.com/",
  "resolverSummary": "resolved-via:wechat2rss-article"
}
```

字段含义：

- `rssUrl`：最终可采集 feed
- `resolvedName`：relay 侧确认后的展示名称
- `siteUrl`：标准化主页地址
- `resolverSummary`：仅供 HotNow 内部审计记录使用，不在 UI 主展示中暴露

#### 失败响应

```json
{
  "ok": false,
  "reason": "not_found"
}
```

允许的 `reason`：

- `not_found`
- `invalid_article_url`
- `resolver_unavailable`
- `rate_limited`
- `timeout`

HotNow 本地只做 reason 翻译，不感知具体 provider。

## 6. Relay 内部策略

### 6.1 Provider Registry

relay 内部维护 provider 列表与顺序，例如：

1. `wechat2rss-article`
2. `wechat2rss-name-search`
3. `rsshub-wechat-fallback`

注意：

- provider 名称和具体顺序属于 relay 内部实现，不对用户暴露
- HotNow 本地不依赖 provider 名称或数量
- provider 只是 relay 内部的可替换实现细节

### 6.2 Fallback 顺序

#### 有文章链接时

1. 先走 `articleUrl` 路径
2. 失败再尝试名称辅助路径
3. 仍失败再尝试后续 provider

#### 只有公众号名称时

1. 先走名称检索 provider
2. 没找到则 fallback 到下一个名称索引 provider
3. 全部失败时返回 `not_found`

### 6.3 缓存策略

relay 至少应有以下缓存：

- `articleUrl -> rssUrl`
  - 长缓存
- `wechatName -> rssUrl`
  - 中缓存
- `失败结果`
  - 短缓存，避免短时间内重复击穿 provider

原则：

- 首次冷启动解析可能较慢
- 一旦解析成功，后续相同输入应优先命中缓存
- HotNow 采集阶段不再调用 resolver，因此缓存压力主要来自新增 / 编辑来源

### 6.4 超时、限频、熔断

每个 provider 至少具备：

- 单 provider 请求超时
- provider 级限频
- 连续失败熔断
- 熔断后冷却恢复

这样做的目的：

- 某个公共服务变慢时，不拖垮整次解析
- 某个 provider 出现异常时，不被高频重试打爆
- provider 失败不应直接扩散成用户感知的长时间卡顿

## 7. HotNow 本地改造方向

### 7.1 代码边界

HotNow 本地后续应改成：

- `resolveSourceUserInput(...)`
  - RSS：本地读取 feed 元数据
  - 微信公众号：调用 relay client

逐步退出本地对外部 bridge/provider 的直接调用：

- `src/core/wechat/wechatBridgeProviders.ts`
- `src/core/wechat/registerWechatBridgeSource.ts`

这些模块后续应收口为：

- `resolver client`
- `resolver response normalization`

而不是继续持有第三方 provider 访问逻辑。

### 7.2 存储策略

HotNow 最终保存到 `content_sources` 的仍然是：

- `kind`
- `name`
- `site_url`
- `rss_url`
- `source_type = wechat_bridge`
- 必要的 `bridge/resolver audit json`

注意：

- 后续采集不再重新走 resolver
- resolver 只影响新增/编辑来源
- 一旦 `rss_url` 解析成功，公众号来源就和普通 RSS 来源一样进入采集主链路

## 8. 错误提示口径

HotNow UI 不再暴露实现细节，只保留业务提示：

- `没有找到这个公众号的可用来源`
- `这篇文章暂时无法生成订阅源`
- `公众号解析服务当前不可用，请稍后再试`
- `公众号解析请求过于频繁，请稍后再试`

不再对用户出现：

- bridge token
- feed id
- provider 名称
- provider 失败细节

## 9. 安全与风险边界

### 9.1 本地 IP 风险

本方案能做到：

- HotNow 本地不直接访问公共 bridge/provider
- 用户当前网络出口不直接暴露给第三方 bridge/provider

本方案不能绝对保证：

- “永远不会被封”
- “任何 provider 永远可用”

准确说法应是：

- 风险从 HotNow 本地网络出口转移到 relay 侧
- 通过缓存、限频、超时和熔断显著降低外部 provider 风险

### 9.2 效率边界

效率主要由以下因素保证：

- 保存时解析，不在采集时解析
- 解析成功后只保存最终 `rssUrl`
- relay 缓存优先
- provider fallback 有超时与熔断

因此：

- 日常采集效率不会被公众号解析过程拖慢
- 新增来源效率主要取决于 relay 首次解析和缓存命中情况

## 10. 推荐实施顺序

### Phase 1

先改 HotNow 本地边界：

- 抽象 resolver client
- 让 HotNow 不再直连公共 bridge/provider
- 把现有公众号解析入口切到“只调用 resolver”

### Phase 2

实现真实远端 relay：

- provider registry
- fallback
- 缓存
- 限频
- 熔断

### Phase 3

把 HotNow 环境配置和文档切到 relay 语义：

- 移除 bridge 直连配置描述
- 增加 resolver 配置说明
- 同步 `/settings/sources` 的用户提示文案

## 11. 验收标准

设计完成后，后续实现应满足：

- 用户新增 RSS 时，只需要 `RSS URL`
- 用户新增公众号时，只需要 `公众号名称`，文章链接可选
- HotNow 本地不再直接访问公共 bridge/provider
- HotNow 只访问一个 relay
- relay 返回最终 `rssUrl` 后，HotNow 后续采集继续走现有 RSS 主链路
- 失败提示只保留业务语言，不暴露 provider/bridge 细节

