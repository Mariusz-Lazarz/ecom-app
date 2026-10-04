import { appUrl, button, escapeHtml, layout, paragraph, textFooter, type EmailContent } from "@/emails/layout"

/** Sent on every newsletter sign-up that goes through. `unsubscribeUrl` is absolute and carries the token. */
export function newsletterConfirmationEmail({ unsubscribeUrl }: { unsubscribeUrl: string }): EmailContent {
  const subject = "You're on the Northcart list"
  const shop = appUrl("/products")

  const html = layout({
    title: "You're on the list!",
    preheader: "Early access to drops, members-only deals and a welcome gift.",
    body: [
      paragraph("Thanks for subscribing to the Northcart newsletter. You'll be the first to hear about new arrivals, members-only deals and the odd welcome gift."),
      paragraph(`As a thank-you, use the code <strong>WELCOME10</strong> for 10% off your first order over $30.`),
      button(shop, "Browse the shop"),
      paragraph(
        `Changed your mind? <a href="${escapeHtml(unsubscribeUrl)}" style="color:inherit;">Unsubscribe</a> at any time; it takes one click.`,
        "font-size:13px;line-height:20px;margin:0;",
      ),
    ].join("\n"),
  })

  const text = `You're on the list!

Thanks for subscribing to the Northcart newsletter. You'll be the first to hear about new arrivals, members-only deals and the odd welcome gift.

As a thank-you, use the code WELCOME10 for 10% off your first order over $30.

Browse the shop: ${shop}

Changed your mind? Unsubscribe: ${unsubscribeUrl}${textFooter()}`

  return { subject, html, text }
}
