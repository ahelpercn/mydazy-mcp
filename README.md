# openclaw-mydazy-mcp

将 [OpenClaw](https://openclaw.ai) 智能体与 **小智（xiaozhi-esp32）** 语音设备打通：

- 唤醒设备，语音下达任务 → OpenClaw 后台执行 → 完成后自动播报结果
- 支持查日历、发消息、写代码等任意 OpenClaw Agent 能力

---

## 效果演示

1. 唤醒小智设备，说 **"小龙虾帮我看看今天有什么日程"**
2. 设备回复："好的，小龙虾收到了"
3. OpenClaw 在后台执行任务
4. 完成后设备自动播报结果摘要

---

## 前置条件

| 项目 | 要求 |
|------|------|
| OpenClaw | `>= 2026.3`（[安装教程](https://openclaw.ai/install)） |
| Node.js | `>= 22` |
| 小智设备 | xiaozhi-esp32，固件支持 MCP |
| 小智账号 | [xiaozhi.me](https://xiaozhi.me) 注册，创建 MCP endpoint 获取 token |
| mydazy 账号 | [mydazy.com](https://www.mydazy.com) 注册，获取 PushTTS Webhook URL |

---

## 安装

### 方式一：一键安装脚本（推荐）

```bash
curl -fsSL https://raw.githubusercontent.com/ahelpercn/mydazy-mcp/main/install.sh | bash
```

或下载后运行：

```bash
git clone https://github.com/ahelpercn/mydazy-mcp.git
bash mydazy-mcp/install.sh
```

### 方式二：手动安装

```bash
# 1. 克隆到 openclaw 扩展目录
git clone https://github.com/ahelpercn/mydazy-mcp.git ~/.openclaw/extensions/mydazy-mcp

# 2. 安装依赖
npm install --prefix ~/.openclaw/extensions/mydazy-mcp --omit=dev

# 3. 编辑 ~/.openclaw/openclaw.json，加入以下配置：
```

```jsonc
{
  "plugins": {
    "allow": ["mydazy-mcp"],
    "load": {
      "paths": ["~/.openclaw/extensions/mydazy-mcp"]
    },
    "entries": {
      "mydazy-mcp": {
        "enabled": true,
        "config": {
          "mcpServerUrl": "wss://api.xiaozhi.me/mcp/?token=YOUR_XIAOZHI_TOKEN",
          "pushttsUrl": "https://www.mydazy.com/v1/ota/pushtts?token=YOUR_WEBHOOK_TOKEN",
          "defaultAgent": "main",
          "devices": [
            {
              "id": "xiaozhi-default",
              "webhookUrl": "https://www.mydazy.com/v1/ota/pushtts?token=YOUR_WEBHOOK_TOKEN",
              "triggerWord": "小龙虾有结果了",
              "enabled": true
            }
          ]
        }
      }
    }
  }
}
```

```bash
# 4. 重启 Gateway
openclaw gateway restart
```

---

## 获取 Token

### 小智 MCP WebSocket URL

1. 登录 [xiaozhi.me](https://xiaozhi.me) → 智能体管理 → 目标智能体
2. **MCP 服务器** → **添加 MCP Server** → 选择 WebSocket 连接
3. 复制 URL（格式：`wss://api.xiaozhi.me/mcp/?token=eyJ...`）

### mydazy PushTTS Webhook URL

1. 登录 [mydazy.com](https://www.mydazy.com) → 控制台 → Webhook 设置
2. 复制 PushTTS URL（格式：`https://www.mydazy.com/v1/ota/pushtts?token=whk_...`）

---

## 小智设备系统提示词

在小智 App → 智能体设置 → 系统提示词中粘贴（见 [docs/xiaozhi-system-prompt.md](docs/xiaozhi-system-prompt.md)）：

```
你是一个语音助手，同时接入了"小龙虾"AI任务系统（MCP工具）。

当用户语音中出现以下任意词汇开头时，立即调用 send_task 工具：
正确写法：小龙虾
ASR 常见误识别：小笼虾、小笼下、小龙侠、晓龙虾 等

触发后：
1. 提取前缀后面的完整指令作为 prompt
2. 调用 send_task 提交任务
3. 立即简短回复用户（如"好的，小龙虾收到了"）
4. 听到推送词"小龙虾有结果了"时，调用 get_results 获取并朗读结果
```

---

## 配置项

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `mcpServerUrl` | string | 必填 | 小智 MCP relay WebSocket URL |
| `pushttsUrl` | string | 必填 | mydazy PushTTS Webhook URL |
| `defaultAgent` | string | `"main"` | 默认路由的 OpenClaw agent ID |
| `devices[].id` | string | 必填 | 设备唯一标识 |
| `devices[].webhookUrl` | string | 必填 | 该设备的 PushTTS URL |
| `devices[].triggerWord` | string | `"小龙虾有结果了"` | 播报触发词（≤10 字） |
| `devices[].enabled` | boolean | `true` | 是否启用 |
| `taskTimeoutMs` | number | `120000` | agent 任务超时（毫秒） |
| `maxQueueSize` | number | `50` | 每设备最大队列长度 |
| `reconnectDelayMs` | number | `5000` | WebSocket 断线重连延迟（毫秒） |

---

## 验证连接

```bash
# 查看插件日志
tail -f /tmp/openclaw-gateway.log | grep mydazy

# 成功示例：
# [mydazy-mcp] MCP client started
# [mydazy-mcp] relay connected
# [mydazy-mcp] ← {"method":"tools/list",...}
```

---

## 常见问题

**设备没有收到推送？**
- 检查 `pushttsUrl` 是否正确（含 token）
- 查看日志：`grep mydazy /tmp/openclaw-gateway.log | tail -50`

**任务超时？**
- 默认 120 秒；调大 `taskTimeoutMs` 配置

**报错 "extension entry escapes package directory"？**
- 确认 `plugins.load.paths` 指向含 `index.ts` 的目录（非 `src/` 子目录）

---

## License

MIT
