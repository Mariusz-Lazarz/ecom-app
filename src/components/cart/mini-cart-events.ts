// The header's mini-cart listens for this window event, so any client component (e.g. an
// add-to-cart toast) can open it without sharing state with the header.
export const OPEN_MINI_CART_EVENT = "northcart:open-mini-cart"

export function openMiniCart() {
  window.dispatchEvent(new Event(OPEN_MINI_CART_EVENT))
}
