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
            "mcpServerUrl": "wss://api.xiaozhi.me/mcp/?token=YOUR_XIAOZHI_TOKEN",
            "pushttsUrl": "https://www.mydazy.com/v1/ota/pushtts?token=YOUR_WEBHOOK_TOKEN",
            "defaultAgent": "main",
            "devices": [{
                "id": "xiaozhi-default",
                "webhookUrl": "https://www.mydazy.com/v1/ota/pushtts?token=YOUR_WEBHOOK_TOKEN",
                "triggerWord": "小龙虾有结果了",
                "enabled": True
            }]
        }
    }
    print("✅ 已添加插件配置模板（请填入您的 token）")
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
echo "下一步，编辑配置文件填入您的 token："
echo "  open ~/.openclaw/openclaw.json"
echo ""
echo "修改以下字段："
echo "  plugins.entries.mydazy-mcp.config.mcpServerUrl  → 小智 MCP WebSocket URL"
echo "  plugins.entries.mydazy-mcp.config.pushttsUrl    → mydazy PushTTS Webhook URL"
echo ""
echo "然后重启 Gateway："
echo "  openclaw gateway restart"
