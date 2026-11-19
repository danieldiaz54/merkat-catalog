# Merkat Catalog

Tienda boutique multi-categoría con esquema polimórfico **NoSQL (MongoDB)** y caché de lectura **CQRS**: los filtros cambian automáticamente al navegar entre *Tecnología*, *Moda* y *Hogar*, las reseñas viven embebidas en cada documento y las compras invalidan la caché en tiempo real.

## Stack Tecnológico
- **Backend:** Node.js 22 + TypeScript estricto (`tsconfig.json` `strict: true`, cero `any`).
- **Base de Datos NoSQL:** Driver oficial `mongodb` con soporte dual (`MONGODB_URI` o motor documental embebido compatible para entorno portátil `$0`).
- **Caché CQRS:** Read-aside cache con telemetría `HIT / MISS` e invalidación automática por escritura.
- **UI:** Editorial boutique *Alabaster Stone* (`Bodoni Moda` + `Figtree` + `JetBrains Mono`) y cajón técnico `"Arquitectura NoSQL"`.

## Verificación Local
```bash
npm install
npm run lint
npm run typecheck
npm test
npm run build
python -m unittest discover -s tests -v
```
