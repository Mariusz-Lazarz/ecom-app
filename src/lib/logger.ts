// One logger for the whole app: server code, Proxy (edge) and the browser. No dependencies, so it
// runs in every runtime Next.js has.
//
//   logger.info("user registered", { userId })
//   const log = logger.child({ scope: "db" })
//
// Dev prints short coloured lines; production prints one JSON object per line so logs can be
// grepped or shipped somewhere. Tune with LOG_LEVEL / NEXT_PUBLIC_LOG_LEVEL and LOG_FORMAT.

export type LogLevel = "debug" | "info" | "warn" | "error"
export type LogContext = Record<string, unknown>

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }

const isBrowser = typeof window !== "undefined"
const isProd = process.env.NODE_ENV === "production"
const isTest = process.env.NODE_ENV === "test"

function resolveLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL ?? process.env.NEXT_PUBLIC_LOG_LEVEL)?.toLowerCase()
  if (raw && raw in LEVELS) return raw as LogLevel
  if (isTest) return "warn"
  return isProd ? "info" : "debug"
}

const minLevel = LEVELS[resolveLevel()]
const json = !isBrowser && (process.env.LOG_FORMAT ? process.env.LOG_FORMAT === "json" : isProd)

// Never let credentials reach the logs, however deep they're nested.
const SENSITIVE = /pass(word)?|secret|token|authorization|cookie|hash|api[-_]?key/i

export function serializeError(err: unknown): unknown {
  if (!(err instanceof Error)) return err
  const out: LogContext = { name: err.name, message: err.message, stack: err.stack }
  for (const key of ["code", "status", "digest"] as const) {
    const value = (err as unknown as LogContext)[key]
    if (value !== undefined) out[key] = value
  }
  if (err.cause !== undefined) out.cause = serializeError(err.cause)
  return out
}

function sanitize(value: unknown, depth = 0): unknown {
  if (value instanceof Error) return serializeError(value)
  if (value === null || typeof value !== "object" || depth > 5) return value
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map((v) => sanitize(v, depth + 1))
  const out: LogContext = {}
  for (const [key, v] of Object.entries(value)) {
    out[key] = SENSITIVE.test(key) ? "[redacted]" : sanitize(v, depth + 1)
  }
  return out
}

const COLORS: Record<LogLevel, string> = { debug: "\x1b[90m", info: "\x1b[36m", warn: "\x1b[33m", error: "\x1b[31m" }
const DIM = "\x1b[2m"
const RESET = "\x1b[0m"

function write(level: LogLevel, message: string, context: LogContext) {
  const { scope, ...rest } = sanitize(context) as LogContext
  const method = level === "debug" ? "log" : level === "info" ? "info" : level

  if (json) {
    console[method](JSON.stringify({ time: new Date().toISOString(), level, scope, msg: message, ...rest }))
    return
  }

  const prefix = scope ? `[${scope}] ` : ""
  const hasContext = Object.keys(rest).length > 0
  // Stacks read better printed as-is than squeezed into an object.
  const { err, ...fields } = rest
  const stack = err && typeof err === "object" && "stack" in err ? String(err.stack) : undefined

  if (isBrowser) {
    const args: unknown[] = [`${level.toUpperCase()} ${prefix}${message}`]
    if (hasContext) args.push(rest)
    console[method](...args)
    return
  }

  const time = new Date().toISOString().slice(11, 23)
  const tag = `${COLORS[level]}${level.toUpperCase().padEnd(5)}${RESET}`
  let line = `${DIM}${time}${RESET} ${tag} ${prefix}${message}`
  const shown = stack ? fields : rest
  if (Object.keys(shown).length > 0) line += ` ${DIM}${JSON.stringify(shown)}${RESET}`
  if (stack) line += `\n${stack}`
  console[method](line)
}

export type Logger = {
  debug(message: string, context?: LogContext): void
  info(message: string, context?: LogContext): void
  warn(message: string, context?: LogContext): void
  error(message: string, context?: LogContext): void
  child(bindings: LogContext): Logger
}

function createLogger(bindings: LogContext = {}): Logger {
  const log = (level: LogLevel) => (message: string, context: LogContext = {}) => {
    if (LEVELS[level] < minLevel) return
    try {
      write(level, message, { ...bindings, ...context })
    } catch {
      // Logging must never take the app down (e.g. a circular object slipped in).
      console[level === "debug" ? "log" : level](message)
    }
  }

  return {
    debug: log("debug"),
    info: log("info"),
    warn: log("warn"),
    error: log("error"),
    child: (more) => createLogger({ ...bindings, ...more }),
  }
}

export const logger = createLogger()
