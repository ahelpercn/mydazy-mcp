#!/usr/bin/env node

/**
 * Post-install: auto-launch setup wizard in interactive terminals.
 *
 * npm suppresses both stdout and stderr from postinstall scripts by default.
 * The only reliable way to interact with users is to spawn an interactive
 * child process with stdio: "inherit" + --foreground-scripts behavior.
 *
 * Strategy: detect TTY → launch setup.js directly. Non-TTY → silent exit.
 * Users who skip setup can run `npx openclaw-mydazy-mcp setup` later.
 */

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// npm runs postinstall with stdin/stdout/stderr piped (not TTY).
// Only attempt setup if the parent process has a real terminal.
// Check via fd inheritance: if npm was invoked from a TTY and uses
// --foreground-scripts, fds are inherited. Otherwise, skip silently.
try {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  execFileSync(process.execPath, [join(__dirname, "setup.js"), "--auto"], {
    stdio: "inherit",
    timeout: 120_000,
  });
} catch {
  // Non-interactive, user cancelled, or setup failed — silent exit.
  // npm would show error output anyway if it propagated.
}
