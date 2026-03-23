# mydazy-mcp 安装教程

将 OpenClaw 智能体与小智（xiaozhi-esp32）语音设备打通，实现语音下达任务、完成后推送播报。

---

## 效果演示

1. 唤醒小智设备，说 **"小龙虾帮我看看今天有什么日程"**
2. 设备立即回复"好的，小龙虾收到了"
3. OpenClaw 在 Mac 上执行任务（查日历、写代码、发消息……）
4. 完成后设备自动播报结果

---

## 前置条件

| 项目         | 要求                                                     |
| ------------ | -------------------------------------------------------- |
| OpenClaw     | >= 2026.3                                                |
| Node.js      | >= 22                                                    |
| 小智设备     | xiaozhi-esp32，固件支持 MCP                              |
| mydazy 小程序 | 微信搜索「mydazy」小程序，注册登录 |

---

## 第一步：克隆并安装

```bash
git clone https://github.com/ahelpercn/openclaw.git
cd openclaw
pnpm install
```

> **提示**：如果你已有 OpenClaw 仓库，只需将 `extensions/mydazy-mcp` 目录复制到你的 `extensions/` 下，
> 并在根 `package.json` 的 workspaces 中加入该路径，然后重新 `pnpm install`。

---

## 第二步：获取配置信息

### 2.1 获取 MCP 地址

1. 微信搜索并打开 **mydazy 小程序**，登录您的账号
2. 进入「**设备**」页面，找到您的小智设备
3. 复制 **MCP 地址**

### 2.2 获取 Webhook 地址

1. 在 mydazy 小程序中进入「**Bot**」页面
2. 复制 **Webhook 地址**

---

## 第三步：配置 OpenClaw

编辑 `~/.openclaw/openclaw.json`，在 `plugins` 字段中加入以下内容：

```jsonc
{
  "plugins": {
    "allow": [
      // ... 其他已有插件
      "mydazy-mcp",
    ],
    "entries": {
      "mydazy-mcp": {
        "enabled": true,
        "config": {
          // 小程序「设备」页面获取的 MCP 地址（第 2.1 步复制）
          "mcpServerUrl": "登录mydazy小程序 → 设备页面 → 获取MCP地址",

          // 小程序「Bot」页面获取的 Webhook 地址（第 2.2 步复制）
          "webhookUrl": "登录mydazy小程序 → Bot页面 → 获取Webhook地址",

          // 以下为可选配置，有默认值，可省略
          // "triggerWord": "小龙虾有结果了",  // 播报触发词，可自定义（≤10 字）
          // "defaultAgent": "main",            // 默认调用的 Agent
        },
      },
    },
    "load": {
      "paths": [
        // 指向你克隆后的 mydazy-mcp 目录（绝对路径）
        "/path/to/openclaw/extensions/mydazy-mcp",
      ],
    },
  },
}
```

> **注意**：`plugins.load.paths` 需要改为你机器上的实际路径。

---

## 第四步：启动 Gateway

```bash
# 进入 openclaw 仓库根目录
cd /path/to/openclaw

# 启动（后台运行）
nohup pnpm openclaw gateway run > /tmp/openclaw-gateway.log 2>&1 &

# 验证连接（看到 relay connected 说明成功）
tail -f /tmp/openclaw-gateway.log
```

成功日志示例：

```
[mydazy-mcp] connecting to wss://...
[mydazy-mcp] relay connected
[mydazy-mcp] ← type=unknown {"jsonrpc":"2.0","method":"tools/list",...}
```

启动成功后，回到 **mydazy 小程序** 即可查看设备连接状态。

---

## 第五步：配置小智设备系统提示词

参见 [xiaozhi-system-prompt.md](./xiaozhi-system-prompt.md)，将内容粘贴到小智 App 的智能体系统提示词中。

核心要点：

- 说话包含"**小龙虾**"（或误识别的谐音：小笼虾、小龙侠等）时自动触发 `send_task`
- 听到"**小龙虾有结果了**"推送后，自动调用 `get_results` 朗读结果

---

## 可用 MCP 工具一览

| 工具名              | 触发场景              | 说明                                                         |
| ------------------- | --------------------- | ------------------------------------------------------------ |
| `send_task`         | 小龙虾 + 任何指令     | 提交 Agent 任务；10 秒内完成直接返回，否则后台执行完成后推送 |
| `get_results`       | 听到推送触发词        | 获取已完成任务结果并朗读                                     |
| `task_status`       | 查询任务进度          | 查询指定 taskId 的状态                                       |
| `list_agents`       | 有哪些助手            | 列出可用 Agent                                               |
| `push_notification` | 立即播报短消息        | 不创建 Agent 任务，直接推送 TTS                              |
| `mac_calendar`      | 今天有什么日程        | 读取 Mac 日历（默认今天）                                    |
| `mac_event_add`     | 帮我加个会议/日程     | 在 Mac 日历中添加事件                                        |
| `mac_open`          | 帮我打开某个网站/应用 | 打开 URL 或 Mac App                                          |
| `mac_browser_tab`   | 我现在浏览器在看什么  | 获取当前 Chrome/Safari 标签页                                |

---

## 常见问题

### Gateway 启动报 "extension entry escapes package directory"

说明某个插件的入口文件不存在。确认 `extensions/mydazy-mcp/index.ts` 存在（注意是根目录，不是 `src/` 下），
且 `plugins.load.paths` 中的路径指向正确目录（即包含 `index.ts` 的那一层）。

### 小智设备没有收到推送

1. 检查 `webhookUrl` 是否正确（从小程序 Bot 页面重新复制）
2. 查看 gateway 日志：`tail -50 /tmp/openclaw-gateway.log | grep mydazy`
3. 在 mydazy 小程序中查看设备连接状态是否正常

### Mac 日历/浏览器工具返回错误

这些工具依赖 macOS 权限：

- 日历工具需要在 **系统设置 → 隐私与安全性 → 日历** 中允许终端或 Node.js 访问
- 浏览器工具需要在 **系统设置 → 隐私与安全性 → 自动化** 中允许终端控制 Chrome/Safari

### 任务超过 10 秒没有推送通知

检查 `triggerWord` 与小智设备系统提示词中配置的触发词是否一致。
日志中搜索 `webhook pushed` 确认推送是否成功发出。

---

## 项目结构

```
extensions/mydazy-mcp/
├── src/
│   ├── mcp-client.ts       # WebSocket MCP 客户端 + 工具处理
│   ├── mac-tools.ts        # macOS 原生控制（日历、浏览器、启动器）
│   ├── task-runner.ts      # Agent 任务执行
│   ├── task-queue.ts       # 任务队列管理
│   ├── result-narrator.ts  # 口播摘要生成
│   ├── webhook-pusher.ts   # mydazy PushTTS 推送
│   ├── config.ts           # 配置 Schema（Zod）
│   └── core-bridge.ts      # OpenClaw core 动态加载
├── docs/
│   ├── install.md          # 本文件
│   └── xiaozhi-system-prompt.md  # 小智设备系统提示词
├── index.ts                # OpenClaw 插件注册入口（根目录）
├── openclaw.plugin.json    # 插件元数据
└── package.json
```

---

## 开发 / 贡献

```bash
# 修改代码后直接重启 gateway 即可（jiti 运行时编译，无需手动 build）
pkill -f "openclaw.*gateway"
nohup pnpm openclaw gateway run > /tmp/openclaw-gateway.log 2>&1 &
```

代码仓库：<https://github.com/ahelpercn/openclaw>（`extensions/mydazy-mcp`）
