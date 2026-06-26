/**
 * SchoolCo Structured Logger
 *
 * In development: colorized console output with context.
 * In production:  structured JSON output (ready for Datadog, LogTail, etc.).
 *
 * Usage:
 *   import { logger } from "@/lib/logger";
 *   logger.info("User signed in", { userId, orgId });
 *   logger.error("Database query failed", { error, query });
 *
 * SECURITY: Never log passwords, tokens, full SSNs, or PII beyond user IDs.
 */

type LogLevel = "debug" | "info" | "warn" | "error";
type LogContext = Record<string, unknown>;

interface LogEntry {
  level:     LogLevel;
  message:   string;
  context?:  LogContext;
  timestamp: string;
  service:   string;
}

const IS_DEV  = process.env.NODE_ENV === "development";
const SERVICE = "schoolco";

// ANSI color codes for development output
const COLORS: Record<LogLevel, string> = {
  debug: "\x1b[36m", // Cyan
  info:  "\x1b[32m", // Green
  warn:  "\x1b[33m", // Yellow
  error: "\x1b[31m", // Red
};
const RESET = "\x1b[0m";

function formatDev(entry: LogEntry): string {
  const color   = COLORS[entry.level];
  const prefix  = `${color}[${entry.level.toUpperCase()}]${RESET}`;
  const time    = new Date(entry.timestamp).toLocaleTimeString();
  const context = entry.context ? ` ${JSON.stringify(entry.context)}` : "";
  return `${prefix} ${time} ${entry.message}${context}`;
}

function log(level: LogLevel, message: string, context?: LogContext): void {
  // Only output debug logs in development
  if (level === "debug" && !IS_DEV) return;

  const entry: LogEntry = {
    level,
    message,
    context,
    timestamp: new Date().toISOString(),
    service:   SERVICE,
  };

  if (IS_DEV) {
    const formatted = formatDev(entry);
    if (level === "error") {
      console.error(formatted);
    } else if (level === "warn") {
      console.warn(formatted);
    } else {
      // eslint-disable-next-line no-console
      console.log(formatted);
    }
  } else {
    // Production: structured JSON (pipe to external log service)
    const output = JSON.stringify(entry);
    if (level === "error") {
      console.error(output);
    } else if (level === "warn") {
      console.warn(output);
    } else {
      // eslint-disable-next-line no-console
      console.log(output);
    }
  }
}

export const logger = {
  debug: (message: string, context?: LogContext) => log("debug", message, context),
  info:  (message: string, context?: LogContext) => log("info",  message, context),
  warn:  (message: string, context?: LogContext) => log("warn",  message, context),
  error: (message: string, context?: LogContext) => log("error", message, context),
};
