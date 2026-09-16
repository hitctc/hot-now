import { existsSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/** 为当前 Node 进程注册应用内中文字体目录，确保 librsvg 在生产环境也能找到 CJK 字形。 */
const fontDir = path.join(process.cwd(), "src/server/public/fonts");
if (!process.env.FONTCONFIG_FILE && existsSync(path.join(fontDir, "NotoSansSC-Regular.otf"))) {
  const configPath = path.join(os.tmpdir(), `hot-now-fontconfig-${process.pid}.conf`);
  const escapedFontDir = fontDir.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  writeFileSync(
    configPath,
    `<?xml version="1.0"?>\n<!DOCTYPE fontconfig SYSTEM "fonts.dtd">\n<fontconfig>\n  <dir>${escapedFontDir}</dir>\n</fontconfig>\n`,
    "utf8",
  );
  process.env.FONTCONFIG_FILE = configPath;
}
