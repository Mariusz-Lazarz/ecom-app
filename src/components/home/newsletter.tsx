import { LottieAnimation } from "@/components/lottie-animation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

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
          <form className="flex max-w-md flex-col gap-2 sm:flex-row">
            <label htmlFor="newsletter-email" className="sr-only">
              Email address
            </label>
            <Input
              id="newsletter-email"
              type="email"
              required
              placeholder="you@example.com"
              className="h-10 border-primary-foreground/20 bg-primary-foreground/10 text-primary-foreground placeholder:text-primary-foreground/50"
            />
            <Button type="submit" variant="secondary" className="h-10 px-4">
              Subscribe
            </Button>
          </form>
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
