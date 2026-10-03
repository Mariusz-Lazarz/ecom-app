import { countryName } from "@/components/orders/format"
import type { OrderAddress } from "@/lib/orders"

/** An address as postal lines: name, street lines, postal code and city, country, then the phone. */
export function AddressLines({ address, className }: { address: OrderAddress; className?: string }) {
  return (
    <address className={className ?? "text-sm leading-relaxed not-italic"}>
      {address.fullName}
      <br />
      {address.line1}
      {address.line2 && (
        <>
          <br />
          {address.line2}
        </>
      )}
      <br />
      {address.postalCode} {address.city}
      <br />
      {countryName(address.country)}
      <br />
      <span className="text-muted-foreground">{address.phone}</span>
    </address>
  )
}
