import { appUrl, button, escapeHtml, layout, paragraph, textFooter, type EmailContent } from "@/emails/layout"

/** Sent after registration. */
export function welcomeEmail({ firstName }: { firstName: string }): EmailContent {
  const subject = "Welcome to Northcart"
  const shop = appUrl("/products")
  const account = appUrl("/account")

  const html = layout({
    title: `Welcome aboard, ${firstName}!`,
    preheader: "Your Northcart account is ready.",
    body: [
      paragraph("Thanks for creating a Northcart account. Everyday goods, thoughtfully picked, are a click away."),
      paragraph("With your account you can check out faster with saved addresses, keep a wishlist and follow your orders from checkout to your door."),
      button(shop, "Start shopping"),
      paragraph(
        `You can manage your details any time in <a href="${escapeHtml(account)}" style="color:inherit;">your account</a>.`,
        "font-size:14px;",
      ),
    ].join("\n"),
  })

  const text = `Welcome aboard, ${firstName}!

Thanks for creating a Northcart account. With it you can check out faster with saved addresses, keep a wishlist and follow your orders from checkout to your door.

Start shopping: ${shop}
Your account: ${account}${textFooter()}`

  return { subject, html, text }
}
