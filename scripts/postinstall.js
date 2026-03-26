#!/usr/bin/env node

/**
 * Post-install script: auto-launch setup wizard when running in an
 * interactive terminal, otherwise print a guide.
 */

import { stdin, stdout } from "node:process";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";

console.log(`\n${GREEN}${BOLD}✅ openclaw-mydazy-mcp 安装成功！${RESET}`);
console.log(`${CYAN}插件默认未启用，不会影响 Gateway 运行。${RESET}\n`);

// Auto-launch setup wizard if running in an interactive terminal
if (stdin.isTTY && stdout.isTTY) {
  console.log(`${BOLD}检测到交互式终端，自动启动配置向导...${RESET}\n`);
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    execFileSync(process.execPath, [join(__dirname, "setup.js")], {
      stdio: "inherit",
    });
  } catch {
    // User cancelled (Ctrl+C) or setup failed — fall through to manual guide
    console.log(`\n${DIM}配置向导已退出。稍后可手动运行：${RESET}`);
    console.log(`  npx openclaw-mydazy-mcp setup\n`);
  }
} else {
  console.log(`${BOLD}下一步：运行配置向导${RESET}`);
  console.log(`  npx openclaw-mydazy-mcp setup`);
  console.log(`\n${DIM}按提示填入 MCP 地址和 Webhook 地址即可完成全部配置。${RESET}`);
  console.log(`\n${BOLD}其他配置方式：${RESET}`);
  console.log(`  • OpenClaw Dashboard → 插件 → mydazy-mcp`);
  console.log(`  • 手动编辑 openclaw.json：`);
  console.log(`  ${YELLOW}{
    "plugins": {
      "entries": {
        "mydazy-mcp": {
          "enabled": true,
          "config": {
            "mcpServerUrl": "从 mydazy 小程序「设备」页面获取",
            "webhookUrl": "从 mydazy 小程序「Bot」页面获取"
          }
        }
      }
    }
  }${RESET}`);
  console.log(`\n${CYAN}配置完成后重启 Gateway：${RESET}`);
  console.log(`  openclaw gateway restart\n`);
}
