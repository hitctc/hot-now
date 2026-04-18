# HotNow 单机生产部署操作记录

## 1. 当前最终可用状态

当前线上已经收口成这套形态：

- 域名：`https://now.achuan.cc`
- 应用进程：`systemd` 托管 `hot-now`
- 反向代理：`nginx`
- 证书：现有 `*.achuan.cc` 通配符证书
- 部署方式：本地 `rsync` 上传源码，服务器本机构建，再重启服务

当前服务器路径约定：

- 代码目录：`/srv/hot-now/app`
- 数据目录：`/srv/hot-now/shared/data`
- 环境变量：`/srv/hot-now/shared/.env`

当前运行时不再依赖 `/srv/hot-now/app/data -> /srv/hot-now/shared/data` 的临时软链接，而是正式通过环境变量覆盖：

- `HOT_NOW_DATABASE_FILE=/srv/hot-now/shared/data/hot-now.sqlite`
- `HOT_NOW_REPORT_DATA_DIR=/srv/hot-now/shared/data/reports`

## 2. 第一次上线的真实操作顺序

### 2.1 服务器基础环境

先准备一台 Ubuntu ECS，并确认：

- 日常登录用户使用 `tctc`
- `tctc` 拥有 `sudo` 权限
- `tctc` 的 shell 为 `/bin/bash`
- `/home/tctc` 和 `~/.ssh/authorized_keys` 都已正常

安装并确认通过的运行时：

- `Node v22.22.2`
- `npm 10.9.7`
- `nginx 1.18.0`

### 2.2 固定目录

创建下面三个固定目录 / 文件：

- `/srv/hot-now/app`
- `/srv/hot-now/shared/data`
- `/srv/hot-now/shared/.env`

建议权限：

- `/srv/hot-now` 归 `tctc:tctc`
- `/srv/hot-now/shared` 为 `700`
- `/srv/hot-now/shared/.env` 为 `600`

### 2.3 生产 `.env`

生产 `.env` 必须单独维护，不通过发布脚本覆盖。

至少应包含：

- SMTP 相关变量
- `BASE_URL`
- `AUTH_USERNAME`
- `AUTH_PASSWORD`
- `SESSION_SECRET`
- `LLM_SETTINGS_MASTER_KEY`（可选）
- `HOT_NOW_DATABASE_FILE`
- `HOT_NOW_REPORT_DATA_DIR`

生产路径覆盖项建议固定为：

```bash
HOT_NOW_DATABASE_FILE=/srv/hot-now/shared/data/hot-now.sqlite
HOT_NOW_REPORT_DATA_DIR=/srv/hot-now/shared/data/reports
```

### 2.4 首次上传源码并构建

本地第一次上传源码采用 `rsync`，只同步代码目录，不碰 `shared`：

- 代码同步到 `/srv/hot-now/app`
- `data/`、`.env`、`.git`、`node_modules`、`dist` 都必须排除

服务器首次构建执行：

```bash
cd /srv/hot-now/app
npm ci
npm run build
```

如果这一步过不了，不要继续配 `systemd` / `nginx`。先把服务器的 Node 环境、原生依赖和构建链路打通。

### 2.5 systemd

最终采用的 `systemd` 约定是：

- 工作目录：`/srv/hot-now/app`
- 环境文件：`/srv/hot-now/shared/.env`
- 启动命令：`/usr/bin/node dist/server/main.js`

首次切 `systemd` 之前，建议先手工前台跑一次：

```bash
cd /srv/hot-now/app
set -a
source /srv/hot-now/shared/.env
set +a
node dist/server/main.js
```

然后在另一个终端验证：

```bash
curl -fsS http://127.0.0.1:3030/health
```

确认 `{"ok":true}` 后，再切到 `systemd`。

### 2.6 nginx

最终 `nginx` 的职责应保持很简单：

- `80`：HTTP 和重定向 HTTPS
- `443`：挂证书并反代到 `127.0.0.1:3030`

一个容易忽略的点是：**Ubuntu 默认站点要删掉**。

如果 `/etc/nginx/sites-enabled/default` 还在，容易让排障时出现“本机看起来正常，但实际命中了默认站点”的混乱情况。

## 3. 日常发版

仓库里现在已经提供一条本地发布脚本：

- `[scripts/deploy-prod.sh](/Users/tc-nihao/100-tc/700-code/100-center/hot-now/scripts/deploy-prod.sh)`

标准发布方式：

```bash
./scripts/deploy-prod.sh
```

前提是先在仓库根目录准备一个本地私有配置文件：

```bash
cp .deploy.local.env.example .deploy.local.env
```

然后把默认发布目标写进 `.deploy.local.env`。这个文件会被 `.gitignore` 忽略，不进入仓库，但脚本会自动读取它，所以日常发版可以真正收口成一条命令。

如果临时想切别的服务器，仍然可以在命令前显式传入 `HOT_NOW_DEPLOY_*` 覆盖本地默认值。

这条脚本会做这些事：

1. `rsync` 同步代码到 `/srv/hot-now/app`
2. 服务器执行 `npm ci`
3. 服务器执行 `npm run build`
4. `sudo systemctl restart hot-now`
5. 访问 `http://127.0.0.1:3030/health` 做健康检查

脚本明确不会碰：

- `/srv/hot-now/shared/data`
- `/srv/hot-now/shared/.env`

当前更推荐的最终收口方式是：为部署用户安装最小范围 sudoers 规则，让脚本直接走非交互 `sudo -n`。

推荐规则文件：

- `deploy/sudoers/hot-now-systemctl`

建议安装方式：

```bash
sudo cp deploy/sudoers/hot-now-systemctl /etc/sudoers.d/hot-now-systemctl
sudo chmod 440 /etc/sudoers.d/hot-now-systemctl
sudo visudo -cf /etc/sudoers.d/hot-now-systemctl
```

只放开：

- `/usr/bin/systemctl restart hot-now`
- `/usr/bin/systemctl status hot-now --no-pager`

不要给 `tctc` 全局免密 sudo。

### 3.1 首次正式发布时的实际现象

正式发布时出现过一次短暂现象：

- `systemctl status hot-now --no-pager` 已经显示 `active (running)`
- 但紧接着第一次 `curl http://127.0.0.1:3030/health` 报 `connection refused`
- 后续重试后成功返回 `{"ok":true}`

这不是故障，而是服务重启后的极短启动空窗。脚本里的重试已经把它兜住了。

## 4. 重点坑点记录

### 4.1 最大坑：阿里云 ECS“网络与安全组”没放行 80/443

这是这次最值钱的教训。

当时的迷惑现象是：

- DNS 看起来已经对了
- 服务器上的 `nginx` 本机访问正常
- `ufw` 已经放行 `80/443`
- `systemd` 正常
- 但外网访问 `http://now.achuan.cc` 仍然不通

最后查出来，真正阻塞点在阿里云控制台的：

- **网络与安全组**

入方向规则里一开始只有：

- `22` SSH
- `3389` RDP
- `ICMP`

没有：

- `TCP 80`
- `TCP 443`

正确做法是在对应安全组里新增两条入方向规则：

- `TCP 80`，来源 `0.0.0.0/0`
- `TCP 443`，来源 `0.0.0.0/0`

这件事很容易漏，因为很多人会先看：

- `nginx` 是否监听
- `ufw` 是否放行
- DNS 是否正确

但如果云侧安全组没开，公网请求根本到不了机器上的 nginx。

> [!warning]
> **本机 `ufw` 放行，不代表公网就能通。**
> 对阿里云 ECS 来说，还必须再通过“网络与安全组”的入方向规则。缺少 `80/443` 时，外部请求根本到不了服务器上的 nginx。

### 4.2 域名和本地代理造成的干扰项

这次还遇到了几层干扰项：

- 一开始误把域名写成了 `achuan.com`，后来才纠正为 `achuan.cc`
- 本地代理 / fake-ip 一度把 `now.achuan.cc` 解析到 `198.18.x.x`
- 域名体系里原本就有 `Lucky`、`*` 泛域名、旧入口和 `www.achuan.cc`

这些都显著增加了排障复杂度，但不是最终根因。

最后确认下来：

- `now.achuan.cc` 的显式 A 记录优先于 `*`
- 泛域名不是直接覆盖 `now` 的元凶
- 真正卡住公网访问的是 **阿里云安全组**

### 4.3 证书问题

一开始尝试过：

- `certbot --nginx`
- `certbot certonly --webroot`

为了配合 HTTP-01，还专门给 nginx 增加过：

- `/.well-known/acme-challenge/`

并创建：

- `/var/www/certbot/.well-known/acme-challenge`

手工验证 challenge 文件路径时，本机和公网都可以读到测试文件，但 Let’s Encrypt 实际校验仍持续返回 `403`。

当时已经能判断出：

- 继续硬磕 ACME HTTP-01 性价比很低
- 当前域名环境原本就复杂，已经混着 `Lucky`、泛域名和历史入口

所以最终没有继续把时间花在 Certbot 上，而是直接改用已经存在的 `*.achuan.cc` 通配符证书。

### 4.4 最终证书方案

最终做法是：

1. 使用已有的 `*.achuan.cc` 证书包
2. 上传到服务器
3. 放到固定目录：
   - `/etc/nginx/ssl/achuan/fullchain.pem`
   - `/etc/nginx/ssl/achuan/privkey.pem`
4. 在 nginx 的 `443` server block 上启用

这条路线的优点很现实：

- 不再依赖 ACME challenge
- 不再继续和现有复杂域名环境纠缠
- 复杂度最低
- 适合当前阶段“先稳定上线”的目标

## 5. 现在还留着的技术债

当前主线已经闭环，但仍有两个后续值得继续做的点：

### 5.1 部署脚本的 sudo 交互仍然存在

当前仓库里的部署脚本已经改成优先使用 `sudo -n`。如果服务器还没安装 sudoers 规则，脚本会直接失败并提示去安装 `deploy/sudoers/hot-now-systemctl`，而不是半路卡在密码提示上。

### 5.2 生产备份策略还没正式形成

当前数据库和 reports 已经都在 `/srv/hot-now/shared/data` 下，但还没有正式形成固定的服务器端备份策略。

后续至少应该补其中一种：

- 定时快照
- 手工备份脚本
- 云盘 / 云快照

## 6. 建议保留的排障顺序

以后如果再来一台类似服务器，建议严格按下面顺序排：

1. **先打通服务器内侧**
   - 代码能上传
   - `npm ci` / `npm run build` 能过
   - `systemd` 能启动
   - `/health` 正常
2. **再看 nginx**
   - 本机 `Host` 路由正确
   - 默认站点已去掉
3. **再看公网入口**
   - 先查云侧“网络与安全组”
   - 再查 DNS
   - 最后才是继续查 nginx 细节
4. **最后再做 HTTPS**
   - 如果已经有可用通配符证书，优先直接用
   - 不要在复杂域名环境里默认先硬磕自动签证书

这次最值钱的一条经验不是某条具体命令，而是：

> **当本机一切正常、外部还是不通时，优先查云厂商安全组，而不是继续在应用层和 nginx 里兜圈子。**
