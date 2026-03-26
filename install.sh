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

if "openclaw-mydazy-mcp" not in allow:
    allow.append("openclaw-mydazy-mcp")

if plugin_dir not in paths:
    paths.append(plugin_dir)

if "openclaw-mydazy-mcp" not in entries:
    entries["openclaw-mydazy-mcp"] = {
        "enabled": False,
        "config": {
            "mcpServerUrl": "",
            "webhookUrl": ""
        }
    }
    print("✅ 已添加插件配置（默认未启用，请运行 npx openclaw-mydazy-mcp setup 完成配置）")
else:
    print("✅ 插件配置已存在，跳过")

installs["openclaw-mydazy-mcp"] = {
    "source": "path",
    "spec": "openclaw-mydazy-mcp",
    "sourcePath": plugin_dir,
    "installPath": plugin_dir
}

with open(cfg, "w") as f:
    json.dump(d, f, indent=2, ensure_ascii=False)
PYEOF

echo ""
echo "✅ 安装完成！（插件默认未启用，不会影响 Gateway 运行）"
echo ""
echo "下一步，运行配置向导："
echo ""
echo "  npx openclaw-mydazy-mcp setup"
echo ""
echo "或者在 OpenClaw Dashboard 中配置 mydazy-mcp 插件参数。"
echo ""
echo "配置完成后重启 Gateway："
echo "  openclaw gateway restart"
