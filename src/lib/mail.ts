import "server-only"

import { after } from "next/server"
import nodemailer, { type Transporter } from "nodemailer"

import { logError } from "@/lib/errors"
import { logger } from "@/lib/logger"

/**
 * Outgoing email over SMTP (Mailpit locally, any SMTP provider in production), configured from
 * `SMTP_HOST`, `SMTP_PORT`, optional `SMTP_USER` / `SMTP_PASS` / `SMTP_SECURE` and `MAIL_FROM`.
 *
 * Without `SMTP_HOST` nothing is sent: the email's recipient and subject are logged at info
 * instead, so the build, CI and unit tests run without a mail server. Sending never throws:
 * failures are logged and reported as `false`, so an email can't break the action that sent it.
 */

const log = logger.child({ scope: "mail" })

export type MailMessage = { to: string; subject: string; html: string; text: string }

const DEFAULT_FROM = "Northcart <no-reply@northcart.test>"

type MailConfig = {
  host: string
  port: number
  secure: boolean
  auth?: { user: string; pass: string }
  from: string
}

/** The SMTP settings from the environment, or null when `SMTP_HOST` isn't set. */
export function mailConfig(): MailConfig | null {
  const host = process.env.SMTP_HOST?.trim()
  if (!host) return null
  const secure = process.env.SMTP_SECURE === "true"
  const user = process.env.SMTP_USER?.trim()
  return {
    host,
    port: Number(process.env.SMTP_PORT) || (secure ? 465 : 587),
    secure,
    auth: user ? { user, pass: process.env.SMTP_PASS ?? "" } : undefined,
    from: process.env.MAIL_FROM?.trim() || DEFAULT_FROM,
  }
}

// One transport (and its connection settings) per configuration, reused across hot reloads.
const globalForMail = globalThis as unknown as { mailTransport?: { key: string; transport: Transporter } }

function getTransport(config: MailConfig) {
  const key = JSON.stringify(config)
  if (globalForMail.mailTransport?.key !== key) {
    const transport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.auth,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    })
    globalForMail.mailTransport = { key, transport }
  }
  return globalForMail.mailTransport.transport
}

/** Sends an email now. Resolves to whether it was handed to the SMTP server; never throws. */
export async function sendMail(message: MailMessage): Promise<boolean> {
  const config = mailConfig()
  if (!config) {
    log.info("SMTP isn't configured, email not sent", { to: message.to, subject: message.subject })
    return false
  }
  try {
    const info = await getTransport(config).sendMail({ from: config.from, ...message })
    log.info("Email sent", { to: message.to, subject: message.subject, messageId: info.messageId })
    return true
  } catch (err) {
    log.error("Email failed to send", { to: message.to, subject: message.subject, err })
    return false
  }
}

/**
 * Sends an email once the response has been sent (`after()`), so the action that triggers it
 * doesn't wait for SMTP. `build` runs then too, so it can read the database; it returns null to
 * send nothing. Errors in `build` are logged under `mail.<scope>` and never reach the caller.
 * Outside a request (scripts), the email is sent straight away without being awaited.
 */
export function sendMailLater(scope: string, build: () => MailMessage | null | Promise<MailMessage | null>) {
  const task = async () => {
    try {
      const message = await build()
      if (message) await sendMail(message)
    } catch (err) {
      logError(err, `mail.${scope}`)
    }
  }
  try {
    after(task)
  } catch {
    void task()
  }
}
