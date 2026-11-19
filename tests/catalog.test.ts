import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { CatalogService } from "../src/application/services/CatalogService.js";
import { CatalogDomainError } from "../src/domain/errors/CatalogDomainError.js";
import { TtlReadCacheAdapter } from "../src/infrastructure/cache/TtlReadCacheAdapter.js";
import { EmbeddedDocumentRepository } from "../src/infrastructure/nosql/EmbeddedDocumentRepository.js";
import { createMerkatHttpServer } from "../src/interfaces/http/server.js";

function createTestService(): CatalogService {
  return new CatalogService(
    new EmbeddedDocumentRepository(),
    new TtlReadCacheAdapter(),
  );
}

describe("Merkat Catalog NoSQL & CQRS Suite", () => {
  it("filters polymorphic category schemas and computes dynamic facets", async () => {
    const svc = createTestService();
    const tech = await svc.queryCatalog({ category: "tecnologia" });
    expect(tech.items).toHaveLength(3);
    expect(tech.facets.some((f) => f.key === "chip")).toBe(true);
    expect(tech.facets.some((f) => f.key === "madera")).toBe(false);

    const fashion = await svc.queryCatalog({
      category: "moda",
      specKey: "material",
      specVal: "Algodón orgánico",
    });
    expect(fashion.items).toHaveLength(2);
  });

  it("uses CQRS read-aside cache and invalidates on embedded review write", async () => {
    const svc = createTestService();
    const first = await svc.queryCatalog({ category: "hogar" });
    expect(first.cacheStatus).toBe("MISS");

    const second = await svc.queryCatalog({ category: "hogar" });
    expect(second.cacheStatus).toBe("HIT");
    expect(second.cacheStats.hits).toBe(1);

    const updated = await svc.addReview(
      "HOG-MESA-NORD",
      "Camila Ortiz",
      5,
      "Acabado de roble sólido impecable.",
    );
    expect(updated.reviews[0]?.author).toBe("Camila Ortiz");

    const third = await svc.queryCatalog({ category: "hogar" });
    expect(third.cacheStatus).toBe("MISS");
  });

  it("enforces cart stock invariants and completes checkout atomically", async () => {
    const svc = createTestService();
    await expect(
      svc.updateCartItem("sess-99", "TEC-STUDIO-32", 99),
    ).rejects.toThrow(CatalogDomainError);

    const added = await svc.updateCartItem("sess-99", "TEC-STUDIO-32", 2);
    expect(added.totalCents).toBe(430_000);

    const receipt = await svc.checkoutCart("sess-99");
    expect(receipt.itemsCount).toBe(2);
    expect(receipt.totalCents).toBe(430_000);

    const postProduct = await svc.getProduct("TEC-STUDIO-32");
    expect(postProduct.stock).toBe(2);
  });

  it("serves HTML storefront and JSON REST API over HTTP", async () => {
    const svc = createTestService();
    const server = createMerkatHttpServer(svc);
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const addr = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    try {
      const htmlRes = await fetch(`${baseUrl}/`);
      expect(htmlRes.status).toBe(200);
      const html = await htmlRes.text();
      expect(html).toContain("Merkat");
      expect(html).toContain("Bodoni Moda");

      const prodRes = await fetch(`${baseUrl}/api/v1/products?category=moda`);
      expect(prodRes.status).toBe(200);
      const body = (await prodRes.json()) as { items: unknown[] };
      expect(body.items).toHaveLength(3);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });
});
