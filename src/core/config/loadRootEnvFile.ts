import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

type LoadRootEnvFileOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  fileName?: string;
};

type LoadRootEnvFileResult = {
  envPath: string;
  found: boolean;
  appliedCount: number;
};

// 启动入口在本地开发时也直接补齐根目录 .env，避免绕过 dev.sh 后认证环境缺失。
export function loadRootEnvFile(options: LoadRootEnvFileOptions = {}): LoadRootEnvFileResult {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const envPath = path.join(cwd, options.fileName ?? ".env");

  if (!existsSync(envPath)) {
    return {
      envPath,
      found: false,
      appliedCount: 0
    };
  }

  const rawText = readFileSync(envPath, "utf8");
  let appliedCount = 0;

  for (const line of rawText.split(/\r?\n/u)) {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmedLine.indexOf("=");

    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmedLine.slice(0, separatorIndex).trim();

    if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(key) || env[key] !== undefined) {
      continue;
    }

    let value = trimmedLine.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value;
    appliedCount += 1;
  }

  return {
    envPath,
    found: true,
    appliedCount
  };
}
