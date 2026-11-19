import { CatalogService } from "./application/services/CatalogService.js";
import type { ProductRepositoryPort } from "./application/ports/CatalogPorts.js";
import { TtlReadCacheAdapter } from "./infrastructure/cache/TtlReadCacheAdapter.js";
import { EmbeddedDocumentRepository } from "./infrastructure/nosql/EmbeddedDocumentRepository.js";
import { MongoProductRepository } from "./infrastructure/nosql/MongoProductRepository.js";
import { createMerkatHttpServer } from "./interfaces/http/server.js";

async function bootstrap(): Promise<void> {
  const port = Number(process.env["PORT"] ?? "8099");
  const mongoUri = process.env["MONGODB_URI"]?.trim();

  let repo: ProductRepositoryPort;
  if (mongoUri) {
    const mongoRepo = new MongoProductRepository(mongoUri);
    try {
      await mongoRepo.connectAndSeed();
      repo = mongoRepo;
    } catch {
      repo = new EmbeddedDocumentRepository();
    }
  } else {
    repo = new EmbeddedDocumentRepository();
  }

  const cache = new TtlReadCacheAdapter();
  const service = new CatalogService(repo, cache);
  const server = createMerkatHttpServer(service);

  server.listen(port, "0.0.0.0", () => {
    console.log(`Merkat Catalog listening on :${port} (${repo.engineLabel})`);
  });
}

bootstrap().catch((err) => {
  console.error("Failed to start Merkat Catalog:", err);
  process.exit(1);
});
