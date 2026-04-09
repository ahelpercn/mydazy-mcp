#!/usr/bin/env node

/**
 * CLI entry point for mydazy-mcp plugin.
 *
 * - No args / "setup": run interactive setup wizard
 * - "status": show current config status
 *
 * When run without args, auto-detects if plugin is configured.
 * If not configured → launches setup wizard.
 * If already configured → shows status and how to reconfigure.
 *
 * Usage:
 *   openclaw-mydazy-mcp          # auto-detect: setup or status
 *   openclaw-mydazy-mcp setup    # force setup wizard
 *   openclaw-mydazy-mcp status   # show current config
 */

import { createInterface } from "node:readline/promises";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { stdin, stdout } from "node:process";
import { fileURLToPath } from "node:url";

const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";

const CONFIG_FILE = join(homedir(), ".openclaw", "openclaw.json");
const PLUGIN_ID = "openclaw-mydazy-mcp";

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

async function loadConfig() {
  try {
    const raw = await readFile(CONFIG_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function getPluginConfig(data) {
  return data?.plugins?.entries?.[PLUGIN_ID]?.config ?? null;
}

function isConfigured(cfg) {
  return cfg && cfg.mcpServerUrl && cfg.webhookUrl;
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

async function checkMcpConnection(url) {
  const { WebSocket } = await import("ws");
  return new Promise((resolve) => {
    const timeout = setTimeout(() => { ws.close(); resolve("超时"); }, 5000);
    const ws = new WebSocket(url);
    ws.on("open", () => { clearTimeout(timeout); ws.close(); resolve("正常"); });
    ws.on("error", (e) => { clearTimeout(timeout); resolve(e.message || "连接失败"); });
  });
}

async function showStatus(data) {
  const cfg = getPluginConfig(data);
  const entry = data?.plugins?.entries?.[PLUGIN_ID];

  // Read version from package.json (resolve symlinks to find the real location)
  let version = "";
  try {
    const { realpathSync } = await import("node:fs");
    const realScript = realpathSync(fileURLToPath(import.meta.url));
    const raw = await readFile(join(dirname(realScript), "..", "package.json"), "utf-8");
    version = ` v${JSON.parse(raw).version}`;
  } catch (e) { console.error("version read error:", e.message); }

  console.log(`\n${GREEN}${BOLD}🦞 mydazy-mcp${version}${RESET}\n`);

  if (!cfg || !isConfigured(cfg)) {
    console.log(`${RED}${BOLD}未配置${RESET} — 请运行 ${CYAN}openclaw-mydazy-mcp setup${RESET} 完成配置\n`);
    return;
  }

  const enabled = entry?.enabled ? `${GREEN}已启用${RESET}` : `${YELLOW}未启用${RESET}`;
  const mcpUrl = cfg.mcpServerUrl.length > 50
    ? cfg.mcpServerUrl.slice(0, 50) + "..."
    : cfg.mcpServerUrl;
  const webhookUrl = cfg.webhookUrl.length > 50
    ? cfg.webhookUrl.slice(0, 50) + "..."
    : cfg.webhookUrl;

  console.log(`${BOLD}状态：${RESET}    ${enabled}`);
  console.log(`${BOLD}MCP 地址：${RESET} ${DIM}${mcpUrl}${RESET}`);
  console.log(`${BOLD}Webhook：${RESET}  ${DIM}${webhookUrl}${RESET}`);

  // MCP 连接检测
  process.stdout.write(`${BOLD}MCP 连接：${RESET} 检测中...`);
  const connStatus = await checkMcpConnection(cfg.mcpServerUrl);
  const connLabel = connStatus === "正常"
    ? `${GREEN}${connStatus}${RESET}`
    : `${RED}${connStatus}${RESET}`;
  process.stdout.write(`\r${BOLD}MCP 连接：${RESET} ${connLabel}      \n`);

  // Check for updates (non-blocking, 3s timeout)
  const localVer = version.trim().replace(/^v/, "");
  if (localVer) {
    try {
      const resp = await fetch(
        `https://registry.npmjs.org/${PLUGIN_ID}/latest`,
        { signal: AbortSignal.timeout(3000) },
      );
      if (resp.ok) {
        const { version: latest } = await resp.json();
        const toN = (v) => v.split(".").map(Number);
        const [a, b, c] = toN(localVer);
        const [x, y, z] = toN(latest);
        const needsUpdate = x > a || (x === a && y > b) || (x === a && y === b && z > c);
        if (latest && needsUpdate) {
          console.log(
            `\n${YELLOW}${BOLD}⬆ 新版本 v${latest} 可用${RESET}（当前 v${localVer}）`,
          );
          console.log(`  ${CYAN}npm install -g ${PLUGIN_ID}@latest${RESET}`);
        }
      }
    } catch { /* network error — skip silently */ }
  }

  console.log(`\n${DIM}重新配置：openclaw-mydazy-mcp setup${RESET}`);
  console.log(`${DIM}配置文件：${CONFIG_FILE}${RESET}\n`);
}

// ---------------------------------------------------------------------------
// Setup wizard
// ---------------------------------------------------------------------------

async function runSetup() {
  console.log(`
${GREEN}${BOLD}🦞 mydazy-mcp 配置向导${RESET}
${DIM}连接 MyDazy 设备到 OpenClaw Agent${RESET}
`);

  const rl = createInterface({ input: stdin, output: stdout });

  try {
    // Step 1: Webhook URL
    console.log(`${CYAN}Step 1/3${RESET} — Webhook 地址`);
    console.log(`${DIM}打开 mydazy 小程序 → Bot 页面 → 复制 Webhook 地址${RESET}`);
    const webhookUrl = await askRequired(rl, "Webhook 地址 (https://...): ", (v) =>
      v.startsWith("https://") || v.startsWith("http://")
        ? null
        : "请输入有效的 HTTP 地址 (https://...)",
    );

    // Step 2: MCP Server URL
    console.log(`\n${CYAN}Step 2/3${RESET} — MCP 地址`);
    console.log(`${DIM}打开 mydazy 小程序 → 设备页面 → 复制 MCP 地址${RESET}`);
    const mcpServerUrl = await askRequired(rl, "MCP 地址 (wss://...): ", (v) =>
      v.startsWith("wss://") || v.startsWith("ws://")
        ? null
        : "请输入有效的 WebSocket 地址 (wss://...)",
    );

    // Step 3: Default Agent (optional)
    console.log(`\n${CYAN}Step 3/3${RESET} — 默认 Agent ${DIM}(可选)${RESET}`);
    console.log(`${DIM}执行任务的 OpenClaw Agent ID，默认 "main"${RESET}`);
    const defaultAgentInput = (await rl.question("Agent ID [main]: ")).trim();
    const defaultAgent = defaultAgentInput || undefined;

    rl.close();

    // Build config
    const pluginConfig = { mcpServerUrl, webhookUrl };
    if (defaultAgent) {
      pluginConfig.defaultAgent = defaultAgent;
    }

    // Write to openclaw.json
    console.log(`\n${CYAN}正在写入配置...${RESET}`);

    let data;
    try {
      const raw = await readFile(CONFIG_FILE, "utf-8");
      data = JSON.parse(raw);
    } catch {
      await mkdir(join(homedir(), ".openclaw"), { recursive: true });
      data = {};
    }

    const plugins = (data.plugins ??= {});
    const allow = (plugins.allow ??= []);
    const entries = (plugins.entries ??= {});

    if (!allow.includes(PLUGIN_ID)) {
      allow.push(PLUGIN_ID);
    }

    entries[PLUGIN_ID] = {
      enabled: true,
      config: pluginConfig,
    };

    await writeFile(CONFIG_FILE, JSON.stringify(data, null, 2) + "\n", "utf-8");

    console.log(`
${GREEN}${BOLD}✅ 配置完成！${RESET}

${BOLD}已写入：${RESET} ${DIM}${CONFIG_FILE}${RESET}
${BOLD}MCP 地址：${RESET} ${mcpServerUrl}
${BOLD}Webhook：${RESET} ${webhookUrl}${defaultAgent ? `\n${BOLD}Agent：${RESET}   ${defaultAgent}` : ""}
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

// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------

async function getLocalVersion() {
  try {
    const { realpathSync } = await import("node:fs");
    const realScript = realpathSync(fileURLToPath(import.meta.url));
    const raw = await readFile(join(dirname(realScript), "..", "package.json"), "utf-8");
    return JSON.parse(raw).version;
  } catch { return "unknown"; }
}

async function showVersion() {
  const ver = await getLocalVersion();
  console.log(`${PLUGIN_ID} v${ver}`);
}

// ---------------------------------------------------------------------------
// Upgrade
// ---------------------------------------------------------------------------

async function runUpgrade() {
  const localVer = await getLocalVersion();
  console.log(`\n${GREEN}${BOLD}🦞 mydazy-mcp 升级检查${RESET}\n`);
  console.log(`${BOLD}当前版本：${RESET} v${localVer}`);

  process.stdout.write(`${BOLD}最新版本：${RESET} 查询中...`);
  let latest;
  try {
    const resp = await fetch(
      `https://registry.npmjs.org/${PLUGIN_ID}/latest`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    latest = (await resp.json()).version;
  } catch (e) {
    process.stdout.write(`\r${BOLD}最新版本：${RESET} ${RED}查询失败 (${e.message})${RESET}\n`);
    return;
  }
  process.stdout.write(`\r${BOLD}最新版本：${RESET} v${latest}      \n`);

  // Compare semver: skip if local >= latest
  const toNum = (v) => v.split(".").map(Number);
  const [lMaj, lMin, lPat] = toNum(localVer);
  const [rMaj, rMin, rPat] = toNum(latest);
  const localNewer = lMaj > rMaj || (lMaj === rMaj && lMin > rMin) ||
    (lMaj === rMaj && lMin === rMin && lPat >= rPat);
  if (localNewer) {
    console.log(`\n${GREEN}✅ 已是最新版本${RESET}\n`);
    return;
  }

  console.log(`\n${YELLOW}${BOLD}⬆ 正在升级到 v${latest}...${RESET}\n`);
  const { execSync } = await import("node:child_process");
  try {
    execSync(`npm install -g ${PLUGIN_ID}@latest`, { stdio: "inherit" });
    console.log(`\n${GREEN}${BOLD}✅ 升级完成！${RESET} v${localVer} → v${latest}`);
    console.log(`${DIM}重启 Gateway 使新版生效：openclaw gateway restart${RESET}\n`);
  } catch {
    console.error(`\n${RED}❌ 升级失败，请手动执行：${RESET}`);
    console.error(`  ${CYAN}npm install -g ${PLUGIN_ID}@latest${RESET}\n`);
  }
}

// ---------------------------------------------------------------------------
// Uninstall
// ---------------------------------------------------------------------------

async function runUninstall() {
  console.log(`\n${GREEN}${BOLD}🦞 mydazy-mcp 卸载${RESET}\n`);

  const rl = createInterface({ input: stdin, output: stdout });
  const answer = await rl.question(`${YELLOW}确认卸载？配置文件会保留。(y/N): ${RESET}`);
  rl.close();

  if (answer.trim().toLowerCase() !== "y") {
    console.log(`${DIM}已取消${RESET}\n`);
    return;
  }

  const { execSync } = await import("node:child_process");
  try {
    execSync(`npm uninstall -g ${PLUGIN_ID}`, { stdio: "inherit" });
    console.log(`\n${GREEN}✅ 已卸载${RESET}`);
    console.log(`${DIM}配置保留在：${CONFIG_FILE}${RESET}`);
    console.log(`${DIM}重新安装：npm install -g ${PLUGIN_ID}${RESET}\n`);
  } catch {
    console.error(`\n${RED}❌ 卸载失败，请手动执行：${RESET}`);
    console.error(`  ${CYAN}npm uninstall -g ${PLUGIN_ID}${RESET}\n`);
  }
}

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

function showHelp() {
  console.log(`
${GREEN}${BOLD}🦞 mydazy-mcp${RESET} — MyDazy 设备 OpenClaw 插件

${BOLD}用法：${RESET}
  openclaw-mydazy-mcp                 自动检测：未配置→配置向导，已配置→状态
  openclaw-mydazy-mcp ${CYAN}setup${RESET}           运行配置向导
  openclaw-mydazy-mcp ${CYAN}status${RESET}          查看状态和连接检测
  openclaw-mydazy-mcp ${CYAN}upgrade${RESET}         检查并升级到最新版本
  openclaw-mydazy-mcp ${CYAN}uninstall${RESET}       卸载插件
  openclaw-mydazy-mcp ${CYAN}version${RESET}         显示版本号
  openclaw-mydazy-mcp ${CYAN}help${RESET}            显示此帮助
`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const cmd = process.argv[2];
const data = await loadConfig();

switch (cmd) {
  case "setup":
    await runSetup();
    break;
  case "status":
    await showStatus(data);
    break;
  case "upgrade":
  case "update":
    await runUpgrade();
    break;
  case "uninstall":
  case "remove":
    await runUninstall();
    break;
  case "version":
  case "-v":
  case "--version":
    await showVersion();
    break;
  case "help":
  case "-h":
  case "--help":
    showHelp();
    break;
  default:
    // Auto-detect: no config → setup, has config → status
    if (isConfigured(getPluginConfig(data))) {
      await showStatus(data);
    } else {
      console.log(`${YELLOW}${BOLD}检测到插件尚未配置，启动配置向导...${RESET}\n`);
      await runSetup();
    }
}
