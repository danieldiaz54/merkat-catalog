# ADR-001: Esquema Polimórfico en MongoDB y Read-Aside CQRS frente a EAV SQL

- **Estado:** Aceptado
- **Fecha:** 2026-11-19
- **Proyecto:** `merkat-catalog`

## Contexto
Un comercio con categorías dispares (laptops, abrigos, muebles) requiere consultar y filtrar atributos completamente distintos por categoría sin migrar esquemas DDL ni encadenar múltiples `JOIN` EAV (Entity-Attribute-Value) costosos.

## Decisión
Adoptar **MongoDB (base de datos documental NoSQL)** junto con una capa **CQRS Read-Aside** (Redis en producción / TTL en memoria en modo autocontenido):
- Los productos usan una unión discriminada tipada en TypeScript (`ProductSpecs`) persistida como subdocumento flexible en BSON.
- Las reseñas viajan embebidas en el documento producto para entregar detalle + reseñas en una sola lectura (`O(1)` por SKU).
- Cada escritura válida invoca invalidación selectiva del caché de lectura.
