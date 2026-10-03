/**
 * Sample discount codes, upserted by code: every run puts their settings back to these values
 * (redemptions are left alone). Values are percent (1–100) or cents; dates are UTC.
 */
const CODES = [
  {
    code: "WELCOME10",
    description: "10% off a first order over $30",
    type: "percent",
    value: 10,
    minSubtotalCents: 3000,
    perUserLimit: 1,
  },
  {
    code: "SAVE15",
    description: "$15 off orders over $100",
    type: "fixed",
    value: 1500,
    minSubtotalCents: 10000,
    perUserLimit: 1,
  },
  {
    code: "FREESHIP",
    description: "Free shipping with any method",
    type: "free_shipping",
    value: 0,
    perUserLimit: null,
  },
  {
    code: "EXPIRED5",
    description: "$5 off, ended with last season's sale",
    type: "fixed",
    value: 500,
    startsAt: "2025-11-01T00:00:00Z",
    endsAt: "2026-01-01T00:00:00Z",
    perUserLimit: 1,
  },
  {
    code: "ONCE20",
    description: "20% off for the first customer to use it",
    type: "percent",
    value: 20,
    maxRedemptions: 1,
    perUserLimit: 1,
  },
]

export const SEEDED_DISCOUNT_CODES = CODES.map((code) => code.code)

export async function seedDiscounts(client) {
  for (const code of CODES) {
    await client.query(
      `INSERT INTO discount_codes (code, description, type, value, min_subtotal_cents, starts_at, ends_at,
                                   max_redemptions, per_user_limit, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
       ON CONFLICT (code) DO UPDATE
         SET description = EXCLUDED.description, type = EXCLUDED.type, value = EXCLUDED.value,
             min_subtotal_cents = EXCLUDED.min_subtotal_cents, starts_at = EXCLUDED.starts_at,
             ends_at = EXCLUDED.ends_at, max_redemptions = EXCLUDED.max_redemptions,
             per_user_limit = EXCLUDED.per_user_limit, active = true`,
      [
        code.code,
        code.description,
        code.type,
        code.value,
        code.minSubtotalCents ?? 0,
        code.startsAt ?? null,
        code.endsAt ?? null,
        code.maxRedemptions ?? null,
        code.perUserLimit,
      ],
    )
  }
  return `${CODES.length} discount codes (${SEEDED_DISCOUNT_CODES.join(", ")})`
}
