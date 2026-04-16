# HotNow 单机生产部署 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `hot-now` 补齐第一版单机生产部署能力：显式支持生产数据路径覆盖，新增一条本地部署命令，并提供 `systemd`、`nginx` 与文档配套，保证代码目录、数据目录和生产 `.env` 的边界清晰。

**Architecture:** 保持现有 `Node + Fastify + SQLite + systemd + nginx` 单机架构不变，只增加最小运行时覆盖能力与部署脚本，不引入 Docker、CI/CD 或第二套复杂配置系统。部署链路固定为本地 `rsync` 上传源码到 `/srv/hot-now/app`，服务器本机构建并由 `systemd` 重启，运行数据与 `.env` 固定落在 `/srv/hot-now/shared/`。

**Tech Stack:** Node.js、TypeScript、Vitest、zsh/bash、systemd、nginx、rsync

---

## File Structure

- Modify: `src/core/config/loadRuntimeConfig.ts`
  负责增加生产环境数据库与报告目录的 env override，保持本地默认配置不变。
- Modify: `tests/config/loadRuntimeConfig.test.ts`
  负责覆盖新 env override 的正反向测试，保证路径解析不会回归。
- Create: `scripts/deploy-prod.sh`
  负责本地一键部署：参数校验、`rsync` 同步、远程构建、重启服务、健康检查。
- Create: `deploy/systemd/hot-now.service`
  提供生产 `systemd` 示例配置，固定工作目录和环境文件路径。
- Create: `deploy/nginx/hot-now.conf`
  提供生产 `nginx` 反向代理示例配置，固定代理到 `127.0.0.1:3030`。
- Modify: `README.md`
  补齐生产部署方式、部署目录约定、生产环境变量与发布命令说明。
- Modify: `.env.example`
  补充 `HOT_NOW_DATABASE_FILE` 与 `HOT_NOW_REPORT_DATA_DIR` 示例。
- Modify: `AGENTS.md`
  同步新的环境变量、部署入口与验证命令，保持仓库协作说明与实现一致。

## Task 1: 增加生产路径 env override

**Files:**
- Modify: `src/core/config/loadRuntimeConfig.ts`
- Test: `tests/config/loadRuntimeConfig.test.ts`

- [ ] **Step 1: 先在配置测试里写失败用例，锁定生产路径覆盖行为**

```ts
it("allows HOT_NOW_DATABASE_FILE and HOT_NOW_REPORT_DATA_DIR to override resolved runtime paths", async () => {
  const config = await loadRuntimeConfig({
    configPath: path.resolve("config/hot-now.config.json"),
    env: {
      ...baseEnv,
      HOT_NOW_DATABASE_FILE: "/srv/hot-now/shared/data/hot-now.sqlite",
      HOT_NOW_REPORT_DATA_DIR: "/srv/hot-now/shared/data/reports"
    }
  });

  expect(config.database.file).toBe("/srv/hot-now/shared/data/hot-now.sqlite");
  expect(config.report.dataDir).toBe("/srv/hot-now/shared/data/reports");
});

it("keeps config-file relative paths when HOT_NOW_* overrides are absent", async () => {
  const config = await loadRuntimeConfig({
    configPath: path.resolve("config/hot-now.config.json"),
    env: baseEnv
  });

  expect(config.database.file).toBe(path.resolve("data/hot-now.sqlite"));
  expect(config.report.dataDir).toBe(path.resolve("data/reports"));
});
```

- [ ] **Step 2: 运行配置测试，确认新用例先失败**

Run:

```bash
npm run test -- tests/config/loadRuntimeConfig.test.ts
```

Expected:

- 至少新增的 `HOT_NOW_*` override 用例失败
- 失败原因指向当前实现没有读取这两个环境变量

- [ ] **Step 3: 在运行时配置中实现最小覆盖逻辑**

```ts
export async function loadRuntimeConfig(options: Options = {}): Promise<RuntimeConfig> {
  // Runtime config is split between checked-in defaults and explicit env overrides so
  // production can move stateful files out of the code directory without forking config JSON.
  const env = options.env ?? process.env;
  const configPath = options.configPath ?? path.resolve("config/hot-now.config.json");
  const fileText = await readFile(configPath, "utf8");
  const fileConfig = parseRuntimeConfigFile(fileText);
  const reportDir = resolveReportDir(path.dirname(configPath), fileConfig.report.dataDir, env.HOT_NOW_REPORT_DATA_DIR);
  const databaseFile = resolveDatabaseFile(path.dirname(configPath), fileConfig.database.file, env.HOT_NOW_DATABASE_FILE);
  const smtpPort = parseSmtpPort(required(env.SMTP_PORT, "SMTP_PORT"));
  const smtpSecure = parseSmtpSecure(required(env.SMTP_SECURE, "SMTP_SECURE"));
  const wechatResolverBaseUrl = env.WECHAT_RESOLVER_BASE_URL?.trim();
  const wechatResolverToken = env.WECHAT_RESOLVER_TOKEN?.trim();

  return {
    ...fileConfig,
    database: {
      ...fileConfig.database,
      file: databaseFile
    },
    report: {
      ...fileConfig.report,
      dataDir: reportDir
    },
    // existing smtp/auth/llm/wechatResolver branches stay unchanged
  };
}

function resolveReportDir(configDir: string, configValue: string, overrideValue: string | undefined) {
  // Production deploys store reports outside /srv/hot-now/app, so explicit env overrides win.
  const trimmedOverride = overrideValue?.trim();

  if (trimmedOverride) {
    return path.resolve(trimmedOverride);
  }

  return path.resolve(configDir, configValue);
}

function resolveDatabaseFile(configDir: string, configValue: string, overrideValue: string | undefined) {
  // Production SQLite must live in /srv/hot-now/shared/data instead of the mutable code tree.
  const trimmedOverride = overrideValue?.trim();

  if (trimmedOverride) {
    return path.resolve(trimmedOverride);
  }

  return path.resolve(configDir, configValue);
}
```

- [ ] **Step 4: 补充边界测试，确认空字符串 override 不会把路径解析坏**

```ts
it("ignores blank HOT_NOW_* overrides and falls back to config paths", async () => {
  const config = await loadRuntimeConfig({
    configPath: path.resolve("config/hot-now.config.json"),
    env: {
      ...baseEnv,
      HOT_NOW_DATABASE_FILE: "   ",
      HOT_NOW_REPORT_DATA_DIR: ""
    }
  });

  expect(config.database.file).toBe(path.resolve("data/hot-now.sqlite"));
  expect(config.report.dataDir).toBe(path.resolve("data/reports"));
});
```

- [ ] **Step 5: 重新运行配置测试，确认全部通过**

Run:

```bash
npm run test -- tests/config/loadRuntimeConfig.test.ts
```

Expected:

- `loadRuntimeConfig` 相关测试全部通过

- [ ] **Step 6: 提交这一小步**

```bash
git add src/core/config/loadRuntimeConfig.ts tests/config/loadRuntimeConfig.test.ts
git commit -m "feat: 支持生产环境数据路径覆盖"
```

## Task 2: 新增 deploy 脚本与部署模板

**Files:**
- Create: `scripts/deploy-prod.sh`
- Create: `deploy/systemd/hot-now.service`
- Create: `deploy/nginx/hot-now.conf`

- [ ] **Step 1: 先写一个 deploy 脚本骨架，锁定参数和失败即停的行为**

```bash
#!/usr/bin/env bash
set -euo pipefail

# This script only updates /srv/hot-now/app and never touches shared data or shared env files.
DEPLOY_HOST="${HOT_NOW_DEPLOY_HOST:-}"
DEPLOY_USER="${HOT_NOW_DEPLOY_USER:-}"
DEPLOY_APP_DIR="${HOT_NOW_DEPLOY_APP_DIR:-/srv/hot-now/app}"
DEPLOY_SERVICE="${HOT_NOW_DEPLOY_SERVICE:-hot-now}"

if [[ -z "$DEPLOY_HOST" ]]; then
  echo "Missing required env: HOT_NOW_DEPLOY_HOST" >&2
  exit 1
fi

if [[ -z "$DEPLOY_USER" ]]; then
  echo "Missing required env: HOT_NOW_DEPLOY_USER" >&2
  exit 1
fi

echo "Deploy target: ${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_APP_DIR}"
```

- [ ] **Step 2: 先做脚本语法检查**

Run:

```bash
bash -n scripts/deploy-prod.sh
```

Expected:

- 无输出
- 退出码为 `0`

- [ ] **Step 3: 实现 `rsync` 上传和远程构建重启逻辑**

```bash
#!/usr/bin/env bash
set -euo pipefail

# Production deploy only updates code under /srv/hot-now/app. shared/data and shared/.env stay manual.
DEPLOY_HOST="${HOT_NOW_DEPLOY_HOST:-}"
DEPLOY_USER="${HOT_NOW_DEPLOY_USER:-}"
DEPLOY_APP_DIR="${HOT_NOW_DEPLOY_APP_DIR:-/srv/hot-now/app}"
DEPLOY_SERVICE="${HOT_NOW_DEPLOY_SERVICE:-hot-now}"
REMOTE_TARGET="${DEPLOY_USER}@${DEPLOY_HOST}"

if [[ -z "$DEPLOY_HOST" || -z "$DEPLOY_USER" ]]; then
  echo "Missing required HOT_NOW_DEPLOY_HOST or HOT_NOW_DEPLOY_USER" >&2
  exit 1
fi

rsync -az --delete \
  --exclude ".git" \
  --exclude "node_modules" \
  --exclude "dist" \
  --exclude "data" \
  --exclude ".env" \
  --exclude ".DS_Store" \
  ./ "${REMOTE_TARGET}:${DEPLOY_APP_DIR}/"

ssh "$REMOTE_TARGET" "
  set -euo pipefail
  cd '${DEPLOY_APP_DIR}'
  npm ci
  npm run build
  sudo systemctl restart '${DEPLOY_SERVICE}'
  sudo systemctl status '${DEPLOY_SERVICE}' --no-pager
  curl -fsS http://127.0.0.1:3030/health
"
```

- [ ] **Step 4: 补 deploy 模板文件，固定 `systemd` 与 `nginx` 的职责边界**

```ini
# deploy/systemd/hot-now.service
[Unit]
Description=HotNow app service
After=network.target

[Service]
Type=simple
WorkingDirectory=/srv/hot-now/app
EnvironmentFile=/srv/hot-now/shared/.env
ExecStart=/usr/bin/node dist/server/main.js
Restart=always
RestartSec=5
User=hotnow
Group=hotnow

[Install]
WantedBy=multi-user.target
```

```nginx
# deploy/nginx/hot-now.conf
server {
  listen 80;
  server_name example.com;

  location / {
    proxy_pass http://127.0.0.1:3030;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

- [ ] **Step 5: 用最小命令验证脚本和模板没有明显语法问题**

Run:

```bash
bash -n scripts/deploy-prod.sh
rg -n "/srv/hot-now/app|/srv/hot-now/shared/.env|127.0.0.1:3030" deploy/systemd/hot-now.service deploy/nginx/hot-now.conf
```

Expected:

- `bash -n` 成功
- 两个模板都包含约定好的部署路径和代理目标

- [ ] **Step 6: 提交这一小步**

```bash
git add scripts/deploy-prod.sh deploy/systemd/hot-now.service deploy/nginx/hot-now.conf
git commit -m "feat: 增加单机部署脚本与服务模板"
```

## Task 3: 补齐 README、环境示例与仓库协作文档

**Files:**
- Modify: `README.md`
- Modify: `.env.example`
- Modify: `AGENTS.md`

- [ ] **Step 1: 先在 `.env.example` 中加入新的生产路径变量示例**

```dotenv
SMTP_HOST=smtp.qq.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your_qq_mail@qq.com
SMTP_PASS=your_app_password
MAIL_TO=receiver@example.com
BASE_URL=http://127.0.0.1:3030
AUTH_USERNAME=replace_with_admin_username
AUTH_PASSWORD=replace_with_strong_password
SESSION_SECRET=replace_with_long_random_session_secret
LLM_SETTINGS_MASTER_KEY=replace_with_local_master_key
HOT_NOW_CLIENT_DEV_ORIGIN=http://127.0.0.1:35173
HOT_NOW_DATABASE_FILE=/srv/hot-now/shared/data/hot-now.sqlite
HOT_NOW_REPORT_DATA_DIR=/srv/hot-now/shared/data/reports
WECHAT_RESOLVER_BASE_URL=http://127.0.0.1:4040
WECHAT_RESOLVER_TOKEN=replace_with_internal_or_remote_resolver_token
```

- [ ] **Step 2: 在 README 中增加生产部署章节，明确首次上线与日常发布命令**

````md
## 单机生产部署

服务器目录固定为：

```bash
/srv/hot-now/app
/srv/hot-now/shared/data
/srv/hot-now/shared/.env
```

生产环境变量建议至少补充：

```bash
HOT_NOW_DATABASE_FILE=/srv/hot-now/shared/data/hot-now.sqlite
HOT_NOW_REPORT_DATA_DIR=/srv/hot-now/shared/data/reports
```

首次上线先在服务器手工执行：

```bash
cd /srv/hot-now/app
npm ci
npm run build
```

日常发布通过本地命令执行：

```bash
HOT_NOW_DEPLOY_HOST=your-server-ip \
HOT_NOW_DEPLOY_USER=hotnow \
./scripts/deploy-prod.sh
```
````

- [ ] **Step 3: 在 AGENTS.md 中同步新的环境变量与部署约定**

```md
当前关键环境变量新增：

- `HOT_NOW_DATABASE_FILE`
- `HOT_NOW_REPORT_DATA_DIR`

单机生产部署目录固定为：

- 代码：`/srv/hot-now/app`
- 数据：`/srv/hot-now/shared/data`
- 配置：`/srv/hot-now/shared/.env`

日常发布命令统一为本地 deploy 脚本；脚本只能更新 `app/`，不得覆盖 `shared/data` 和 `shared/.env`。
```

- [ ] **Step 4: 做一次文档一致性检查**

Run:

```bash
rg -n "HOT_NOW_DATABASE_FILE|HOT_NOW_REPORT_DATA_DIR|/srv/hot-now/app|deploy-prod.sh" README.md .env.example AGENTS.md
```

Expected:

- 三个文件都出现新环境变量或部署目录约定
- README、`.env.example`、`AGENTS.md` 之间没有冲突表述

- [ ] **Step 5: 提交这一小步**

```bash
git add README.md .env.example AGENTS.md
git commit -m "docs: 同步单机部署说明与环境变量"
```

## Task 4: 做最终验证并整理交付

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `src/core/config/loadRuntimeConfig.ts`
- Modify: `tests/config/loadRuntimeConfig.test.ts`
- Create/Modify: `scripts/deploy-prod.sh`
- Create/Modify: `deploy/systemd/hot-now.service`
- Create/Modify: `deploy/nginx/hot-now.conf`

- [ ] **Step 1: 跑最相关测试和静态检查，确认部署改动没有破坏现有配置加载**

Run:

```bash
npm run test -- tests/config/loadRuntimeConfig.test.ts
bash -n scripts/deploy-prod.sh
```

Expected:

- 配置测试通过
- deploy 脚本语法检查通过

- [ ] **Step 2: 再跑一次全量构建，确认新的运行时配置和文档没有引入构建回归**

Run:

```bash
npm run build
```

Expected:

- 构建通过
- `dist/server/main.js` 正常生成

- [ ] **Step 3: 检查工作区只包含本次部署实现相关改动**

Run:

```bash
git status --short
```

Expected:

- 只出现本计划涉及的配置、脚本、模板和文档文件

- [ ] **Step 4: 整理最终提交**

```bash
git add src/core/config/loadRuntimeConfig.ts \
  tests/config/loadRuntimeConfig.test.ts \
  scripts/deploy-prod.sh \
  deploy/systemd/hot-now.service \
  deploy/nginx/hot-now.conf \
  README.md \
  .env.example \
  AGENTS.md
git commit -m "feat: 增加 hot-now 单机部署能力"
```

- [ ] **Step 5: 交付时说明首次上线所需的手工动作**

```md
首次上线仍需手工完成：

1. 在服务器安装 Node、nginx、rsync 和构建依赖
2. 创建 `/srv/hot-now/app`、`/srv/hot-now/shared/data`、`/srv/hot-now/shared/.env`
3. 手工写生产 `.env`
4. 安装 `deploy/systemd/hot-now.service`
5. 安装 `deploy/nginx/hot-now.conf`
6. 配域名解析与 HTTPS
```
