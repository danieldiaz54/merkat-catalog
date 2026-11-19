import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { resolve } from "node:path";
import type { CatalogService } from "../../application/services/CatalogService.js";
import type {
  CatalogFilterQuery,
  ProductCategory,
} from "../../domain/entities/ProductDocument.js";
import { CatalogDomainError } from "../../domain/errors/CatalogDomainError.js";

function sendJson(
  res: ServerResponse,
  statusCode: number,
  body: unknown,
): void {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

async function readJsonBody(
  req: IncomingMessage,
): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buf.length;
    if (totalBytes > 65_536) {
      throw new CatalogDomainError("INVALID_REVIEW", "Payload demasiado grande.", 413);
    }
    chunks.push(buf);
  }
  const text = Buffer.concat(chunks).toString("utf-8").trim();
  if (!text) return {};
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new CatalogDomainError("INVALID_REVIEW", "El cuerpo JSON debe ser un objeto.", 400);
    }
    return parsed as Record<string, unknown>;
  } catch (err) {
    if (err instanceof CatalogDomainError) throw err;
    throw new CatalogDomainError("INVALID_REVIEW", "JSON malformado.", 400);
  }
}

function parseCategory(raw: string | null): ProductCategory | undefined {
  if (raw === "tecnologia" || raw === "moda" || raw === "hogar") {
    return raw;
  }
  return undefined;
}

export function createMerkatHttpServer(
  service: CatalogService,
  uiFilePath = resolve(process.cwd(), "ui", "index.html"),
): Server {
  return createServer(async (req, res) => {
    const method = (req.method ?? "GET").toUpperCase();
    if (method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      res.end();
      return;
    }

    const parsedUrl = new URL(req.url ?? "/", "http://localhost");
    const pathname = parsedUrl.pathname.replace(/\/+$/, "") || "/";

    try {
      if (method === "GET" && (pathname === "/" || pathname === "/index.html")) {
        const html = await readFile(uiFilePath, "utf-8");
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
        return;
      }

      if (method === "GET" && pathname === "/api/v1/health") {
        sendJson(res, 200, await service.healthSummary());
        return;
      }

      if (method === "GET" && pathname === "/api/v1/products") {
        const maxPriceRaw = parsedUrl.searchParams.get("maxPriceCents");
        const maxPriceCents =
          maxPriceRaw && /^\d+$/.test(maxPriceRaw)
            ? Number(maxPriceRaw)
            : undefined;
        const query: CatalogFilterQuery = {
          category: parseCategory(parsedUrl.searchParams.get("category")),
          searchText: parsedUrl.searchParams.get("q")?.trim() || undefined,
          specKey: parsedUrl.searchParams.get("specKey")?.trim() || undefined,
          specVal: parsedUrl.searchParams.get("specVal")?.trim() || undefined,
          maxPriceCents,
        };
        sendJson(res, 200, await service.queryCatalog(query));
        return;
      }

      const reviewMatch = /^\/api\/v1\/products\/([^/]+)\/reviews$/.exec(pathname);
      if (method === "POST" && reviewMatch && reviewMatch[1]) {
        const payload = await readJsonBody(req);
        const author = typeof payload["author"] === "string" ? payload["author"] : "";
        const rating = typeof payload["rating"] === "number" ? payload["rating"] : 0;
        const comment = typeof payload["comment"] === "string" ? payload["comment"] : "";
        const updated = await service.addReview(reviewMatch[1], author, rating, comment);
        sendJson(res, 201, { product: updated });
        return;
      }

      const productMatch = /^\/api\/v1\/products\/([^/]+)$/.exec(pathname);
      if (method === "GET" && productMatch && productMatch[1]) {
        const doc = await service.getProduct(productMatch[1]);
        sendJson(res, 200, { product: doc });
        return;
      }

      const cartGetMatch = /^\/api\/v1\/cart\/([^/]+)$/.exec(pathname);
      if (method === "GET" && cartGetMatch && cartGetMatch[1]) {
        sendJson(res, 200, await service.getCart(cartGetMatch[1]));
        return;
      }

      const cartItemsMatch = /^\/api\/v1\/cart\/([^/]+)\/items$/.exec(pathname);
      if (method === "POST" && cartItemsMatch && cartItemsMatch[1]) {
        const payload = await readJsonBody(req);
        const sku = typeof payload["sku"] === "string" ? payload["sku"] : "";
        const quantity =
          typeof payload["quantity"] === "number" ? payload["quantity"] : -1;
        sendJson(res, 200, await service.updateCartItem(cartItemsMatch[1], sku, quantity));
        return;
      }

      const cartCheckoutMatch = /^\/api\/v1\/cart\/([^/]+)\/checkout$/.exec(pathname);
      if (method === "POST" && cartCheckoutMatch && cartCheckoutMatch[1]) {
        sendJson(res, 200, await service.checkoutCart(cartCheckoutMatch[1]));
        return;
      }

      sendJson(res, 404, {
        error: "NOT_FOUND",
        message: `Ruta '${pathname}' no encontrada.`,
      });
    } catch (err) {
      if (err instanceof CatalogDomainError) {
        sendJson(res, err.statusCode, { error: err.code, message: err.message });
        return;
      }
      sendJson(res, 500, {
        error: "INTERNAL_ERROR",
        message: "Error inesperado procesando la solicitud.",
      });
    }
  });
}
