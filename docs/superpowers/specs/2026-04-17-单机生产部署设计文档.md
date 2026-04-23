# 2026-04-17 HotNow 单机生产部署设计

## 1. 背景

`hot-now` 当前已经具备完整的本地运行能力，但生产部署链路还没有收口成一套稳定、可重复的一键发布方案。

当前项目不是静态站点，而是一个长期运行的 Node 应用，具备这些部署特征：

- 服务端入口为 `node dist/server/main.js`
- 默认监听 `3030` 端口
- 包含登录态、API、页面渲染与定时任务
- 依赖本地 SQLite 和报告产物目录
- 启动时强依赖 `.env` 中的 SMTP、认证和基础 URL 配置

这意味着它不适合“手工上传 dist 文件后靠 Nginx 直接托管”的静态站部署方式，也不适合继续依赖开发机手动上传、手动启动、手动改映射的临时流程。

本轮目标是为 `hot-now` 定义一套第一版生产部署方案，满足下面这几个现实要求：

- 代码改完后，可通过一条本地命令把新版本部署到服务器
- 生产数据持久化保存在固定目录，发布时不会被覆盖
- 生产 `.env` 单独维护，发布时不会被覆盖
- 服务由系统进程托管，异常退出能自动拉起
- 外部通过域名访问，不直接暴露 Node 服务端口

## 2. 目标

### 2.1 核心目标

- 固定服务器目录结构：
  - 代码：`/srv/hot-now/app`
  - 数据：`/srv/hot-now/shared/data`
  - 配置：`/srv/hot-now/shared/.env`
- 发布方式固定为：
  - 本地执行部署脚本
  - 上传源码到服务器
  - 服务器本机构建
  - `systemd` 重启服务
- 运行时显式使用 `shared/data` 与 `shared/.env`
- 通过 `nginx + 域名` 对外提供访问入口

### 2.2 用户体验目标

- 日常发布尽量收口为一条命令
- 发布失败时立即停止，不掩盖错误
- 排障路径清晰：
  - 服务问题查 `systemd`
  - 域名与入口问题查 `nginx`
  - 发布问题查 deploy 脚本输出

### 2.3 非目标

本轮明确不做：

- Docker 化部署
- CI/CD 平台接管部署
- 蓝绿发布、灰度发布、自动回滚
- 多机部署、负载均衡
- 外置数据库
- 自动维护生产 `.env`
- 自动备份 `shared/data`

## 3. 方案对比与选择

### 3.1 方案 A：`rsync + systemd + nginx`

流程：

- 本地通过 `rsync` 同步源码到 `/srv/hot-now/app`
- 服务器执行 `npm ci && npm run build`
- 构建成功后由 `systemd` 重启服务
- `nginx` 反向代理到 `127.0.0.1:3030`

优点：

- 与项目当前 Node 单机架构最贴合
- 发布边界清晰，容易排错
- 不需要服务器持有仓库访问权限
- 对第一次做线上部署的场景最友好

缺点：

- 第一版没有自动回滚能力
- 需要明确 `rsync` 排除规则

### 3.2 方案 B：服务器 `git pull` 后构建

优点：

- 服务器上的代码来源更像传统部署
- 不需要本地直接同步文件

缺点：

- 服务器需要管理仓库访问权限
- 如果本地有未推送但已验证的改动，不方便直接部署
- 发布边界会受远程仓库状态影响

### 3.3 方案 C：Docker / Compose 部署

优点：

- 后续标准化程度更高
- 镜像边界明确

缺点：

- 当前会明显增加复杂度
- 需要同时处理镜像构建、卷挂载、原生依赖兼容、容器重启策略
- 对本轮“先稳定上线”目标来说收益不够高

### 3.4 最终选择

本轮采用 `方案 A`：

- `rsync + systemd + nginx`

原因：

- 这是当前复杂度最低、最贴合 `hot-now` 架构、最适合单机 ECS 的第一版方案
- 先把裸机部署链路跑通，再决定后续是否需要 Docker 化，比一开始就引入容器层更稳

## 4. 目录结构与运行边界

服务器目录固定为：

```bash
/srv/hot-now/
├── app/              # 当前部署代码
└── shared/
    ├── data/         # SQLite、report、recovery-backups 等持久化数据
    └── .env          # 生产环境变量
```

### 4.1 代码目录

- 路径固定：`/srv/hot-now/app`
- 目录结构尽量保持与本地仓库一致
- 每次发布时允许被覆盖更新

### 4.2 数据目录

- 路径固定：`/srv/hot-now/shared/data`
- 保存：
  - `hot-now.sqlite`
  - `reports/`
  - `recovery-backups/`
- 该目录不参与自动部署覆盖

### 4.3 配置文件

- 路径固定：`/srv/hot-now/shared/.env`
- 只允许单独维护
- 发布脚本绝不能覆盖该文件

## 5. 项目运行时约定

当前运行时配置在 [src/core/config/loadRuntimeConfig.ts](/Users/tc-nihao/100-tc/700-code/100-center/hot-now/src/core/config/loadRuntimeConfig.ts:1) 中，从 [config/hot-now.config.json](/Users/tc-nihao/100-tc/700-code/100-center/hot-now/config/hot-now.config.json:1) 读取默认值，再拼接环境变量。

为了让生产环境显式使用 `shared/data`，本轮只增加最小 env override 能力，不引入第二套复杂配置系统。

### 5.1 生产环境新增覆盖项

- `HOT_NOW_DATABASE_FILE=/srv/hot-now/shared/data/hot-now.sqlite`
- `HOT_NOW_REPORT_DATA_DIR=/srv/hot-now/shared/data/reports`

### 5.2 继续沿用的现有生产变量

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `MAIL_TO`
- `BASE_URL`
- `AUTH_USERNAME`
- `AUTH_PASSWORD`
- `SESSION_SECRET`
- 可选：`LLM_SETTINGS_MASTER_KEY`
- 可选：`WECHAT_RESOLVER_BASE_URL`
- 可选：`WECHAT_RESOLVER_TOKEN`

### 5.3 为什么不用软链接方案

本轮不采用：

- `/srv/hot-now/app/data -> /srv/hot-now/shared/data`

原因：

- 软链接虽然能绕开当前相对路径限制，但会把“生产真实数据路径”继续隐藏在部署细节里
- 直接通过 env override 显式声明生产数据库和报告目录，更清晰，也更利于后续排障

## 6. 职责边界

### 6.1 `systemd`

`systemd` 只负责托管应用进程：

- 指定工作目录为 `/srv/hot-now/app`
- 从 `/srv/hot-now/shared/.env` 读取生产变量
- 启动 `node dist/server/main.js`
- 进程退出后自动重启
- 提供统一状态与日志入口

`systemd` 不负责：

- 上传代码
- 构建代码
- 申请证书
- 管理域名
- 改写生产 `.env`

### 6.2 `nginx`

`nginx` 只负责对外流量入口：

- 监听 `80/443`
- 绑定域名
- 反向代理到 `127.0.0.1:3030`
- 后续承接 HTTPS

`nginx` 不负责：

- 启动 Node 进程
- 构建应用
- 管理 SQLite
- 管理部署流程

### 6.3 deploy 脚本

deploy 脚本只负责发布一次代码：

1. 校验部署参数
2. `rsync` 上传源码到 `/srv/hot-now/app`
3. 排除不该上传的文件
4. 在服务器执行 `npm ci && npm run build`
5. 重启 `hot-now`
6. 做最小健康检查

deploy 脚本不负责：

- 创建生产 `.env`
- 初始化 `nginx`
- 初始化 `systemd`
- 备份 `shared/data`
- 自动回滚

## 7. 首次上线顺序

### 7.1 服务器准备

在服务器安装：

- Node LTS
- npm
- nginx
- rsync
- 构建原生依赖需要的基础工具

目标是让服务器本机具备执行 `npm ci` 和 `npm run build` 的能力。

### 7.2 创建目录与权限

创建：

- `/srv/hot-now/app`
- `/srv/hot-now/shared/data`
- `/srv/hot-now/shared/.env`

部署用户应具备：

- 写入 `/srv/hot-now/app`
- 执行服务重启

部署用户不应默认拥有：

- 随意覆盖 `shared/data`
- 随意覆盖 `shared/.env`

### 7.3 手工写生产 `.env`

首次上线由人工写入 `/srv/hot-now/shared/.env`，至少包含：

- 现有 SMTP 与认证变量
- `HOT_NOW_DATABASE_FILE`
- `HOT_NOW_REPORT_DATA_DIR`

### 7.4 手工构建与本机验证

首次上线先手工跑通一遍：

```bash
cd /srv/hot-now/app
npm ci
npm run build
```

然后确认服务能在本机正常启动，并验证：

```bash
curl -fsS http://127.0.0.1:3030/health
```

### 7.5 配 `systemd`

新增服务：

- `/etc/systemd/system/hot-now.service`

关键职责：

- `WorkingDirectory=/srv/hot-now/app`
- `EnvironmentFile=/srv/hot-now/shared/.env`
- 启动命令为 `node dist/server/main.js`
- 开机自动启动
- 异常自动重启

### 7.6 配 `nginx` 与域名

先通：

- `80 -> nginx -> 127.0.0.1:3030`

确认域名访问正常后，再补 HTTPS。

## 8. 日常发布顺序

日常发布统一收口为：

1. 本地做最小验证
2. 执行 `./scripts/deploy-prod.sh`
3. `rsync` 上传源码到 `/srv/hot-now/app`
4. 服务器执行 `npm ci && npm run build`
5. 构建成功后重启 `systemd`
6. 执行健康检查

### 8.1 本地最小验证

发布前至少应完成最相关测试或构建检查，避免把明显坏版本直接部署到服务器。

### 8.2 `rsync` 排除规则

部署脚本必须排除：

- `.git`
- `node_modules`
- `dist`
- `data`
- `.env`
- 本地临时文件

关键约束：

- 目标目录只能是 `/srv/hot-now/app`
- 不能把同步目标写成 `/srv/hot-now/`
- 不能碰 `/srv/hot-now/shared/`

### 8.3 远程构建顺序

远程固定执行：

```bash
cd /srv/hot-now/app
npm ci
npm run build
```

只有构建成功，才允许继续执行服务重启。

### 8.4 发布后检查

发布完成后至少执行：

```bash
systemctl restart hot-now
systemctl status hot-now --no-pager
curl -fsS http://127.0.0.1:3030/health
```

如有异常，再查：

```bash
journalctl -u hot-now -n 100 --no-pager
```

## 9. deploy 脚本输入约定

第一版 deploy 脚本建议只接收最小参数集合：

- `HOT_NOW_DEPLOY_HOST`
- `HOT_NOW_DEPLOY_USER`
- `HOT_NOW_DEPLOY_APP_DIR`，默认 `/srv/hot-now/app`
- `HOT_NOW_DEPLOY_SERVICE`，默认 `hot-now`

推荐使用方式：

```bash
HOT_NOW_DEPLOY_HOST=your-server-ip \
HOT_NOW_DEPLOY_USER=deployer \
./scripts/deploy-prod.sh
```

不建议第一版加入：

- 多环境名
- 发布槽位
- 多实例发布目标
- 自动回滚版本号

## 10. 风险与限制

### 10.1 单实例限制

当前架构基于：

- SQLite
- 本地文件报告目录
- 单进程定时任务

因此第一版默认只能有一个正式实例在跑，不支持多实例并行。

### 10.2 定时任务会随服务一起启动

只要正式服务启动：

- 采集任务
- 发信任务

都会按当前配置生效。

因此首次上线前，应确认：

- SMTP 配置可接受
- 采集节奏可接受
- `BASE_URL` 与域名语义一致

### 10.3 `.env` 与代码发布是两条线

后续改代码：

- 走 deploy 脚本

后续改生产配置：

- 手工修改 `/srv/hot-now/shared/.env`
- 单独重启服务

两者不应混成同一次自动化覆盖动作。

### 10.4 第一版不含自动备份

发布脚本不碰 `shared/data`，但也不会自动保护它。

因此后续应补一条独立的数据库与报告目录备份策略，但不纳入本轮部署实现范围。

## 11. 验收标准

本设计成立的标准是：

- 服务器目录结构固定且职责清晰
- 生产数据独立于代码目录持久化
- 生产 `.env` 独立于代码发布维护
- deploy 脚本不会覆盖 `shared/data` 和 `.env`
- 服务由 `systemd` 稳定托管
- 域名通过 `nginx` 反向代理访问应用
- 日常发布可收口为一条本地命令

## 12. 对实现范围的直接约束

本设计落地时，代码侧的最小实现应只包含：

- `loadRuntimeConfig` 增加生产路径 env override
- 新增 deploy 脚本
- 新增 `systemd` 示例配置
- 新增 `nginx` 示例配置
- 新增最相关文档

不应顺手扩展为：

- Docker 化改造
- 大规模配置系统重构
- 调度系统重构
- 数据库替换
- 发布平台建设
