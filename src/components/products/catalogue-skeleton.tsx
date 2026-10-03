import { SiteHeader } from "@/components/site-header"

const block = "animate-pulse rounded-md bg-muted"

/** Placeholder for the catalogue pages while products load. */
export function CatalogueSkeleton() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1" aria-busy="true" aria-label="Loading products">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <div className={`${block} h-9 w-56`} />
          <div className={`${block} mt-3 h-5 w-72`} />
          <div className="mt-8 grid gap-8 lg:grid-cols-[13rem_1fr]">
            <div className="flex gap-2 overflow-hidden lg:flex-col">
              {Array.from({ length: 7 }, (_, i) => (
                <div key={i} className={`${block} h-8 w-20 shrink-0 lg:w-full`} />
              ))}
            </div>
            <div className="space-y-6">
              <div className="flex justify-between">
                <div className={`${block} h-6 w-48`} />
                <div className={`${block} h-8 w-40`} />
              </div>
              <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }, (_, i) => (
                  <div key={i} className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
                    <div className={`${block} aspect-square rounded-none`} />
                    <div className="space-y-2 p-4">
                      <div className={`${block} h-3 w-20`} />
                      <div className={`${block} h-4 w-40`} />
                      <div className={`${block} h-6 w-24`} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  )
}
