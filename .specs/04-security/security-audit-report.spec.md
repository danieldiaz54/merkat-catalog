# Reporte de Auditoría de Seguridad — `merkat-catalog`

> **Veredicto:** `CERTIFIED` (`0 Critical · 0 High`)

1. **Validación estricta de payloads e invariantes (`ProductDocument.ts`)**: `sku` sanitizado (`^[A-Z0-9-]{3,32}$`), calificación entera `1..5`, longitud acotada de reseñas y control atómico de stock al confirmar compra.
2. **Previsión anti-Inyección NoSQL (`EmbeddedDocumentRepository.ts` / `MongoProductRepository.ts`)**: Prohibido interpolar operadores `$where` o objetos crudos del cliente en filtros; todos los parámetros de query se validan como strings primitivos o enteros positivos.
3. **DOM Seguro (`ui/index.html`)**: Renderizado exclusivo con `document.createElement` y `textContent`; cero `innerHTML`, `outerHTML` o `eval`.
4. **Endurecimiento de Contenedor (`Dockerfile`)**: Multi-stage Node 22 Alpine ejecutado bajo usuario sin privilegios `merkat` (`UID 10001`).
