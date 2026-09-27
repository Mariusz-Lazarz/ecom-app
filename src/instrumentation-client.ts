import { logger } from "@/lib/logger"

const log = logger.child({ scope: "browser" })

// Runs in the browser before the app becomes interactive. In dev these lines are also forwarded
// to the terminal (see `logging.browserToTerminal` in next.config.ts).
window.addEventListener("error", (event) => {
  log.error("Uncaught error", { err: event.error ?? event.message, source: event.filename, line: event.lineno })
})

window.addEventListener("unhandledrejection", (event) => {
  log.error("Unhandled promise rejection", { err: event.reason })
})

export function onRouterTransitionStart(url: string, navigationType: "push" | "replace" | "traverse") {
  log.debug(`Navigate to ${url}`, { navigationType })
}
