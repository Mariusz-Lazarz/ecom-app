import Link from "next/link"
import { ArrowRight, Clock, CreditCard, Lock, PackageCheck, RotateCcw, ShieldCheck, Truck } from "lucide-react"

import { LottieAnimation } from "@/components/lottie-animation"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const highlights = [
  {
    eyebrow: "Secure checkout",
    title: "Pay your way, safely.",
    description:
      "Every payment is encrypted end to end. Use your card, Apple Pay, Google Pay or pay later in instalments — whatever suits you.",
    animation: "/animations/secure-payment.lottie",
    animationLabel: "Person completing a secure mobile payment",
    href: "/help/payments",
    linkLabel: "Payment options",
    points: [
      { icon: Lock, text: "256-bit SSL encryption" },
      { icon: CreditCard, text: "Cards, wallets & pay later" },
      { icon: ShieldCheck, text: "Buyer protection on every order" },
    ],
  },
  {
    eyebrow: "Fast delivery",
    title: "At your door in days, not weeks.",
    description:
      "Orders placed before 2 pm ship the same day. Track your parcel in real time and choose the delivery slot that works for you.",
    animation: "/animations/delivery.lottie",
    animationLabel: "Delivery van driving through the city",
    href: "/help/shipping",
    linkLabel: "Shipping details",
    points: [
      { icon: Truck, text: "Free shipping over $50" },
      { icon: Clock, text: "Same-day dispatch before 2 pm" },
      { icon: RotateCcw, text: "30-day hassle-free returns" },
    ],
  },
]

export function FeatureHighlights() {
  return (
    <section className="bg-muted/40 py-16 md:py-24">
      <div className="mx-auto max-w-7xl space-y-20 px-4 sm:px-6 lg:px-8">
        {highlights.map((item, index) => (
          <div key={item.title} className="grid items-center gap-10 lg:grid-cols-2">
            <LottieAnimation
              src={item.animation}
              label={item.animationLabel}
              className={cn("mx-auto max-w-md", index % 2 === 1 && "lg:order-last")}
            />
            <div className="space-y-5">
              <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <PackageCheck className="size-4" /> {item.eyebrow}
              </p>
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{item.title}</h2>
              <p className="text-lg text-muted-foreground">{item.description}</p>
              <ul className="space-y-3">
                {item.points.map(({ icon: Icon, text }) => (
                  <li key={text} className="flex items-center gap-3">
                    <span className="flex size-8 items-center justify-center rounded-lg bg-background ring-1 ring-foreground/10">
                      <Icon className="size-4" />
                    </span>
                    <span className="text-sm font-medium">{text}</span>
                  </li>
                ))}
              </ul>
              <Button variant="outline" nativeButton={false} render={<Link href={item.href} />}>
                {item.linkLabel} <ArrowRight data-icon="inline-end" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
