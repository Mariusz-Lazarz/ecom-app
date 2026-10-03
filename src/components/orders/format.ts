import { SUPPORTED_COUNTRIES } from "@/lib/validation/checkout"

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" })
const dateTimeFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" })

/** "Oct 3, 2026" */
export const formatOrderDate = (date: Date) => dateFormat.format(date)

/** "Oct 3, 2026, 2:15 PM" */
export const formatOrderDateTime = (date: Date) => dateTimeFormat.format(date)

/** The country's name for an ISO code we ship to, or the code itself. */
export function countryName(code: string) {
  return SUPPORTED_COUNTRIES.find((country) => country.code === code)?.name ?? code
}
