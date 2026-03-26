import { randomUUID } from "node:crypto";
import type { MydazyMcpConfig } from "./config";
import type { QueueEntry, Task, TaskStatus } from "./types";

type DoneCallback = (task: Task) => void;

/**
 * In-memory task queue for the single paired device.
 *
 * Lifecycle:
 *   create() → task is "pending"
 *   markRunning() → task is "running", progress lines are appended
 *   markDone() → task is "done", oralSummary is stored, result enters the queue
 *   consume() → the paired device pulls entries, consumed items are removed
 */
export class TaskQueue {
  private tasks = new Map<string, Task>();
  private pendingEntries: QueueEntry[] = [];
  private doneCallbacks: DoneCallback[] = [];
  private latestTaskId: string | null = null;
  private maxSize: number;

  constructor(private config: MydazyMcpConfig) {
    this.maxSize = config.maxQueueSize;
  }

  // ---------------------------------------------------------------------------
  // Task lifecycle
  // ---------------------------------------------------------------------------

  create(opts: { agent: string; prompt: string }): Task {
    const task: Task = {
      id: randomUUID(),
      agent: opts.agent,
      prompt: opts.prompt,
      status: "pending",
      progress: [],
      createdAt: Date.now(),
    };
    this.tasks.set(task.id, task);
    this.latestTaskId = task.id;
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

  markDone(taskId: string, result: string, oralSummary: string): void {
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

    this.pushToQueue(entry);

    for (const cb of this.doneCallbacks) {
      try {
        cb(task);
      } catch {
        // callbacks must not throw
      }
    }
  }

  enqueueNotification(oralText: string): void {
    const trimmed = oralText.trim();
    const inlineResult = trimmed.length <= 8 ? trimmed : undefined;
    this.pushToQueue({
      taskId: `notification:${randomUUID()}`,
      oralText,
      inlineResult,
      priority: "normal",
      enqueuedAt: Date.now(),
    });
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

  /** Called when the paired device sends get_results */
  consume(limit = 5): QueueEntry[] {
    const entries = this.pendingEntries.slice(0, limit);
    this.pendingEntries = this.pendingEntries.slice(entries.length);
    return entries;
  }

  hasPending(): boolean {
    return this.pendingEntries.length > 0;
  }

  // ---------------------------------------------------------------------------
  // Accessors
  // ---------------------------------------------------------------------------

  get(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  getLatest(): Task | undefined {
    return this.latestTaskId ? this.tasks.get(this.latestTaskId) : undefined;
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

  private pushToQueue(entry: QueueEntry): void {
    while (this.pendingEntries.length >= this.maxSize) {
      this.pendingEntries.shift();
    }
    this.pendingEntries.push(entry);
  }
}
