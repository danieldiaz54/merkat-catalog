# SPEC-02: Catálogo Polimórfico NoSQL y Caché CQRS (`merkat-catalog`)

- **Estado:** Activo
- **Fecha:** 2026-11-19
- **Arquitectura:** Document-Oriented API + CQRS Read-Aside Cache (Node.js 22 + TypeScript Strict + MongoDB + Redis)

## 1. Modelo Polimórfico NoSQL (`ProductDocument`)
Un único catálogo unificado almacena documentos heterogéneos por `category`:
- `tecnologia`: `{ chip, ramGb, pantallaPulgadas, bateriaHoras }`
- `moda`: `{ tallas, material, corte, temporada }`
- `hogar`: `{ dimensionesCm, madera, pesoKg, requiereArmado }`
Cada documento embebe su arreglo `reviews[]` (`author`, `rating`, `comment`, `createdAtIso`), evitando *joins* rígidos EAV de bases relacionales.

## 2. Flujo CQRS & Caché
1. **Consultas (`GET /api/v1/products`)**: Construyen una llave normalizada, verifican `CachePort` (`HIT` o `MISS`), y calculan facetas dinámicas solo sobre la categoría consultada.
2. **Escrituras (`POST /reviews`, `POST /checkout`)**: Aplican invariantes puras de dominio (rating `1..5`, stock >= cantidad) y **invalidan el caché de lectura** automáticamente para garantizar consistencia eventual inmediata.

## 3. Contratos HTTP
- `GET /api/v1/health`
- `GET /api/v1/products?category=&q=&specKey=&specVal=&maxPriceCents=`
- `GET /api/v1/products/:sku`
- `POST /api/v1/products/:sku/reviews`
- `GET /api/v1/cart/:sessionId`
- `POST /api/v1/cart/:sessionId/items`
- `POST /api/v1/cart/:sessionId/checkout`
