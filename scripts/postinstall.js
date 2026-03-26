#!/usr/bin/env node

/**
 * Post-install script: auto-launch setup wizard when running in an
 * interactive terminal, otherwise print a guide.
 *
 * Uses process.stderr for all messages so npm doesn't swallow them
 * during global installs (npm suppresses stdout from postinstall).
 */

import { stdin, stderr } from "node:process";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";

/** Write to stderr so npm always shows the output */
const log = (msg) => stderr.write(msg + "\n");

log(`\n${GREEN}${BOLD}✅ openclaw-mydazy-mcp 安装成功！${RESET}`);
log(`${CYAN}插件默认未启用，不会影响 Gateway 运行。${RESET}\n`);

// Auto-launch setup wizard if running in an interactive terminal
if (stdin.isTTY && stderr.isTTY) {
  log(`${BOLD}检测到交互式终端，自动启动配置向导...${RESET}\n`);
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    execFileSync(process.execPath, [join(__dirname, "setup.js")], {
      stdio: "inherit",
    });
  } catch {
    log(`\n${DIM}配置向导已退出。稍后可手动运行：${RESET}`);
    log(`  npx openclaw-mydazy-mcp setup\n`);
  }
} else {
  log(`${BOLD}下一步：运行配置向导${RESET}`);
  log(`  npx openclaw-mydazy-mcp setup`);
  log(`\n${DIM}按提示填入 MCP 地址和 Webhook 地址即可完成全部配置。${RESET}`);
  log(`\n${BOLD}其他配置方式：${RESET}`);
  log(`  • OpenClaw Dashboard → 插件 → mydazy-mcp`);
  log(`  • 手动编辑 openclaw.json`);
  log(`\n${CYAN}配置完成后重启 Gateway：${RESET}`);
  log(`  openclaw gateway restart\n`);
}
