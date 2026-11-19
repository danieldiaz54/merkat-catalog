import { MongoClient, type Collection, type Db } from "mongodb";
import type { ProductRepositoryPort } from "../../application/ports/CatalogPorts.js";
import type { CartDocument } from "../../domain/entities/CartDocument.js";
import {
  matchesCatalogQuery,
  type CatalogFilterQuery,
  type EmbeddedReview,
  type ProductDocument,
} from "../../domain/entities/ProductDocument.js";
import { createSeedCatalogDocuments } from "../seed/SeedCatalogData.js";

/** Official MongoDB Driver adapter persisting polymorphic product documents and embedded reviews. */
export class MongoProductRepository implements ProductRepositoryPort {
  public readonly engineLabel = "MongoDB Driver" as const;
  private readonly client: MongoClient;
  private db: Db | null = null;

  public constructor(uri: string) {
    this.client = new MongoClient(uri, { serverSelectionTimeoutMS: 4000 });
  }

  public async connectAndSeed(): Promise<void> {
    await this.client.connect();
    this.db = this.client.db("merkat_catalog");
    const col = this.productsCol();
    const existing = await col.countDocuments();
    if (existing === 0) {
      await col.insertMany(createSeedCatalogDocuments());
    }
    await col.createIndex({ sku: 1 }, { unique: true });
    await col.createIndex({ category: 1, priceCents: 1 });
  }

  private productsCol(): Collection<ProductDocument> {
    if (!this.db) {
      throw new Error("MongoDB client not connected");
    }
    return this.db.collection<ProductDocument>("products");
  }

  private cartsCol(): Collection<CartDocument> {
    if (!this.db) {
      throw new Error("MongoDB client not connected");
    }
    return this.db.collection<CartDocument>("carts");
  }

  public async findProducts(query: CatalogFilterQuery): Promise<ProductDocument[]> {
    const mongoFilter: Record<string, unknown> = {};
    if (query.category) {
      mongoFilter["category"] = query.category;
    }
    if (query.maxPriceCents !== undefined) {
      mongoFilter["priceCents"] = { $lte: query.maxPriceCents };
    }
    const docs = await this.productsCol()
      .find(mongoFilter, { projection: { _id: 0 } })
      .toArray();
    return docs.filter((doc) => matchesCatalogQuery(doc, query));
  }

  public async findBySku(sku: string): Promise<ProductDocument | null> {
    return this.productsCol().findOne({ sku }, { projection: { _id: 0 } });
  }

  public async appendReview(
    sku: string,
    review: EmbeddedReview,
  ): Promise<ProductDocument | null> {
    await this.productsCol().updateOne(
      { sku },
      {
        $push: {
          reviews: {
            $each: [review],
            $position: 0,
          },
        },
      },
    );
    return this.findBySku(sku);
  }

  public async decrementStock(sku: string, qty: number): Promise<void> {
    await this.productsCol().updateOne(
      { sku, stock: { $gte: qty } },
      { $inc: { stock: -qty } },
    );
  }

  public async getCart(sessionId: string): Promise<CartDocument> {
    const found = await this.cartsCol().findOne(
      { sessionId },
      { projection: { _id: 0 } },
    );
    return (
      found ?? {
        sessionId,
        items: [],
        updatedAtIso: new Date().toISOString(),
      }
    );
  }

  public async saveCart(cart: CartDocument): Promise<CartDocument> {
    await this.cartsCol().updateOne(
      { sessionId: cart.sessionId },
      { $set: cart },
      { upsert: true },
    );
    return cart;
  }

  public async countProducts(): Promise<number> {
    return this.productsCol().countDocuments();
  }
}
