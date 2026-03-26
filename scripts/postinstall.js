#!/usr/bin/env node

/**
 * Post-install script: prints configuration guide after npm install.
 */

const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";
const BOLD = "\x1b[1m";

console.log(`
${GREEN}${BOLD}✅ openclaw-mydazy-mcp 安装成功！${RESET}

${CYAN}插件默认未启用，不会影响 Gateway 运行。${RESET}

${BOLD}下一步：运行配置向导（推荐）${RESET}
  npx openclaw-mydazy-mcp setup

${DIM}按提示填入 MCP 地址和 Webhook 地址即可完成全部配置。${RESET}

${BOLD}其他配置方式：${RESET}
  • OpenClaw Dashboard → 插件 → mydazy-mcp
  • 手动编辑 openclaw.json：${RESET}
  ${YELLOW}{
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
  }${RESET}

${CYAN}配置完成后重启 Gateway：${RESET}
  openclaw gateway restart
`);
