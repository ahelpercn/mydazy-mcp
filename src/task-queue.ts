import { randomUUID } from "node:crypto";
import type { MydazyMcpConfig } from "./config.js";
import type { QueueEntry, Task, TaskStatus } from "./types.js";

type DoneCallback = (task: Task) => void;

/**
 * In-memory task queue with per-device result slots.
 *
 * Lifecycle:
 *   create() → task is "pending"
 *   markRunning() → task is "running", progress lines are appended
 *   markDone() → task is "done", oralSummary is stored, result pushed to device slot
 *   consumeForDevice() → device pulls entries, slots are cleared
 */
export class TaskQueue {
  private tasks = new Map<string, Task>();
  /** deviceId → pending QueueEntry[] (including "broadcast" key for all devices) */
  private deviceSlots = new Map<string, QueueEntry[]>();
  private doneCallbacks: DoneCallback[] = [];
  private maxSize: number;

  constructor(private config: MydazyMcpConfig) {
    this.maxSize = config.maxQueueSize;
  }

  // ---------------------------------------------------------------------------
  // Task lifecycle
  // ---------------------------------------------------------------------------

  create(opts: { agent: string; prompt: string; sourceDevice?: string }): Task {
    const task: Task = {
      id: randomUUID(),
      agent: opts.agent,
      prompt: opts.prompt,
      status: "pending",
      progress: [],
      createdAt: Date.now(),
      sourceDevice: opts.sourceDevice,
    };
    this.tasks.set(task.id, task);
    return task;
  }

  markRunning(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (task && task.status === "pending") {
      task.status = "running";
      task.startedAt = Date.now();
    }
  }

  /** Append a progress line; visible to task_status callers */
  appendProgress(taskId: string, line: string): void {
    const task = this.tasks.get(taskId);
    if (task && task.status === "running") {
      task.progress.push(line);
    }
  }

  markDone(taskId: string, result: string, oralSummary: string, targetDevice?: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    task.status = "done";
    task.result = result;
    task.oralSummary = oralSummary;
    task.doneAt = Date.now();

    // Short result (≤8 chars) → inline; device can skip the MCP pull
    const trimmed = oralSummary.trim();
    const inlineResult = trimmed.length <= 8 ? trimmed : undefined;

    const entry: QueueEntry = {
      taskId,
      oralText: oralSummary,
      inlineResult,
      priority: "normal",
      enqueuedAt: Date.now(),
    };

    // Route to originating device or broadcast to all.
    // Use || (not ??) so empty string also falls back to "broadcast",
    // keeping slot keys consistent with toolGetResults() which uses || too.
    const slotKey = targetDevice || task.sourceDevice || "broadcast";
    this.pushToSlot(slotKey, entry);

    for (const cb of this.doneCallbacks) {
      try {
        cb(task);
      } catch {
        // callbacks must not throw
      }
    }
  }

  markError(taskId: string, message: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;
    task.status = "error";
    task.errorMessage = message;
    task.doneAt = Date.now();
  }

  // ---------------------------------------------------------------------------
  // Device consumption
  // ---------------------------------------------------------------------------

  /** Called when device sends get_results — drains its slot + broadcast slot */
  consumeForDevice(deviceId: string, limit = 5): QueueEntry[] {
    const own = this.deviceSlots.get(deviceId) ?? [];
    const bc = this.deviceSlots.get("broadcast") ?? [];

    const merged = [...bc, ...own].sort((a, b) => a.enqueuedAt - b.enqueuedAt).slice(0, limit);

    // Clear consumed slots
    this.deviceSlots.set(deviceId, []);
    this.deviceSlots.set("broadcast", []);

    return merged;
  }

  /** Returns true if there are pending entries for this device */
  hasPending(deviceId: string): boolean {
    const own = this.deviceSlots.get(deviceId)?.length ?? 0;
    const bc = this.deviceSlots.get("broadcast")?.length ?? 0;
    return own + bc > 0;
  }

  // ---------------------------------------------------------------------------
  // Accessors
  // ---------------------------------------------------------------------------

  get(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  getStatus(taskId: string): TaskStatus | "not_found" {
    return this.tasks.get(taskId)?.status ?? "not_found";
  }

  /** Register a callback fired when any task completes (done or error) */
  onDone(cb: DoneCallback): void {
    this.doneCallbacks.push(cb);
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private pushToSlot(slotKey: string, entry: QueueEntry): void {
    const slot = this.deviceSlots.get(slotKey) ?? [];
    // Drop oldest if over limit
    while (slot.length >= this.maxSize) {
      slot.shift();
    }
    slot.push(entry);
    this.deviceSlots.set(slotKey, slot);
  }
}
