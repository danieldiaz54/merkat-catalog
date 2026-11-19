import { CatalogDomainError } from "../errors/CatalogDomainError.js";
import type { ProductDocument } from "./ProductDocument.js";

export interface CartLineItem {
  readonly sku: string;
  readonly name: string;
  readonly unitPriceCents: number;
  readonly quantity: number;
}

export interface CartDocument {
  readonly sessionId: string;
  items: CartLineItem[];
  readonly updatedAtIso: string;
}

export function normalizeSessionId(raw: string): string {
  const cleaned = raw.trim().replace(/[^a-zA-Z0-9_-]/g, "");
  return cleaned.length >= 2 && cleaned.length <= 48 ? cleaned : "guest-session";
}

export function upsertCartItem(
  cart: CartDocument,
  product: ProductDocument,
  quantity: number,
  nowIso: string,
): CartDocument {
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > 20) {
    throw new CatalogDomainError(
      "INVALID_CART_ITEM",
      "La cantidad debe ser un entero entre 0 y 20.",
      422,
    );
  }
  if (quantity > product.stock) {
    throw new CatalogDomainError(
      "INSUFFICIENT_STOCK",
      `Solo quedan ${product.stock} unidad(es) disponibles de ${product.name}.`,
      409,
    );
  }

  const nextItems = cart.items.filter((item) => item.sku !== product.sku);
  if (quantity > 0) {
    nextItems.push({
      sku: product.sku,
      name: product.name,
      unitPriceCents: product.priceCents,
      quantity,
    });
  }

  return {
    sessionId: cart.sessionId,
    items: nextItems,
    updatedAtIso: nowIso,
  };
}

export function calculateCartTotalCents(cart: CartDocument): number {
  return cart.items.reduce(
    (sum, item) => sum + item.unitPriceCents * item.quantity,
    0,
  );
}
