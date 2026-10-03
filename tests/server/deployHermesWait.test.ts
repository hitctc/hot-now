import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

/** 在无配置临时目录执行真实部署脚本；SSH、构建、同步和等待全部用记录型替身，绝不触达服务器。 */
function runDeploy(states: unknown[], flag?: string) {
  const root = mkdtempSync(path.join(os.tmpdir(), "hotnow-deploy-wait-test-"));
  const scripts = path.join(root, "scripts");
  const bin = path.join(root, "bin");
  mkdirSync(scripts); mkdirSync(bin);
  for (const name of ["deploy-prod.sh", "hermes-preflight.mjs", "deploy-db-preflight.mjs"]) copyFileSync(path.resolve("scripts", name), path.join(scripts, name));
  const log = path.join(root, "calls.txt");
  writeFileSync(log, "");
  const shim = `#!/usr/bin/env node
const fs = require('node:fs'); const path = require('node:path');
const name = path.basename(process.argv[1]); const command = process.argv.slice(2).join(' ');
const previous = fs.readFileSync(process.env.DEPLOY_TEST_LOG, 'utf8').split('\\n').filter(Boolean);
let call = name;
if (name === 'ssh') {
  if (command.includes('systemd-run')) {
    const states = JSON.parse(process.env.DEPLOY_TEST_STATES);
    const index = previous.filter(value => value === 'check').length;
    console.log(JSON.stringify(states[Math.min(index, states.length - 1)])); call = 'check';
  } else if (command.includes('systemctl stop')) call = 'stop';
  else if (command.includes('npm ci')) call = 'install';
  else if (command.includes('systemctl restart')) call = 'restart';
  else call = 'snapshot';
}
fs.appendFileSync(process.env.DEPLOY_TEST_LOG, call + '\\n');
`;
  for (const name of ["ssh", "npm", "rsync", "sleep"]) writeFileSync(path.join(bin, name), shim, { mode: 0o755 });
  const result = spawnSync("/bin/bash", [path.join(scripts, "deploy-prod.sh"), ...(flag ? [flag] : [])], {
    cwd: root, encoding: "utf8", timeout: 10_000,
    env: { PATH: [bin, path.dirname(process.execPath), "/usr/bin", "/bin"].join(":"), HOME: root,
      HOT_NOW_DEPLOY_HOST: "fixture.invalid", HOT_NOW_DEPLOY_USER: "fixture",
      DEPLOY_TEST_LOG: log, DEPLOY_TEST_STATES: JSON.stringify(states) },
  });
  return { status: result.status, calls: readFileSync(log, "utf8").split("\n").filter(Boolean) };
}

describe("deploy Hermes pre-stop wait", () => {
  it("waits for natural idle after syncing but before any service stop", () => {
    const result = runDeploy([{ active: true, queueLength: 0 }, { active: false, queueLength: 0 }], "--wait-hermes");
    expect(result.status).toBe(0);
    expect(result.calls).toEqual(["npm", "snapshot", "rsync", "check", "sleep", "check", "stop", "install", "restart"]);
  });
  it("fails on unknown activity without stopping or restarting a service", () => {
    const result = runDeploy([{ active: "unknown", queueLength: 0 }], "--wait-hermes");
    expect(result.status).not.toBe(0);
    expect(result.calls).toEqual(["npm", "snapshot", "rsync", "check"]);
  });
  it("keeps the ordinary deployment path unchanged", () => {
    const result = runDeploy([]);
    expect(result.status).toBe(0);
    expect(result.calls).toEqual(["npm", "snapshot", "rsync", "stop", "install", "restart"]);
  });
});
