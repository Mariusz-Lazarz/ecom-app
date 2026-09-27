import type { ReactNode } from "react"

type ErrorStateProps = {
  code: string
  title: string
  description: string
  digest?: string
  children?: ReactNode
}

export function ErrorState({ code, title, description, digest, children }: ErrorStateProps) {
  return (
    <main className="flex flex-1 items-center justify-center bg-muted/40 px-4 py-24">
      <div className="max-w-md text-center">
        <p className="text-sm font-semibold text-primary">{code}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-3 text-muted-foreground">{description}</p>
        {digest && <p className="mt-2 font-mono text-xs text-muted-foreground">Error ID: {digest}</p>}
        {children && <div className="mt-8 flex items-center justify-center gap-3">{children}</div>}
      </div>
    </main>
  )
}
