#!/usr/bin/env node

/**
 * Interactive CLI setup for mydazy-mcp plugin.
 * Usage: npx openclaw-mydazy-mcp setup
 */

import { createInterface } from "node:readline/promises";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { stdin, stdout } from "node:process";

const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";

const CONFIG_FILE = join(homedir(), ".openclaw", "openclaw.json");

async function main() {
  console.log(`
${GREEN}${BOLD}🦞 mydazy-mcp 配置向导${RESET}
${DIM}连接 MyDazy 设备到 OpenClaw Agent${RESET}
`);

  const rl = createInterface({ input: stdin, output: stdout });

  try {
    // Step 1: MCP Server URL
    console.log(`${CYAN}Step 1/3${RESET} — MCP 地址`);
    console.log(`${DIM}打开 mydazy 小程序 → 设备页面 → 复制 MCP 地址${RESET}`);
    const mcpServerUrl = await askRequired(rl, "MCP 地址 (wss://...): ", (v) =>
      v.startsWith("wss://") || v.startsWith("ws://")
        ? null
        : "请输入有效的 WebSocket 地址 (wss://...)",
    );

    // Step 2: Webhook URL
    console.log(`\n${CYAN}Step 2/3${RESET} — Webhook 地址`);
    console.log(`${DIM}打开 mydazy 小程序 → Bot 页面 → 复制 Webhook 地址${RESET}`);
    const webhookUrl = await askRequired(rl, "Webhook 地址 (https://...): ", (v) =>
      v.startsWith("https://") || v.startsWith("http://")
        ? null
        : "请输入有效的 HTTP 地址 (https://...)",
    );

    // Step 3: Optional trigger word
    console.log(`\n${CYAN}Step 3/3${RESET} — 播报触发词 ${DIM}(可选)${RESET}`);
    console.log(`${DIM}任务完成后推送到设备的触发词，默认"小龙虾有结果了"${RESET}`);
    const triggerWordInput = (await rl.question("触发词 [小龙虾有结果了]: ")).trim();
    const triggerWord = triggerWordInput || undefined;

    if (triggerWord && triggerWord.length > 10) {
      console.log(`${YELLOW}⚠️  触发词不能超过 10 个字，将使用默认值${RESET}`);
    }

    rl.close();

    // Build config
    const pluginConfig = {
      mcpServerUrl,
      webhookUrl,
    };
    if (triggerWord && triggerWord.length <= 10) {
      pluginConfig.triggerWord = triggerWord;
    }

    // Write to openclaw.json
    console.log(`\n${CYAN}正在写入配置...${RESET}`);

    let data;
    try {
      const raw = await readFile(CONFIG_FILE, "utf-8");
      data = JSON.parse(raw);
    } catch {
      // Config file doesn't exist yet — create structure
      await mkdir(join(homedir(), ".openclaw"), { recursive: true });
      data = {};
    }

    const plugins = (data.plugins ??= {});
    const allow = (plugins.allow ??= []);
    const entries = (plugins.entries ??= {});

    if (!allow.includes("openclaw-mydazy-mcp")) {
      allow.push("openclaw-mydazy-mcp");
    }

    entries["openclaw-mydazy-mcp"] = {
      enabled: true,
      config: pluginConfig,
    };

    await writeFile(CONFIG_FILE, JSON.stringify(data, null, 2) + "\n", "utf-8");

    console.log(`
${GREEN}${BOLD}✅ 配置完成！${RESET}

${BOLD}已写入：${RESET} ${DIM}${CONFIG_FILE}${RESET}
${BOLD}MCP 地址：${RESET} ${mcpServerUrl}
${BOLD}Webhook：${RESET} ${webhookUrl}${triggerWord ? `\n${BOLD}触发词：${RESET} ${triggerWord}` : ""}
${BOLD}已启用：${RESET} ${GREEN}是${RESET}

${CYAN}重启 Gateway 使配置生效：${RESET}
  openclaw gateway restart

${DIM}也可以在 OpenClaw Dashboard 中随时修改配置${RESET}
`);
  } catch (err) {
    rl.close();
    if (err.code === "ERR_USE_AFTER_CLOSE") return; // Ctrl+C
    console.error(`${RED}❌ 错误：${err.message}${RESET}`);
    process.exit(1);
  }
}

async function askRequired(rl, prompt, validate) {
  while (true) {
    const answer = (await rl.question(prompt)).trim();
    if (!answer) {
      console.log(`${YELLOW}此项为必填${RESET}`);
      continue;
    }
    const error = validate?.(answer);
    if (error) {
      console.log(`${YELLOW}${error}${RESET}`);
      continue;
    }
    return answer;
  }
}

main();
