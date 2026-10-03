import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

// Discount codes against the docker compose Postgres: applying them to carts, placing orders with
// them, freeing a use on cancel, and the admin functions. Only the session (`auth()`) and the
// cookie jar are faked. Every test works on its own throwaway category, products, users and codes
// (named after this run); orders (with their redemptions), users, products, codes and the category
// are removed afterwards.
const visitor = vi.hoisted(() => ({
  userId: null as string | null,
  jar: new Map<string, { value: string }>(),
}))

vi.mock("server-only", () => ({}))
// `@/lib/products` (for escapeLike) imports `connection` from next/server.
vi.mock("next/server", () => ({ connection: async () => {} }))
vi.mock("@/auth", () => ({
  auth: async () => (visitor.userId ? { user: { id: visitor.userId }, expires: "2099-01-01T00:00:00.000Z" } : null),
}))
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (visitor.jar.has(name) ? { name, value: visitor.jar.get(name)!.value } : undefined),
    has: (name: string) => visitor.jar.has(name),
    set: (name: string, value: string) => visitor.jar.set(name, { value }),
    delete: (name: string) => visitor.jar.delete(name),
  }),
}))

if (!process.env.DATABASE_URL) process.loadEnvFile(".env.local")

const { getPool, query } = await import("@/lib/db")
const cart = await import("@/lib/cart")
const orders = await import("@/lib/orders")
const discounts = await import("@/lib/discounts")
const { ConflictError, UnauthorizedError } = await import("@/lib/errors")
const { CheckoutSchema } = await import("@/lib/validation/checkout")
const { DiscountCodeFormSchema } = await import("@/lib/validation/discounts")

const run = Array.from({ length: 8 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join("")
let categoryId: string
let admin: { id: string }
const userIds: string[] = []
const codeIds: string[] = []
let productCount = 0
let codeCount = 0

const checkout = (overrides: Record<string, string> = {}) =>
  CheckoutSchema.parse({
    fullName: "Ada Lovelace",
    line1: "12 Analytical Row",
    line2: "",
    city: "London",
    postalCode: "EC1A 1BB",
    country: "GB",
    phone: "+44 20 7946 0958",
    shippingMethodId: "standard",
    paymentMethodId: "cards",
    ...overrides,
  })

async function makeProduct({ price = 1000, stock = 10 }: { price?: number; stock?: number } = {}) {
  productCount += 1
  const { rows } = await query<{ id: string }>(
    `INSERT INTO products (slug, name, brand, category_id, short_description, description, price_cents, stock)
     VALUES ($1, $2, 'Testco', $3, 'Short', 'Long description.', $4, $5)
     RETURNING id`,
    [`discounts-${run.toLowerCase()}-${productCount}`, `Discount product ${productCount}`, categoryId, price, stock],
  )
  return rows[0].id
}

async function makeUser(role: "user" | "admin" = "user") {
  const { rows } = await query<{ id: string }>(
    `INSERT INTO users (first_name, last_name, email, password_hash, role)
     VALUES ('Discount', 'Tester', $1, 'not-a-real-hash', $2) RETURNING id`,
    [`discounts-${run.toLowerCase()}-${userIds.length}@example.com`, role],
  )
  userIds.push(rows[0].id)
  return rows[0].id
}

/** A code named after this run; `overrides` uses the form's fields (strings, as typed). */
async function makeCode(overrides: Record<string, unknown> = {}) {
  codeCount += 1
  const input = DiscountCodeFormSchema.parse({
    code: `T${run}${codeCount}`,
    type: "percent",
    value: "10",
    perUserLimit: "1",
    active: true,
    ...overrides,
  })
  const created = await discounts.createDiscountCode(input)
  codeIds.push(created.id)
  return { ...created, input }
}

/** Replaces the user's cart with these lines, and the cart's code with `code`. */
async function fillCart(userId: string, lines: [productId: string, quantity: number][], code: string | null = null) {
  const { rows } = await query<{ id: string }>(
    `INSERT INTO carts (user_id, discount_code) VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET discount_code = EXCLUDED.discount_code RETURNING id`,
    [userId, code],
  )
  await query("DELETE FROM cart_items WHERE cart_id = $1", [rows[0].id])
  for (const [productId, quantity] of lines) {
    await query("INSERT INTO cart_items (cart_id, product_id, quantity) VALUES ($1, $2, $3)", [rows[0].id, productId, quantity])
  }
}

async function cartCode(userId: string) {
  const { rows } = await query<{ discount_code: string | null }>("SELECT discount_code FROM carts WHERE user_id = $1", [userId])
  return rows[0]?.discount_code
}

async function redemptions(codeId: string) {
  const { rows } = await query<{ order_id: string; user_id: string; amount_cents: number }>(
    "SELECT order_id, user_id, amount_cents FROM discount_redemptions WHERE code_id = $1 ORDER BY created_at",
    [codeId],
  )
  return rows
}

async function orderCount(userId: string) {
  const { rows } = await query<{ n: number }>("SELECT count(*)::int AS n FROM orders WHERE user_id = $1", [userId])
  return rows[0].n
}

async function stock(productId: string) {
  const { rows } = await query<{ stock: number }>("SELECT stock FROM products WHERE id = $1", [productId])
  return rows[0].stock
}

const asUser = (userId: string) => (visitor.userId = userId)
const asGuest = () => {
  visitor.userId = null
  visitor.jar.clear()
}

beforeAll(async () => {
  const { rows } = await query<{ id: string }>(
    "INSERT INTO categories (slug, name, icon, position) VALUES ($1, $2, 'box', 999) RETURNING id",
    [`discounts-${run.toLowerCase()}`, `Discounts test ${run}`],
  )
  categoryId = rows[0].id
  admin = { id: await makeUser("admin") }
})

afterAll(async () => {
  // Redemptions, items and events go with their orders; carts with their users.
  await query("DELETE FROM orders WHERE user_id = ANY($1::uuid[])", [userIds])
  await query("DELETE FROM users WHERE id = ANY($1::uuid[])", [userIds])
  await query("DELETE FROM discount_codes WHERE id = ANY($1::uuid[]) OR code LIKE $2", [codeIds, `T${run}%`])
  await query("DELETE FROM products WHERE category_id = $1", [categoryId])
  await query("DELETE FROM categories WHERE id = $1", [categoryId])
  await getPool().end()
})

beforeEach(() => asGuest())

describe("placeOrder with a discount code", () => {
  it("charges the discount, snapshots it, writes a redemption and takes the code out of the cart", async () => {
    const user = await makeUser()
    const product = await makeProduct({ price: 1999 })
    const { id: codeId, code } = await makeCode({ value: "15" })
    await fillCart(user, [[product, 2]], code)

    const { id: orderId, number } = await orders.placeOrder(user, checkout())

    // 2 × 19.99 = 39.98; 15% = 5.997 → 6.00; under $50, so standard shipping is charged.
    const order = await orders.getOrderForUser(user, number)
    expect(order).toMatchObject({
      subtotalCents: 3998,
      discountCode: code,
      discountCents: 600,
      shippingCents: 599,
      totalCents: 3998 - 600 + 599,
    })
    expect(await redemptions(codeId)).toEqual([{ order_id: orderId, user_id: user, amount_cents: 600 }])
    expect(await cartCode(user)).toBeNull()
    expect((await orders.listOrdersForUser(user)).items[0]).toMatchObject({ discountCode: code, discountCents: 600 })
  })

  it("waives shipping with a free-shipping code and records what it saved", async () => {
    const user = await makeUser()
    const product = await makeProduct({ price: 1000 })
    const { id: codeId, code } = await makeCode({ type: "free_shipping", value: "" })
    await fillCart(user, [[product, 1]], code)

    const { number } = await orders.placeOrder(user, checkout({ shippingMethodId: "express" }))

    expect(await orders.getOrder(number)).toMatchObject({
      discountCode: code,
      discountCents: 0,
      shippingCents: 0,
      totalCents: 1000,
      shippingMethod: { id: "express", priceCents: 1299 },
    })
    expect((await redemptions(codeId))[0].amount_cents).toBe(1299)
  })

  it("caps a fixed code at the subtotal", async () => {
    const user = await makeUser()
    const product = await makeProduct({ price: 800 })
    const { code } = await makeCode({ type: "fixed", value: "15" })
    await fillCart(user, [[product, 1]], code)

    const { number } = await orders.placeOrder(user, checkout({ shippingMethodId: "pickup" }))

    expect(await orders.getOrder(number)).toMatchObject({ subtotalCents: 800, discountCents: 800, totalCents: 0 })
  })

  it("places an order without a code exactly as before", async () => {
    const user = await makeUser()
    await fillCart(user, [[await makeProduct({ price: 1000 }), 1]])

    const { number } = await orders.placeOrder(user, checkout())

    expect(await orders.getOrder(number)).toMatchObject({ discountCode: null, discountCents: 0, totalCents: 1599 })
  })

  it("refuses a second use past the per-customer limit, writing nothing", async () => {
    const user = await makeUser()
    const product = await makeProduct({ stock: 5 })
    const { id: codeId, code } = await makeCode()
    await fillCart(user, [[product, 1]], code)
    await orders.placeOrder(user, checkout())

    await fillCart(user, [[product, 1]], code)
    const err = await orders.placeOrder(user, checkout()).catch((e: unknown) => e)

    expect(err).toBeInstanceOf(discounts.DiscountCodeError)
    expect(err).toMatchObject({ status: 409, message: `You've already used ${code}.`, problem: { reason: "already_used" } })
    expect(await orderCount(user)).toBe(1)
    expect(await stock(product)).toBe(4)
    expect(await redemptions(codeId)).toHaveLength(1)
    // The failed checkout rolled back: the cart still holds its lines and code.
    expect(await cartCode(user)).toBe(code)
  })

  it.each([
    ["deactivated", { active: false }, (code: string) => `${code} is no longer available.`],
    ["expired", { endsOn: "2020-01-01" }, (code: string) => `${code} has expired.`],
    ["not started", { startsOn: "2099-01-01" }, (code: string) => `${code} can't be used yet. It starts on Jan 1, 2099.`],
  ])("refuses a code that was %s after it was applied, writing nothing", async (_label, change, message) => {
    const user = await makeUser()
    const product = await makeProduct({ stock: 3 })
    const { id: codeId, code, input } = await makeCode()
    await fillCart(user, [[product, 1]], code)
    await discounts.updateDiscountCode(
      codeId,
      DiscountCodeFormSchema.parse({ code, type: input.type, value: String(input.value), perUserLimit: "1", active: true, ...change }),
    )

    await expect(orders.placeOrder(user, checkout())).rejects.toMatchObject({ status: 409, message: message(code) })

    expect(await orderCount(user)).toBe(0)
    expect(await stock(product)).toBe(3)
    expect(await redemptions(codeId)).toEqual([])
  })

  it("refuses a code whose minimum the live prices no longer reach, saying how much is missing", async () => {
    const user = await makeUser()
    const product = await makeProduct({ price: 3000 })
    const { code } = await makeCode({ minSubtotal: "30" })
    await fillCart(user, [[product, 1]], code)
    await query("UPDATE products SET price_cents = 2950 WHERE id = $1", [product])

    await expect(orders.placeOrder(user, checkout())).rejects.toMatchObject({
      message: `${code} needs a subtotal of at least $30.00. Add $0.50 more to use it.`,
    })
    expect(await orderCount(user)).toBe(0)
  })

  it("refuses a code that was deleted after it was applied", async () => {
    const user = await makeUser()
    const { id: codeId, code } = await makeCode()
    await fillCart(user, [[await makeProduct(), 1]], code)
    await discounts.deleteDiscountCode(codeId)

    await expect(orders.placeOrder(user, checkout())).rejects.toMatchObject({
      message: `${code} isn't a valid discount code.`,
    })
    expect(await orderCount(user)).toBe(0)
  })

  it("lets exactly one of two concurrent checkouts take a code's last use", async () => {
    const [first, second] = [await makeUser(), await makeUser()]
    const product = await makeProduct({ stock: 10 })
    const { id: codeId, code } = await makeCode({ maxRedemptions: "1", perUserLimit: "" })
    await fillCart(first, [[product, 1]], code)
    await fillCart(second, [[product, 1]], code)

    const results = await Promise.allSettled([orders.placeOrder(first, checkout()), orders.placeOrder(second, checkout())])

    const won = results.filter((r) => r.status === "fulfilled")
    const lost = results.filter((r): r is PromiseRejectedResult => r.status === "rejected")
    expect(won).toHaveLength(1)
    expect(lost).toHaveLength(1)
    expect(lost[0].reason).toMatchObject({ message: `${code} has reached its usage limit.`, problem: { reason: "max_redemptions" } })
    expect(await redemptions(codeId)).toHaveLength(1)
    expect((await orderCount(first)) + (await orderCount(second))).toBe(1)
    expect(await stock(product)).toBe(9)
  })

  it("gives the use back when the customer cancels, keeping the order's snapshot", async () => {
    const user = await makeUser()
    const product = await makeProduct({ price: 4000 })
    const { id: codeId, code } = await makeCode()
    await fillCart(user, [[product, 1]], code)
    const { number } = await orders.placeOrder(user, checkout())

    await orders.cancelOrderAsCustomer(user, number)

    expect(await redemptions(codeId)).toEqual([])
    expect(await orders.getOrder(number)).toMatchObject({ status: "cancelled", discountCode: code, discountCents: 400 })
    // The per-customer limit of 1 counts only orders that stand, so the code works again.
    await fillCart(user, [[product, 1]], code)
    const again = await orders.placeOrder(user, checkout())
    expect(await redemptions(codeId)).toEqual([expect.objectContaining({ order_id: again.id })])
  })

  it("gives the use back when an admin rejects the order, but not on other changes", async () => {
    const user = await makeUser()
    const { id: codeId, code } = await makeCode({ maxRedemptions: "1" })
    await fillCart(user, [[await makeProduct(), 1]], code)
    const { number } = await orders.placeOrder(user, checkout())

    await orders.changeOrderStatus(number, { status: "processing" }, { userId: admin.id, role: "admin" })
    expect(await redemptions(codeId)).toHaveLength(1)
    expect((await discounts.getDiscountCode(codeId))?.redemptionCount).toBe(1)

    await orders.changeOrderStatus(number, { status: "rejected" }, { userId: admin.id, role: "admin" })
    expect(await redemptions(codeId)).toEqual([])
    expect((await discounts.getDiscountCode(codeId))?.redemptionCount).toBe(0)
  })
})

describe("discount codes in the cart", () => {
  it("applies a code typed in any case, keeps it across reads and shows it in the cart", async () => {
    const user = await makeUser()
    asUser(user)
    await cart.addToCart(await makeProduct({ price: 4000 }))
    const { code } = await makeCode({ minSubtotal: "30" })

    const rule = await cart.applyDiscountCode(`  ${code.toLowerCase()} `)

    expect(rule).toEqual({ code, type: "percent", value: 10, minSubtotalCents: 3000 })
    expect(await cartCode(user)).toBe(code)
    for (let i = 0; i < 2; i++) {
      const current = await cart.getCart()
      expect(current.discount).toEqual(rule)
      expect(current.discountNotice).toBeUndefined()
    }
  })

  it("replaces the cart's code with a new one, and removes it", async () => {
    const user = await makeUser()
    asUser(user)
    await cart.addToCart(await makeProduct())
    const first = await makeCode()
    const second = await makeCode({ type: "free_shipping", value: "" })

    await cart.applyDiscountCode(first.code)
    await cart.applyDiscountCode(second.code)
    expect((await cart.getCart()).discount?.code).toBe(second.code)

    await cart.removeDiscountCode()
    expect(await cartCode(user)).toBeNull()
    expect((await cart.getCart()).discount).toBeUndefined()
  })

  it("refuses codes it can't apply, leaving the cart's code as it was", async () => {
    const user = await makeUser()
    asUser(user)
    await cart.addToCart(await makeProduct({ price: 1000 }))
    const kept = await makeCode()
    await cart.applyDiscountCode(kept.code)
    const minimum = await makeCode({ minSubtotal: "30" })
    const inactive = await makeCode({ active: false })

    await expect(cart.applyDiscountCode(`NOPE${run}`)).rejects.toMatchObject({
      message: `NOPE${run} isn't a valid discount code.`,
    })
    await expect(cart.applyDiscountCode(minimum.code)).rejects.toMatchObject({
      message: `${minimum.code} needs a subtotal of at least $30.00. Add $20.00 more to use it.`,
    })
    await expect(cart.applyDiscountCode(inactive.code)).rejects.toBeInstanceOf(discounts.DiscountCodeError)
    expect(await cartCode(user)).toBe(kept.code)
  })

  it("refuses a code already used up by this customer", async () => {
    const user = await makeUser()
    const product = await makeProduct()
    const { code } = await makeCode()
    await fillCart(user, [[product, 1]], code)
    await orders.placeOrder(user, checkout())

    asUser(user)
    await cart.addToCart(product)
    await expect(cart.applyDiscountCode(code)).rejects.toMatchObject({ message: `You've already used ${code}.` })
  })

  it("needs a signed-in customer with something in the cart", async () => {
    const { code } = await makeCode()
    await cart.addToCart(await makeProduct())
    await expect(cart.applyDiscountCode(code)).rejects.toBeInstanceOf(UnauthorizedError)
    // Removing as a guest is a no-op.
    await expect(cart.removeDiscountCode()).resolves.toBeUndefined()
    await query("DELETE FROM carts WHERE id = $1", [visitor.jar.get(cart.CART_COOKIE)!.value])

    asUser(await makeUser())
    await expect(cart.applyDiscountCode(code)).rejects.toEqual(new ConflictError("Your cart is empty."))
  })

  it("drops a code that stopped applying on the next read, saying why once", async () => {
    const user = await makeUser()
    asUser(user)
    await cart.addToCart(await makeProduct())
    const { id: codeId, code } = await makeCode()
    await cart.applyDiscountCode(code)
    await discounts.setDiscountCodeActive(codeId, false)

    const current = await cart.getCart()

    expect(current.discount).toBeUndefined()
    expect(current.discountNotice).toBe(`${code} is no longer available. We've removed it from your cart.`)
    expect(await cartCode(user)).toBeNull()
    expect((await cart.getCart()).discountNotice).toBeUndefined()
  })

  it("drops a code once the cart falls below its minimum, saying how much more it needs", async () => {
    const user = await makeUser()
    asUser(user)
    const product = await makeProduct({ price: 1500 })
    await cart.addToCart(product, 2)
    const { code } = await makeCode({ minSubtotal: "30" })
    await cart.applyDiscountCode(code)
    expect((await cart.getCart()).discount?.code).toBe(code)

    await cart.setQuantity(product, 1)
    const current = await cart.getCart()

    expect(current.discount).toBeUndefined()
    expect(current.discountNotice).toBe(
      `${code} needs a subtotal of at least $30.00. Add $15.00 more to use it. We've removed it from your cart.`,
    )
  })
})

describe("admin discount codes", () => {
  it("creates, lists, updates and toggles a code", async () => {
    const { id, code } = await makeCode({ description: "Launch", type: "fixed", value: "12.5", minSubtotal: "40", maxRedemptions: "3" })

    expect(await discounts.getDiscountCode(id)).toMatchObject({
      code,
      description: "Launch",
      type: "fixed",
      value: 1250,
      minSubtotalCents: 4000,
      maxRedemptions: 3,
      perUserLimit: 1,
      active: true,
      redemptionCount: 0,
    })
    expect((await discounts.listDiscountCodes()).map((c) => c.code)).toContain(code)

    await discounts.updateDiscountCode(
      id,
      DiscountCodeFormSchema.parse({ code: `${code}X`, type: "percent", value: "5", perUserLimit: "", active: true }),
    )
    expect(await discounts.getDiscountCode(id)).toMatchObject({ code: `${code}X`, type: "percent", value: 5, perUserLimit: null })

    expect(await discounts.setDiscountCodeActive(id, false)).toEqual({ code: `${code}X`, active: false })
  })

  it("refuses a code that's taken, whatever its case", async () => {
    const { code } = await makeCode()
    const duplicate = DiscountCodeFormSchema.parse({ code: code.toLowerCase(), type: "percent", value: "5", active: true })
    await expect(discounts.createDiscountCode(duplicate)).rejects.toBeInstanceOf(discounts.CodeTakenError)

    const other = await makeCode()
    await expect(discounts.updateDiscountCode(other.id, duplicate)).rejects.toBeInstanceOf(discounts.CodeTakenError)
  })

  it("reports unknown ids", async () => {
    const id = "00000000-0000-4000-8000-000000000000"
    const input = DiscountCodeFormSchema.parse({ code: `GONE${run}`, type: "percent", value: "5", active: true })
    expect(await discounts.getDiscountCode(id)).toBeNull()
    await expect(discounts.updateDiscountCode(id, input)).rejects.toMatchObject({ status: 404 })
    await expect(discounts.setDiscountCodeActive(id, true)).rejects.toMatchObject({ status: 404 })
    await expect(discounts.deleteDiscountCode(id)).rejects.toMatchObject({ status: 404 })
  })

  it("deletes a code only while it has no redemptions", async () => {
    const user = await makeUser()
    const { id, code } = await makeCode()
    await fillCart(user, [[await makeProduct(), 1]], code)
    const { number } = await orders.placeOrder(user, checkout())

    await expect(discounts.deleteDiscountCode(id)).rejects.toMatchObject({
      message: "This code has been used 1 time, so it can't be deleted. Deactivate it instead.",
    })
    expect(await discounts.getDiscountCode(id)).not.toBeNull()

    await orders.cancelOrderAsCustomer(user, number)
    expect(await discounts.deleteDiscountCode(id)).toEqual({ code })
    expect(await discounts.getDiscountCode(id)).toBeNull()
    // The cancelled order still shows the code it was placed with.
    expect(await orders.getOrder(number)).toMatchObject({ discountCode: code })
  })
})
