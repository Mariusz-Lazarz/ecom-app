import { NewsletterForm } from "@/components/newsletter/newsletter-form"
import { LottieAnimation } from "@/components/lottie-animation"

export function Newsletter() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="grid items-center gap-8 overflow-hidden rounded-2xl bg-primary px-6 py-10 text-primary-foreground sm:px-12 md:grid-cols-[1fr_auto]">
        <div className="space-y-4">
          <h2 className="text-3xl font-semibold tracking-tight">Get 10% off your first order</h2>
          <p className="max-w-lg text-primary-foreground/70">
            Join the Northcart list for early access to drops, members-only deals and a welcome
            gift in your inbox.
          </p>
          <NewsletterForm />
        </div>
        <LottieAnimation
          src="/animations/gift.lottie"
          label="Gift box bouncing"
          className="mx-auto w-40 md:w-56"
        />
      </div>
    </section>
  )
}
