import Link from "next/link"
import { ArrowRight } from "lucide-react"

type SectionHeadingProps = {
  title: string
  description: string
  href?: string
  linkLabel?: string
}

export function SectionHeading({ title, description, href, linkLabel }: SectionHeadingProps) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
        <p className="text-muted-foreground">{description}</p>
      </div>
      {href && (
        <Link
          href={href}
          className="flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline"
        >
          {linkLabel} <ArrowRight className="size-4" />
        </Link>
      )}
    </div>
  )
}
