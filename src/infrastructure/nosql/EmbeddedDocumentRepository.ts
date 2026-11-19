import type { ProductRepositoryPort } from "../../application/ports/CatalogPorts.js";
import type { CartDocument } from "../../domain/entities/CartDocument.js";
import {
  matchesCatalogQuery,
  type CatalogFilterQuery,
  type EmbeddedReview,
  type ProductDocument,
} from "../../domain/entities/ProductDocument.js";
import { createSeedCatalogDocuments } from "../seed/SeedCatalogData.js";

function cloneProduct(doc: ProductDocument): ProductDocument {
  return {
    ...doc,
    reviews: doc.reviews.map((r) => ({ ...r })),
  };
}

/** Portable in-memory MongoDB-compatible NoSQL document store for single-container deployment. */
export class EmbeddedDocumentRepository implements ProductRepositoryPort {
  public readonly engineLabel = "In-Memory NoSQL Document Store" as const;
  private readonly products = new Map<string, ProductDocument>();
  private readonly carts = new Map<string, CartDocument>();

  public constructor() {
    for (const item of createSeedCatalogDocuments()) {
      this.products.set(item.sku, cloneProduct(item));
    }
  }

  public async findProducts(query: CatalogFilterQuery): Promise<ProductDocument[]> {
    const out: ProductDocument[] = [];
    for (const doc of this.products.values()) {
      if (matchesCatalogQuery(doc, query)) {
        out.push(cloneProduct(doc));
      }
    }
    return out;
  }

  public async findBySku(sku: string): Promise<ProductDocument | null> {
    const found = this.products.get(sku);
    return found ? cloneProduct(found) : null;
  }

  public async appendReview(
    sku: string,
    review: EmbeddedReview,
  ): Promise<ProductDocument | null> {
    const existing = this.products.get(sku);
    if (!existing) {
      return null;
    }
    existing.reviews = [review, ...existing.reviews];
    return cloneProduct(existing);
  }

  public async decrementStock(sku: string, qty: number): Promise<void> {
    const existing = this.products.get(sku);
    if (!existing) return;
    const updated: ProductDocument = {
      ...existing,
      stock: Math.max(0, existing.stock - qty),
    };
    this.products.set(sku, updated);
  }

  public async getCart(sessionId: string): Promise<CartDocument> {
    const existing = this.carts.get(sessionId);
    if (!existing) {
      return {
        sessionId,
        items: [],
        updatedAtIso: new Date().toISOString(),
      };
    }
    return {
      sessionId: existing.sessionId,
      items: existing.items.map((item) => ({ ...item })),
      updatedAtIso: existing.updatedAtIso,
    };
  }

  public async saveCart(cart: CartDocument): Promise<CartDocument> {
    const copy: CartDocument = {
      sessionId: cart.sessionId,
      items: cart.items.map((item) => ({ ...item })),
      updatedAtIso: cart.updatedAtIso,
    };
    this.carts.set(cart.sessionId, copy);
    return {
      sessionId: copy.sessionId,
      items: copy.items.map((item) => ({ ...item })),
      updatedAtIso: copy.updatedAtIso,
    };
  }

  public async countProducts(): Promise<number> {
    return this.products.size;
  }
}
