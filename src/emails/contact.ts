import { appUrl, button, escapeHtml, layout, panel, paragraph, textFooter, type EmailContent } from "@/emails/layout"
import { contactTopicLabel, type ContactTopic } from "@/lib/validation/contact"

export type EmailContactMessage = {
  id: string
  name: string
  email: string
  orderNumber: string | null
  topic: ContactTopic
  message: string
}

/** User-supplied text as HTML: escaped, with line breaks kept. */
const multiline = (value: string) => escapeHtml(value).replace(/\r?\n/g, "<br>")

function details(message: EmailContactMessage) {
  const rows = [
    `<strong>Topic:</strong> ${escapeHtml(contactTopicLabel(message.topic))}`,
    message.orderNumber ? `<strong>Order:</strong> ${escapeHtml(message.orderNumber)}` : null,
  ].filter(Boolean)
  return rows.join("<br>")
}

/** The auto-reply to whoever used the contact form, quoting their message. */
export function contactAutoReplyEmail(message: EmailContactMessage): EmailContent {
  const subject = "We've got your message"
  const firstName = message.name.split(/\s+/)[0] || message.name

  const html = layout({
    title: "Thanks for getting in touch",
    preheader: "We usually answer within one business day.",
    body: [
      paragraph(`Hi ${escapeHtml(firstName)},`),
      paragraph("Thanks for contacting Northcart. A real person will read your message and reply to this address, usually within one business day."),
      panel("Your message", `${details(message)}<br><br>${multiline(message.message)}`),
      paragraph(
        `In the meantime, our <a href="${escapeHtml(appUrl("/help/shipping"))}" style="color:inherit;">shipping</a> and <a href="${escapeHtml(appUrl("/help/returns"))}" style="color:inherit;">returns</a> pages answer the most common questions.`,
        "font-size:14px;margin:0;",
      ),
    ].join("\n"),
  })

  const text = `Hi ${firstName},

Thanks for contacting Northcart. A real person will read your message and reply to this address, usually within one business day.

Topic: ${contactTopicLabel(message.topic)}${message.orderNumber ? `\nOrder: ${message.orderNumber}` : ""}

${message.message}

Shipping help: ${appUrl("/help/shipping")}
Returns: ${appUrl("/help/returns")}${textFooter()}`

  return { subject, html, text }
}

/** Tells the shop's inbox about a new contact message, with a link to it in the admin area. */
export function contactNotificationEmail(message: EmailContactMessage): EmailContent {
  const subject = `New message: ${contactTopicLabel(message.topic)} from ${message.name}`
  const adminLink = appUrl(`/admin/messages/${message.id}`)

  const html = layout({
    title: "New contact message",
    preheader: `${message.name} wrote about ${contactTopicLabel(message.topic).toLowerCase()}.`,
    body: [
      panel(
        "From",
        `${escapeHtml(message.name)} &lt;<a href="mailto:${escapeHtml(message.email)}" style="color:inherit;">${escapeHtml(message.email)}</a>&gt;<br>${details(message)}`,
      ),
      panel("Message", multiline(message.message)),
      button(adminLink, "Open in admin"),
    ].join("\n"),
  })

  const text = `New contact message

From: ${message.name} <${message.email}>
Topic: ${contactTopicLabel(message.topic)}${message.orderNumber ? `\nOrder: ${message.orderNumber}` : ""}

${message.message}

Open in admin: ${adminLink}${textFooter()}`

  return { subject, html, text }
}
