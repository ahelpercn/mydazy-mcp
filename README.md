# 🦞 mydazy-mcp

[English](./README.en.md) | 中文

**一句话让 AI 帮你干活，干完了自动语音汇报。**

用AI搭子MyDazy说一句"小龙虾帮我查一下今天的日程"，AI 在后台执行，完成后AI搭子MyDazy自动播报结果。无需盯屏幕，无需动手，张嘴就行。

---

## 它能做什么

```
你："搭子精灵，小龙虾帮我看看邮箱有没有新邮件"
AI搭子："好的，小龙虾收到了"
         ... AI 后台执行中 ...
AI搭子："小龙虾有结果了。你有 3 封未读邮件，第一封是张三发的关于项目进度的..."
```

所有 OpenClaw Agent 能做的事，你都可以用语音下达：查日程、发消息、搜信息、写代码、控制 Mac 应用…… 说完就走，结果自动送到耳边。

当前版本按**单设备闭环**设计：一台 mydazy 设备负责发起任务和接收结果，不做多设备路由。

---

## 30 秒安装

**方式一：npm 安装 + 引导配置（推荐）**

```bash
npm install openclaw-mydazy-mcp
npx openclaw-mydazy-mcp setup
```

安装后自动启动配置向导，按提示填入 2 个地址即可完成全部设置。

**方式二：一键脚本**

```bash
curl -fsSL https://raw.githubusercontent.com/ahelpercn/mydazy-mcp/main/install.sh | bash
npx openclaw-mydazy-mcp setup
```

配置完成后重启 Gateway：`openclaw gateway restart`

> 也可以在 **OpenClaw Dashboard** 中配置插件参数。

---

## 使用示例

| 你说 | AI 做了什么 | AI搭子播报 |
|------|------------|---------|
| 小龙虾帮我看看今天有什么日程 | 读取 Mac 日历 | "你今天有 3 个会议，上午 10 点产品评审..." |
| 小龙虾给张三发消息说我晚点到 | 发送 iMessage | "已经给张三发了消息" |
| 小龙虾今天 A 股怎么样 | 搜索实时行情 | "上证指数今天涨了 0.8%..." |
| 小龙虾帮我打开 Figma | 启动 Mac 应用 | "Figma 已打开" |

> **触发词**："小龙虾"是指令前缀，不是唤醒词。先说"搭子精灵"唤醒 AI搭子，再说"小龙虾帮我..."。

---

## 工作原理

```
语音指令 → MyDazy设备 → MCP 请求 → mydazy-mcp → OpenClaw Agent 执行
                                                       ↓
语音播报 ← MyDazy设备 ← Webhook 推送 ← 结果口语化 ← 任务完成
```

**5 个 MCP 工具**：

| 工具 | 用途 |
|------|------|
| `send_task` | 提交任务，AI 后台执行 |
| `get_results` | 拉取已完成任务的结果 |
| `task_status` | 查询最近任务或指定任务的进度 |
| `push_notification` | 直接推送一条语音消息 |
| `check_service` | 检查小龙虾服务是否在线 |

---

## 配置

只需填 2 个地址即可使用，其余均有默认值：

| 字段 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `mcpServerUrl` | ✅ | — | 小程序「设备」页面获取 |
| `webhookUrl` | ✅ | — | 小程序「Bot」页面获取 |
| `triggerWord` | | `"小龙虾有结果了"` | 播报触发词，可自定义（≤10 字） |
| `defaultAgent` | | `"main"` | 默认 Agent ID |
| `taskTimeoutMs` | | `120000` | 任务超时时间（毫秒） |

**自定义触发词示例**：想用"小助手有结果了"代替默认触发词？加一行配置：

```json
{ "triggerWord": "小助手有结果了" }
```

---

## 卸载

**脚本安装的卸载**：

```bash
curl -fsSL https://raw.githubusercontent.com/ahelpercn/mydazy-mcp/main/uninstall.sh | bash
```

**npm 安装的卸载**：

```bash
npm uninstall openclaw-mydazy-mcp
```

---

## 常见问题

**设备没有收到播报？** — 检查 `webhookUrl` 是否正确，在小程序 Bot 页面重新复制。

**任务超时？** — 默认 120 秒，复杂任务可调大 `taskTimeoutMs`。

**语音识别不准？** — 系统提示词已内置"小龙虾"的常见误识别词（小笼虾、小龙侠等），会自动纠正。

---

## 获取MyDazy设备

还没有 MyDazy 设备？扫码进入 mydazy 小程序了解更多，或直接购买支持 MCP 的 MyDazy 设备。

**微信搜索「mydazy」小程序** → 注册 → 绑定设备 → 开始体验

---

## License

MIT
