import type { Metadata } from "next"
import { MapPin } from "lucide-react"

import { DeleteAddressButton, SetDefaultAddressButton } from "@/components/addresses/address-actions"
import { AddressDialog } from "@/components/addresses/address-dialog"
import { AddressLines } from "@/components/addresses/address-lines"
import { Badge } from "@/components/ui/badge"
import { Card, CardAction, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { listAddresses } from "@/lib/addresses"
import { requireUser } from "@/lib/auth-guards"
import { MAX_ADDRESSES } from "@/lib/validation/addresses"

export const metadata: Metadata = { title: "Addresses — Northcart" }

export default async function AccountAddressesPage() {
  const session = await requireUser("/account/addresses")
  const addresses = await listAddresses(session.user.id)
  const full = addresses.length >= MAX_ADDRESSES
  const defaults = { fullName: session.user.name ?? "" }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Addresses</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {full
              ? `You've saved the maximum of ${MAX_ADDRESSES} addresses. Delete one to add another.`
              : `Your default address is preselected at checkout. ${addresses.length} of ${MAX_ADDRESSES} saved.`}
          </p>
        </div>
        <AddressDialog defaults={defaults} disabled={full} />
      </div>

      {addresses.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-16 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <MapPin className="size-6" />
          </span>
          <h2 className="text-lg font-semibold">No saved addresses yet</h2>
          <p className="max-w-xs text-sm text-muted-foreground">
            Add one here, or tick &ldquo;Save this address&rdquo; at checkout.
          </p>
        </div>
      ) : (
        <ul aria-label="Saved addresses" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {addresses.map((address) => (
            <li key={address.id}>
              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="truncate font-semibold">{address.label}</CardTitle>
                  {address.isDefault && (
                    <CardAction>
                      <Badge>Default</Badge>
                    </CardAction>
                  )}
                </CardHeader>
                <CardContent className="flex-1">
                  <AddressLines address={address} />
                </CardContent>
                <CardFooter className="flex flex-wrap gap-1">
                  <AddressDialog address={address} />
                  {!address.isDefault && <SetDefaultAddressButton address={address} />}
                  <DeleteAddressButton address={address} />
                </CardFooter>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
