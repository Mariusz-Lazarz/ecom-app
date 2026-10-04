import { button, escapeHtml, layout, paragraph, textFooter, type EmailContent } from "@/emails/layout"

/**
 * The password reset link. `resetUrl` is absolute and carries the raw token; `expiresInMinutes`
 * is how long it stays valid.
 */
export function passwordResetEmail({
  firstName,
  resetUrl,
  expiresInMinutes,
}: {
  firstName: string
  resetUrl: string
  expiresInMinutes: number
}): EmailContent {
  const subject = "Reset your Northcart password"
  const validity = expiresInMinutes % 60 === 0 && expiresInMinutes >= 60
    ? `${expiresInMinutes / 60} hour${expiresInMinutes === 60 ? "" : "s"}`
    : `${expiresInMinutes} minutes`

  const html = layout({
    title: "Reset your password",
    preheader: `Use this link within ${validity} to choose a new password.`,
    body: [
      paragraph(`Hi ${escapeHtml(firstName)},`),
      paragraph("We got a request to reset the password for your Northcart account. Click the button below to choose a new one."),
      button(resetUrl, "Choose a new password"),
      paragraph(`This link works once and expires in ${validity}.`, "font-size:14px;"),
      paragraph(
        `If the button doesn't work, paste this address into your browser:<br><a href="${escapeHtml(resetUrl)}" style="color:inherit;word-break:break-all;">${escapeHtml(resetUrl)}</a>`,
        "font-size:13px;line-height:20px;",
      ),
      paragraph("Didn't ask for this? You can safely ignore this email: your password stays the same.", "font-size:14px;margin:0;"),
    ].join("\n"),
  })

  const text = `Hi ${firstName},

We got a request to reset the password for your Northcart account. Open this link to choose a new one:

${resetUrl}

This link works once and expires in ${validity}.

Didn't ask for this? You can safely ignore this email: your password stays the same.${textFooter()}`

  return { subject, html, text }
}
