import type { CartDocument } from "../../domain/entities/CartDocument.js";
import type {
  CatalogFilterQuery,
  EmbeddedReview,
  ProductDocument,
} from "../../domain/entities/ProductDocument.js";

export interface ProductRepositoryPort {
  readonly engineLabel: "MongoDB Driver" | "In-Memory NoSQL Document Store";
  findProducts(query: CatalogFilterQuery): Promise<ProductDocument[]>;
  findBySku(sku: string): Promise<ProductDocument | null>;
  appendReview(sku: string, review: EmbeddedReview): Promise<ProductDocument | null>;
  decrementStock(sku: string, qty: number): Promise<void>;
  getCart(sessionId: string): Promise<CartDocument>;
  saveCart(cart: CartDocument): Promise<CartDocument>;
  countProducts(): Promise<number>;
}

export interface CacheStats {
  readonly hits: number;
  readonly misses: number;
  readonly entries: number;
}

export interface CachePort {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlMs: number): Promise<void>;
  invalidatePrefix(prefix: string): Promise<void>;
  stats(): CacheStats;
}
