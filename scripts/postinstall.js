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

${CYAN}下一步，登录 mydazy 小程序获取配置信息：${RESET}

  1. 微信搜索「mydazy」小程序，登录您的账号
  2. 进入「设备」页面，获取 ${BOLD}MCP 地址${RESET}
  3. 进入「Bot」页面，获取 ${BOLD}Webhook 地址${RESET}

${CYAN}编辑 ~/.openclaw/openclaw.json，添加以下配置：${RESET}

  ${YELLOW}{
    "plugins": {
      "allow": ["mydazy-mcp"],
      "entries": {
        "mydazy-mcp": {
          "enabled": true,
          "config": {
            "mcpServerUrl": "填入设备页面的 MCP 地址",
            "webhookUrl": "填入 Bot 页面的 Webhook 地址"
          }
        }
      }
    }
  }${RESET}

${CYAN}配置完成后重启 Gateway：${RESET}
  openclaw gateway restart

${CYAN}重启后在 mydazy 小程序中查看连接状态${RESET}

${YELLOW}提示：触发词默认"小龙虾有结果了"，可通过 "triggerWord" 字段自定义${RESET}
`);
