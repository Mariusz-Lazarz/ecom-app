import { logger, type Logger } from "@/lib/logger"

// Errors we expect and know how to explain to the client. Anything else is treated as a bug:
// logged in full on the server and reported to the client only as a generic 500.
export class AppError extends Error {
  constructor(
    message: string,
    readonly status: number = 500,
    readonly code: string = "internal_error",
    readonly details?: unknown,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = new.target.name
  }
}

export class BadRequestError extends AppError {
  constructor(message = "Bad request", details?: unknown) {
    super(message, 400, "bad_request", details)
  }
}

export class ValidationError extends AppError {
  constructor(
    readonly fieldErrors: Record<string, string[] | undefined>,
    message = "Validation failed",
  ) {
    super(message, 422, "validation_error", { fieldErrors })
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required") {
    super(message, 401, "unauthorized")
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You don't have access to this resource") {
    super(message, 403, "forbidden")
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super(message, 404, "not_found")
  }
}

export class ConflictError extends AppError {
  constructor(message = "Resource already exists") {
    super(message, 409, "conflict")
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = "Service temporarily unavailable", options?: ErrorOptions) {
    super(message, 503, "service_unavailable", undefined, options)
  }
}

export type ErrorBody = {
  error: { code: string; message: string; details?: unknown }
}

export const GENERIC_MESSAGE = "Something went wrong. Please try again."

// Single place that decides what leaves the server. Unknown errors never expose their message.
export function toErrorBody(err: unknown): { status: number; body: ErrorBody } {
  if (err instanceof AppError) {
    const error: ErrorBody["error"] = { code: err.code, message: err.message }
    if (err.details !== undefined) error.details = err.details
    return { status: err.status, body: { error } }
  }
  return { status: 500, body: { error: { code: "internal_error", message: GENERIC_MESSAGE } } }
}

export function logError(err: unknown, scope: string, log: Logger = logger) {
  // 4xx are the client's problem, not ours: worth seeing, but without a stack trace.
  if (err instanceof AppError && err.status < 500) {
    log.warn(err.message, { scope, status: err.status, code: err.code })
    return
  }
  log.error(err instanceof Error ? err.message : "Unexpected error", { scope, err })
}
