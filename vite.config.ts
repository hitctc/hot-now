import { existsSync } from "node:fs";
import vue from "@vitejs/plugin-vue";
import VueDevTools from "vite-plugin-vue-devtools";
import { defineConfig, type PluginOption, type UserConfig } from "vite";
import { CLIENT_ASSET_BASE } from "./src/client/appBases";

export const VSCODE_EDITOR_CANDIDATES = [
  "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"
] as const;

// 这层只负责给本地调试挑一个稳定可执行的编辑器入口；优先走 VSCode 真正的 CLI，避免被其他应用占掉 /usr/local/bin/code。
export function resolveClientDevtoolsEditor(fileExists: (path: string) => boolean = existsSync): string {
  return VSCODE_EDITOR_CANDIDATES.find((candidate) => fileExists(candidate)) ?? "code";
}

export const CLIENT_DEVTOOLS_EDITOR = resolveClientDevtoolsEditor();

// Vite 传进来的模块 ID 可能带平台分隔符，先统一成 POSIX 风格，后面的分组规则才不会漏判。
function normalizeModuleId(id: string): string {
  return id.replaceAll("\\", "/");
}

// 先把 Vue 运行时和 Ant Design Vue 生态拆开，避免它们继续跟业务入口滚成一个超大的主 chunk。
export function chunkClientDependency(id: string): string | undefined {
  const normalizedId = normalizeModuleId(id);

  if (!normalizedId.includes("/node_modules/")) {
    return undefined;
  }

  if (normalizedId.includes("/node_modules/vue/")
    || normalizedId.includes("/node_modules/vue-router/")) {
    return "vue-vendor";
  }

  if (normalizedId.includes("/node_modules/ant-design-vue/")
    || normalizedId.includes("/node_modules/@ant-design")
    || normalizedId.includes("/node_modules/@babel/runtime/")
    || normalizedId.includes("/node_modules/@ctrl/tinycolor/")
    || normalizedId.includes("/node_modules/async-validator/")
    || normalizedId.includes("/node_modules/dayjs/")
    || normalizedId.includes("/node_modules/rc-")) {
    return "antd-vendor";
  }

  return "vendor";
}

// 这个插件只服务本地调试；生产构建不需要注入 devtools 客户端代码。
// 开发机上可能同时装了多个编辑器，这里固定走 VSCode 的 code CLI，避免 Inspector 跳到别的应用。
function createClientPlugins(command: "serve" | "build"): PluginOption[] {
  return command === "serve"
    ? [VueDevTools({ launchEditor: CLIENT_DEVTOOLS_EDITOR }), vue()]
    : [vue()];
}

// 把配置工厂导出来，方便测试直接校验开发态和构建态的差异。
export function createClientViteConfig(options: { command: "serve" | "build" }): UserConfig {
  return {
    root: "src/client",
    base: CLIENT_ASSET_BASE,
    plugins: createClientPlugins(options.command),
    build: {
      outDir: "../../dist/client",
      emptyOutDir: true,
      // 路由和三方依赖已经按主职责拆开，剩下这块是共享 UI 运行时，这里把告警阈值放宽到当前项目接受的范围。
      chunkSizeWarningLimit: 2000,
      rollupOptions: {
        output: {
          manualChunks: chunkClientDependency
        }
      }
    },
    server: {
      host: "127.0.0.1",
      proxy: {
        "/api": {
          target: "http://127.0.0.1:3030",
          changeOrigin: true
        },
        "/actions": {
          target: "http://127.0.0.1:3030",
          changeOrigin: true
        },
        "/health": {
          target: "http://127.0.0.1:3030",
          changeOrigin: true
        },
        "/login": {
          target: "http://127.0.0.1:3030",
          changeOrigin: true
        },
        "/logout": {
          target: "http://127.0.0.1:3030",
          changeOrigin: true
        }
      }
    }
  };
}

export default defineConfig(({ command }) => createClientViteConfig({ command }));
