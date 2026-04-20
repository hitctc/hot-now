import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadRootEnvFile } from "../../src/core/config/loadRootEnvFile";

describe("loadRootEnvFile", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();

      if (dir) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  function createTempEnvFile(contents: string): { cwd: string; envPath: string } {
    const cwd = mkdtempSync(path.join(os.tmpdir(), "hot-now-env-"));
    const envPath = path.join(cwd, ".env");
    tempDirs.push(cwd);
    writeFileSync(envPath, contents, "utf8");

    return { cwd, envPath };
  }

  it("loads missing keys from the root .env file", () => {
    const { cwd, envPath } = createTempEnvFile("AUTH_USERNAME=admin\nAUTH_PASSWORD=from-dot-env\n");
    const env: NodeJS.ProcessEnv = {};

    const result = loadRootEnvFile({ cwd, env });

    expect(result).toEqual({
      envPath,
      found: true,
      appliedCount: 2
    });
    expect(env.AUTH_USERNAME).toBe("admin");
    expect(env.AUTH_PASSWORD).toBe("from-dot-env");
  });

  it("does not override keys that are already exported", () => {
    const { cwd } = createTempEnvFile("AUTH_USERNAME=admin\nAUTH_PASSWORD=from-dot-env\n");
    const env: NodeJS.ProcessEnv = {
      AUTH_PASSWORD: "already-exported"
    };

    const result = loadRootEnvFile({ cwd, env });

    expect(result.found).toBe(true);
    expect(result.appliedCount).toBe(1);
    expect(env.AUTH_USERNAME).toBe("admin");
    expect(env.AUTH_PASSWORD).toBe("already-exported");
  });

  it("ignores comments, empty lines, invalid keys, and trims simple quoted values", () => {
    const { cwd } = createTempEnvFile(
      [
        "# comment",
        "",
        "INVALID-KEY=skip-me",
        "AUTH_USERNAME='quoted-admin'",
        'SESSION_SECRET="quoted-secret"',
        "AUTH_PASSWORD = spaced-password"
      ].join("\n")
    );
    const env: NodeJS.ProcessEnv = {};

    const result = loadRootEnvFile({ cwd, env });

    expect(result.found).toBe(true);
    expect(result.appliedCount).toBe(3);
    expect(env.AUTH_USERNAME).toBe("quoted-admin");
    expect(env.SESSION_SECRET).toBe("quoted-secret");
    expect(env.AUTH_PASSWORD).toBe("spaced-password");
    expect(env["INVALID-KEY"]).toBeUndefined();
  });
});
