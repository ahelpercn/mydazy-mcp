#!/bin/bash
set -e

# mydazy-mcp 一键安装脚本
# 用法: bash install.sh

PLUGIN_DIR="$HOME/.openclaw/extensions/mydazy-mcp"
CONFIG_FILE="$HOME/.openclaw/openclaw.json"
REPO_URL="https://github.com/ahelpercn/mydazy-mcp.git"

echo "==> 安装 mydazy-mcp 插件"

# 1. 检查 openclaw
if ! command -v openclaw &>/dev/null; then
  echo "❌ 未找到 openclaw，请先安装: https://openclaw.ai"
  exit 1
fi

# 2. 克隆或更新插件目录
if [ -d "$PLUGIN_DIR/.git" ]; then
  echo "==> 更新插件..."
  git -C "$PLUGIN_DIR" pull --rebase
else
  echo "==> 克隆插件..."
  git clone "$REPO_URL" "$PLUGIN_DIR"
fi

# 3. 安装依赖
echo "==> 安装依赖..."
npm install --prefix "$PLUGIN_DIR" --omit=dev --silent

# 4. 更新 openclaw.json
echo "==> 配置 openclaw.json..."
python3 - <<PYEOF
import json, os, sys

cfg = os.path.expanduser("~/.openclaw/openclaw.json")
plugin_dir = os.path.expanduser("~/.openclaw/extensions/mydazy-mcp")

try:
    with open(cfg) as f:
        d = json.load(f)
except FileNotFoundError:
    print("❌ 未找到 openclaw.json，请先运行 openclaw setup")
    sys.exit(1)

plugins = d.setdefault("plugins", {})
allow = plugins.setdefault("allow", [])
load = plugins.setdefault("load", {})
paths = load.setdefault("paths", [])
entries = plugins.setdefault("entries", {})
installs = plugins.setdefault("installs", {})

if "mydazy-mcp" not in allow:
    allow.append("mydazy-mcp")

if plugin_dir not in paths:
    paths.append(plugin_dir)

if "mydazy-mcp" not in entries:
    entries["mydazy-mcp"] = {
        "enabled": True,
        "config": {
            "mcpServerUrl": "登录mydazy小程序 → 设备页面 → 获取MCP地址",
            "webhookUrl": "登录mydazy小程序 → Bot页面 → 获取Webhook地址",
            "triggerWord": "小龙虾有结果了",
            "defaultAgent": "main"
        }
    }
    print("✅ 已添加插件配置模板（请登录mydazy小程序获取MCP地址和Webhook地址）")
else:
    print("✅ 插件配置已存在，跳过")

installs["mydazy-mcp"] = {
    "source": "path",
    "spec": "mydazy-mcp",
    "sourcePath": plugin_dir,
    "installPath": plugin_dir
}

with open(cfg, "w") as f:
    json.dump(d, f, indent=2, ensure_ascii=False)
PYEOF

echo ""
echo "✅ 安装完成！"
echo ""
echo "下一步，登录 mydazy 小程序获取配置信息："
echo ""
echo "  1. 打开 mydazy 小程序，登录您的账号"
echo "  2. 进入「设备」页面，找到您的小智设备，获取 MCP 地址"
echo "  3. 进入「Bot」页面，获取 Webhook 地址"
echo ""
echo "然后编辑配置文件填入对应地址："
echo "  open ~/.openclaw/openclaw.json"
echo ""
echo "修改以下字段："
echo "  plugins.entries.mydazy-mcp.config.mcpServerUrl  → 设备页面获取的 MCP 地址"
echo "  plugins.entries.mydazy-mcp.config.webhookUrl   → Bot 页面获取的 Webhook 地址"
echo ""
echo "配置完成后重启 Gateway："
echo "  openclaw gateway restart"
echo ""
echo "重启后可在 mydazy 小程序中查看连接状态"
