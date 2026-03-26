# 🦞 mydazy-mcp

English | [中文](./README.md)

**Tell your AI buddy what to do, and it reports back by voice when done.**

Just say "Lobster, check my email" to your MyDazy device. The AI agent runs the task in the background and automatically reads the result out loud when it's finished. No screen, no typing — just talk.

---

## What It Does

```
You: "Hey buddy, lobster check my email for new messages"
MyDazy: "Got it, lobster is on it"
        ... AI working in the background ...
MyDazy: "Lobster has results. You have 3 unread emails, the first one is from Zhang San about project progress..."
```

Anything an OpenClaw Agent can do, you can now trigger by voice: check calendars, send messages, search the web, write code, control Mac apps... speak and walk away, results are delivered to your ears.

The current plugin is intentionally designed for a **single paired device**. One mydazy device starts the task and receives the spoken result; there is no multi-device routing.

---

## 30-Second Install

**Option 1: npm + setup wizard (recommended)**

```bash
npm install openclaw-mydazy-mcp
npx openclaw-mydazy-mcp setup
```

The setup wizard walks you through filling in 2 addresses — that's it.

**Option 2: One-line script**

```bash
curl -fsSL https://raw.githubusercontent.com/ahelpercn/mydazy-mcp/main/install.sh | bash
npx openclaw-mydazy-mcp setup
```

After setup, restart Gateway: `openclaw gateway restart`

> You can also configure the plugin in the **OpenClaw Dashboard**.

---

## Usage Examples

| You say | AI does | MyDazy reads back |
|---------|---------|-------------------|
| Lobster, check my calendar for today | Reads Mac Calendar | "You have 3 meetings today, 10am product review..." |
| Lobster, send a message to Zhang San that I'll be late | Sends iMessage | "Message sent to Zhang San" |
| Lobster, how's the stock market today | Searches live data | "S&P 500 is up 0.8% today..." |
| Lobster, open Figma | Launches Mac app | "Figma is open" |

> **Trigger word**: "Lobster" (小龙虾) is a command prefix, not a wake word. First wake your MyDazy device, then say "Lobster, help me..."

---

## How It Works

```
Voice command → MyDazy device → MCP request → mydazy-mcp → OpenClaw Agent executes
                                                                  ↓
Voice readback ← MyDazy device ← Webhook push ← Oral summary ← Task complete
```

**5 MCP Tools**:

| Tool | Purpose |
|------|---------|
| `send_task` | Submit a task for background AI execution |
| `get_results` | Retrieve completed task results |
| `task_status` | Check the latest task or a specific task |
| `push_notification` | Push an immediate voice message |
| `check_service` | Check if the service is online |

---

## Configuration

Only 2 fields are required — everything else has sensible defaults:

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `mcpServerUrl` | Yes | — | From mydazy mini-program → Devices page |
| `webhookUrl` | Yes | — | From mydazy mini-program → Bot page |
| `triggerWord` | | `"小龙虾有结果了"` | Trigger phrase for result notification (max 10 chars) |
| `defaultAgent` | | `"main"` | Default Agent ID |
| `taskTimeoutMs` | | `120000` | Task timeout in milliseconds |

---

## Uninstall

**Script install:**

```bash
curl -fsSL https://raw.githubusercontent.com/ahelpercn/mydazy-mcp/main/uninstall.sh | bash
```

**npm install:**

```bash
npm uninstall openclaw-mydazy-mcp
```

---

## FAQ

**Device not receiving voice alerts?** — Check that `webhookUrl` is correct. Re-copy it from the Bot page in the mydazy mini-program.

**Task timeout?** — Default is 120 seconds. Increase `taskTimeoutMs` for complex tasks.

**Voice recognition issues?** — The device system prompt includes common misrecognition variants of the trigger word and auto-corrects them.

---

## Get a MyDazy Device

Don't have a MyDazy device yet? Search for **"mydazy"** in WeChat mini-programs to learn more and purchase an MCP-enabled device.

---

## License

MIT
