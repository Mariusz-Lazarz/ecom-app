import { siteConfig } from "@/lib/data"

/**
 * Shared pieces of the email templates: escaping, absolute links and the inline-styled HTML shell
 * (table layout, so it renders the same in every mail client). Templates are plain functions
 * returning `{ subject, html, text }`; every user-supplied value goes through `escapeHtml` before
 * it lands in HTML.
 */

export type EmailContent = { subject: string; html: string; text: string }

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char])
}

/** An absolute link to a page of the site, from `APP_URL` (http://localhost:3000 when unset). */
export function appUrl(path = "/") {
  const base = (process.env.APP_URL?.trim() || "http://localhost:3000").replace(/\/+$/, "")
  return `${base}${path.startsWith("/") ? path : `/${path}`}`
}

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
export const COLORS = {
  text: "#18181b",
  muted: "#71717a",
  border: "#e4e4e7",
  background: "#f4f4f5",
  card: "#ffffff",
  accent: "#18181b",
  success: "#047857",
  danger: "#b91c1c",
} as const

/** A paragraph of (already escaped) HTML. */
export function paragraph(html: string, style = "") {
  return `<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:${COLORS.text};${style}">${html}</p>`
}

/** A call-to-action button linking to `href` (escaped here). */
export function button(href: string, label: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;">
  <tr><td style="border-radius:8px;background:${COLORS.accent};">
    <a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 22px;font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${escapeHtml(label)}</a>
  </td></tr>
</table>`
}

/** A small grey box, e.g. for an address or a note. `html` must already be escaped. */
export function panel(title: string, html: string) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;background:${COLORS.background};border-radius:8px;">
  <tr><td style="padding:14px 16px;font-size:14px;line-height:21px;color:${COLORS.text};">
    <div style="font-size:12px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:${COLORS.muted};margin-bottom:4px;">${escapeHtml(title)}</div>
    ${html}
  </td></tr>
</table>`
}

/**
 * The full HTML document: a white card on a grey background with the wordmark above and a short
 * footer below. `preheader` is the preview line mail clients show next to the subject.
 */
export function layout({ title, preheader, body }: { title: string; preheader: string; body: string }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:${COLORS.background};font-family:${FONT};color:${COLORS.text};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLORS.background};">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
      <tr><td style="padding:0 4px 20px;">
        <a href="${escapeHtml(appUrl("/"))}" style="font-size:20px;font-weight:700;letter-spacing:-0.02em;color:${COLORS.text};text-decoration:none;">${escapeHtml(siteConfig.name)}</a>
      </td></tr>
      <tr><td style="background:${COLORS.card};border:1px solid ${COLORS.border};border-radius:12px;padding:32px 28px;font-family:${FONT};">
        <h1 style="margin:0 0 16px;font-size:22px;line-height:30px;font-weight:700;color:${COLORS.text};">${escapeHtml(title)}</h1>
        ${body}
      </td></tr>
      <tr><td style="padding:20px 4px 0;font-size:12px;line-height:18px;color:${COLORS.muted};">
        ${escapeHtml(siteConfig.name)} · ${escapeHtml(siteConfig.tagline)}<br>
        Questions? Just reply to this email or visit <a href="${escapeHtml(appUrl("/help/shipping"))}" style="color:${COLORS.muted};">our help pages</a>.
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`
}

/** The plain-text version's footer. */
export function textFooter() {
  return `\n\n—\n${siteConfig.name} · ${siteConfig.tagline}\n${appUrl("/")}`
}
