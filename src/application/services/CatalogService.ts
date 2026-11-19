import {
  calculateCartTotalCents,
  normalizeSessionId,
  upsertCartItem,
  type CartDocument,
} from "../../domain/entities/CartDocument.js";
import {
  computeCategoryFacets,
  normalizeSku,
  validateReviewInput,
  type CatalogFilterQuery,
  type CategoryFacetGroup,
  type ProductDocument,
} from "../../domain/entities/ProductDocument.js";
import { CatalogDomainError } from "../../domain/errors/CatalogDomainError.js";
import type { CachePort, CacheStats, ProductRepositoryPort } from "../ports/CatalogPorts.js";

export interface CatalogQueryResult {
  readonly items: ProductDocument[];
  readonly facets: CategoryFacetGroup[];
  readonly mongoFilter: Record<string, unknown>;
  readonly cacheStatus: "HIT" | "MISS";
  readonly cacheStats: CacheStats;
  readonly latencyMs: number;
}

export interface CheckoutReceipt {
  readonly orderId: string;
  readonly sessionId: string;
  readonly itemsCount: number;
  readonly totalCents: number;
  readonly purchasedAtIso: string;
}

function buildCacheKey(query: CatalogFilterQuery): string {
  return `products:${query.category ?? "all"}:${query.searchText ?? ""}:${query.specKey ?? ""}:${query.specVal ?? ""}:${query.maxPriceCents ?? ""}`;
}

export function buildMongoFilterDebugDoc(
  query: CatalogFilterQuery,
): Record<string, unknown> {
  const filter: Record<string, unknown> = {};
  if (query.category) {
    filter["category"] = query.category;
  }
  if (query.specKey && query.specVal) {
    filter[`specs.${query.specKey}`] = query.specVal;
  }
  if (query.maxPriceCents !== undefined) {
    filter["priceCents"] = { $lte: query.maxPriceCents };
  }
  if (query.searchText) {
    filter["$text"] = { $search: query.searchText };
  }
  return filter;
}

/** Application orchestrator unifying NoSQL document queries with CQRS read-aside cache invalidation. */
export class CatalogService {
  private readonly repo: ProductRepositoryPort;
  private readonly cache: CachePort;

  public constructor(repo: ProductRepositoryPort, cache: CachePort) {
    this.repo = repo;
    this.cache = cache;
  }

  public async healthSummary(): Promise<{
    readonly status: "ok";
    readonly engine: string;
    readonly productsCount: number;
    readonly cache: CacheStats;
  }> {
    return {
      status: "ok",
      engine: this.repo.engineLabel,
      productsCount: await this.repo.countProducts(),
      cache: this.cache.stats(),
    };
  }

  public async queryCatalog(query: CatalogFilterQuery): Promise<CatalogQueryResult> {
    const start = performance.now();
    const cacheKey = buildCacheKey(query);
    const cached = await this.cache.get<{
      readonly items: ProductDocument[];
      readonly facets: CategoryFacetGroup[];
    }>(cacheKey);

    const mongoFilter = buildMongoFilterDebugDoc(query);

    if (cached) {
      return {
        items: cached.items,
        facets: cached.facets,
        mongoFilter,
        cacheStatus: "HIT",
        cacheStats: this.cache.stats(),
        latencyMs: Number((performance.now() - start).toFixed(2)),
      };
    }

    const items = await this.repo.findProducts(query);
    // Compute category-aware facets across all docs in selected category (or whole catalog)
    const facetScope =
      query.specKey || query.searchText || query.maxPriceCents !== undefined
        ? await this.repo.findProducts({ category: query.category })
        : items;
    const facets = computeCategoryFacets(facetScope);

    await this.cache.set(cacheKey, { items, facets }, 30_000);

    return {
      items,
      facets,
      mongoFilter,
      cacheStatus: "MISS",
      cacheStats: this.cache.stats(),
      latencyMs: Number((performance.now() - start).toFixed(2)),
    };
  }

  public async getProduct(rawSku: string): Promise<ProductDocument> {
    const sku = normalizeSku(rawSku);
    const doc = await this.repo.findBySku(sku);
    if (!doc) {
      throw new CatalogDomainError(
        "PRODUCT_NOT_FOUND",
        `No existe un producto con SKU ${sku}.`,
        404,
      );
    }
    return doc;
  }

  public async addReview(
    rawSku: string,
    author: string,
    rating: number,
    comment: string,
  ): Promise<ProductDocument> {
    const sku = normalizeSku(rawSku);
    const nowIso = new Date().toISOString();
    const review = validateReviewInput(
      author,
      rating,
      comment,
      nowIso,
      `REV-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    );

    const updated = await this.repo.appendReview(sku, review);
    if (!updated) {
      throw new CatalogDomainError(
        "PRODUCT_NOT_FOUND",
        `No existe un producto con SKU ${sku}.`,
        404,
      );
    }

    await this.cache.invalidatePrefix("products:");
    return updated;
  }

  public async getCart(rawSessionId: string): Promise<{
    readonly cart: CartDocument;
    readonly totalCents: number;
  }> {
    const sessionId = normalizeSessionId(rawSessionId);
    const cart = await this.repo.getCart(sessionId);
    return { cart, totalCents: calculateCartTotalCents(cart) };
  }

  public async updateCartItem(
    rawSessionId: string,
    rawSku: string,
    quantity: number,
  ): Promise<{ readonly cart: CartDocument; readonly totalCents: number }> {
    const sessionId = normalizeSessionId(rawSessionId);
    const sku = normalizeSku(rawSku);
    const product = await this.repo.findBySku(sku);
    if (!product) {
      throw new CatalogDomainError(
        "PRODUCT_NOT_FOUND",
        `No existe un producto con SKU ${sku}.`,
        404,
      );
    }
    const existing = await this.repo.getCart(sessionId);
    const updated = upsertCartItem(
      existing,
      product,
      quantity,
      new Date().toISOString(),
    );
    const saved = await this.repo.saveCart(updated);
    return { cart: saved, totalCents: calculateCartTotalCents(saved) };
  }

  public async checkoutCart(rawSessionId: string): Promise<CheckoutReceipt> {
    const sessionId = normalizeSessionId(rawSessionId);
    const cart = await this.repo.getCart(sessionId);
    if (cart.items.length === 0) {
      throw new CatalogDomainError(
        "EMPTY_CART",
        "Tu carrito está vacío. Agrega al menos un artículo antes de confirmar.",
        422,
      );
    }

    for (const item of cart.items) {
      const product = await this.repo.findBySku(item.sku);
      if (!product || item.quantity > product.stock) {
        throw new CatalogDomainError(
          "INSUFFICIENT_STOCK",
          `Inventario insuficiente para completar la compra de ${item.name}.`,
          409,
        );
      }
    }

    for (const item of cart.items) {
      await this.repo.decrementStock(item.sku, item.quantity);
    }

    const totalCents = calculateCartTotalCents(cart);
    const itemsCount = cart.items.reduce((acc, i) => acc + i.quantity, 0);
    const nowIso = new Date().toISOString();

    await this.repo.saveCart({
      sessionId,
      items: [],
      updatedAtIso: nowIso,
    });
    await this.cache.invalidatePrefix("products:");

    return {
      orderId: `ORD-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      sessionId,
      itemsCount,
      totalCents,
      purchasedAtIso: nowIso,
    };
  }
}
