export const inventoryProductFocusId = (productId: string) => `inventory-product-${productId}`;

/** A sort can replace the original button in another render group. */
export function restoreInventoryProductFocus(productId: string) {
  requestAnimationFrame(() => {
    // Preserve native restoration and any newer user/dialog focus.
    if (document.activeElement === document.body) {
      document.getElementById(inventoryProductFocusId(productId))?.focus({ preventScroll: true });
    }
  });
}
