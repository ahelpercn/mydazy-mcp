#!/bin/bash
set -e

# mydazy-mcp 一键卸载脚本

PLUGIN_DIR="$HOME/.openclaw/extensions/mydazy-mcp"
CONFIG_FILE="$HOME/.openclaw/openclaw.json"

echo "==> 卸载 mydazy-mcp 插件"

# 1. 删除插件目录
if [ -d "$PLUGIN_DIR" ]; then
  rm -rf "$PLUGIN_DIR"
  echo "✅ 已删除插件目录"
else
  echo "⏭️  插件目录不存在，跳过"
fi

# 2. 从 openclaw.json 中移除配置
if [ -f "$CONFIG_FILE" ]; then
  echo "==> 清理 openclaw.json..."
  python3 - <<PYEOF
import json, os

cfg = os.path.expanduser("~/.openclaw/openclaw.json")

try:
    with open(cfg) as f:
        d = json.load(f)
except (FileNotFoundError, json.JSONDecodeError):
    print("⏭️  配置文件不存在或格式错误，跳过")
    exit(0)

plugins = d.get("plugins", {})
changed = False

# 移除 allow 列表中的 mydazy-mcp
allow = plugins.get("allow", [])
if "openclaw-mydazy-mcp" in allow:
    allow.remove("openclaw-mydazy-mcp")
    changed = True

# 移除 entries
entries = plugins.get("entries", {})
if "openclaw-mydazy-mcp" in entries:
    del entries["openclaw-mydazy-mcp"]
    changed = True

# 移除 installs
installs = plugins.get("installs", {})
if "openclaw-mydazy-mcp" in installs:
    del installs["openclaw-mydazy-mcp"]
    changed = True

# 移除 load.paths 中的路径
load = plugins.get("load", {})
paths = load.get("paths", [])
plugin_dir = os.path.expanduser("~/.openclaw/extensions/mydazy-mcp")
if plugin_dir in paths:
    paths.remove(plugin_dir)
    changed = True

if changed:
    with open(cfg, "w") as f:
        json.dump(d, f, indent=2, ensure_ascii=False)
    print("✅ 已清理 openclaw.json")
else:
    print("⏭️  配置中未找到 mydazy-mcp，跳过")
PYEOF
else
  echo "⏭️  配置文件不存在，跳过"
fi

echo ""
echo "✅ 卸载完成！"
echo ""
echo "请重启 Gateway 使更改生效："
echo "  openclaw gateway restart"
