import { toast } from "sonner"

import type { Notification } from "@/lib/notifications"

type NotifyOptions = {
  description?: string
  /** Milliseconds before the toast closes; `Infinity` keeps it open until dismissed. */
  duration?: number
  action?: { label: string; onClick: () => void }
}

type PromiseMessages<T> = {
  loading: string
  success: string | ((data: T) => string)
  error: string | ((error: unknown) => string)
}

/**
 * Client-side toasts. Components call this instead of importing `sonner`, so every notification
 * in the app goes through one API. It needs the `<Toaster />` mounted in the root layout.
 * Server Actions use `flash()` from `@/lib/flash` instead.
 */
export const notify = {
  success: (title: string, options?: NotifyOptions) => toast.success(title, options),
  error: (title: string, options?: NotifyOptions) => toast.error(title, options),
  warning: (title: string, options?: NotifyOptions) => toast.warning(title, options),
  info: (title: string, options?: NotifyOptions) => toast.info(title, options),

  /** Shows a notification object, e.g. one returned by a Server Action. */
  show: ({ type, title, description }: Notification) => toast[type](title, { description }),

  /** Shows a loading toast that turns into success or error once the promise settles. */
  promise: <T>(promise: Promise<T>, messages: PromiseMessages<T>) => toast.promise(promise, messages),

  /** Closes one toast by the id another `notify` call returned, or all of them without an id. */
  dismiss: (id?: string | number) => toast.dismiss(id),
}
