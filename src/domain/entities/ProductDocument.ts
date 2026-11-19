import { CatalogDomainError } from "../errors/CatalogDomainError.js";

export type ProductCategory = "tecnologia" | "moda" | "hogar";

export interface TechSpecs {
  readonly chip: string;
  readonly ramGb: number;
  readonly pantallaPulgadas: number;
  readonly bateriaHoras: number;
}

export interface FashionSpecs {
  readonly tallas: string[];
  readonly material: string;
  readonly corte: string;
  readonly temporada: string;
}

export interface HomeSpecs {
  readonly dimensionesCm: string;
  readonly madera: string;
  readonly pesoKg: number;
  readonly requiereArmado: boolean;
}

export type ProductSpecs =
  | ({ readonly kind: "tecnologia" } & TechSpecs)
  | ({ readonly kind: "moda" } & FashionSpecs)
  | ({ readonly kind: "hogar" } & HomeSpecs);

export interface EmbeddedReview {
  readonly id: string;
  readonly author: string;
  readonly rating: 1 | 2 | 3 | 4 | 5;
  readonly comment: string;
  readonly createdAtIso: string;
}

export interface ProductDocument {
  readonly sku: string;
  readonly name: string;
  readonly subtitle: string;
  readonly category: ProductCategory;
  readonly priceCents: number;
  readonly currency: "USD";
  readonly stock: number;
  readonly paletteHex: string;
  readonly specs: ProductSpecs;
  reviews: EmbeddedReview[];
}

export interface CatalogFilterQuery {
  readonly category?: ProductCategory;
  readonly searchText?: string;
  readonly specKey?: string;
  readonly specVal?: string;
  readonly maxPriceCents?: number;
}

export interface FacetOption {
  readonly value: string;
  readonly count: number;
}

export interface CategoryFacetGroup {
  readonly key: string;
  readonly label: string;
  readonly options: FacetOption[];
}

const VALID_SKU_REGEX = /^[A-Z0-9-]{3,32}$/;

export function normalizeSku(raw: string): string {
  const clean = raw.trim().toUpperCase();
  if (!VALID_SKU_REGEX.test(clean)) {
    throw new CatalogDomainError(
      "PRODUCT_NOT_FOUND",
      "Identificador de producto inválido.",
      400,
    );
  }
  return clean;
}

export function validateReviewInput(
  rawAuthor: string,
  rawRating: number,
  rawComment: string,
  nowIso: string,
  id: string,
): EmbeddedReview {
  const author = rawAuthor.trim();
  const comment = rawComment.trim();
  if (author.length < 2 || author.length > 48) {
    throw new CatalogDomainError(
      "INVALID_REVIEW",
      "El nombre del autor debe tener entre 2 y 48 caracteres.",
      422,
    );
  }
  if (
    !Number.isInteger(rawRating) ||
    rawRating < 1 ||
    rawRating > 5
  ) {
    throw new CatalogDomainError(
      "INVALID_REVIEW",
      "La calificación debe ser un entero entre 1 y 5.",
      422,
    );
  }
  if (comment.length < 6 || comment.length > 280) {
    throw new CatalogDomainError(
      "INVALID_REVIEW",
      "El comentario debe tener entre 6 y 280 caracteres.",
      422,
    );
  }

  return {
    id,
    author,
    rating: rawRating as 1 | 2 | 3 | 4 | 5,
    comment,
    createdAtIso: nowIso,
  };
}

/** Extract dynamic attribute pairs cleanly without leaking into untyped loops. */
export function getSpecFacetPairs(specs: ProductSpecs): Array<{
  readonly key: string;
  readonly label: string;
  readonly values: string[];
}> {
  switch (specs.kind) {
    case "tecnologia":
      return [
        { key: "chip", label: "Procesador", values: [specs.chip] },
        { key: "ramGb", label: "Memoria RAM", values: [`${specs.ramGb} GB`] },
        { key: "pantallaPulgadas", label: "Pantalla", values: [`${specs.pantallaPulgadas}"`] },
      ];
    case "moda":
      return [
        { key: "material", label: "Material", values: [specs.material] },
        { key: "corte", label: "Corte", values: [specs.corte] },
        { key: "tallas", label: "Tallas disponibles", values: [...specs.tallas] },
      ];
    case "hogar":
      return [
        { key: "madera", label: "Material principal", values: [specs.madera] },
        {
          key: "requiereArmado",
          label: "Entrega",
          values: [specs.requiereArmado ? "Requiere armado" : "Listo para usar"],
        },
      ];
  }
}

export function matchesCatalogQuery(
  doc: ProductDocument,
  query: CatalogFilterQuery,
): boolean {
  if (query.category && doc.category !== query.category) {
    return false;
  }
  if (
    query.maxPriceCents !== undefined &&
    doc.priceCents > query.maxPriceCents
  ) {
    return false;
  }
  if (query.searchText) {
    const q = query.searchText.toLowerCase();
    const textBlob = `${doc.name} ${doc.subtitle} ${doc.sku} ${JSON.stringify(doc.specs)}`.toLowerCase();
    if (!textBlob.includes(q)) {
      return false;
    }
  }
  if (query.specKey && query.specVal) {
    const pairs = getSpecFacetPairs(doc.specs);
    const matching = pairs.find((p) => p.key === query.specKey);
    if (!matching || !matching.values.includes(query.specVal)) {
      return false;
    }
  }
  return true;
}

/** Compute dynamic facets adapted to the filtered NoSQL category documents. */
export function computeCategoryFacets(
  docs: ReadonlyArray<ProductDocument>,
): CategoryFacetGroup[] {
  const groups = new Map<
    string,
    { readonly label: string; readonly counts: Map<string, number> }
  >();

  for (const doc of docs) {
    for (const pair of getSpecFacetPairs(doc.specs)) {
      let group = groups.get(pair.key);
      if (!group) {
        group = { label: pair.label, counts: new Map<string, number>() };
        groups.set(pair.key, group);
      }
      for (const val of pair.values) {
        group.counts.set(val, (group.counts.get(val) ?? 0) + 1);
      }
    }
  }

  const result: CategoryFacetGroup[] = [];
  for (const [key, group] of groups.entries()) {
    const options: FacetOption[] = [];
    for (const [value, count] of group.counts.entries()) {
      options.push({ value, count });
    }
    options.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
    result.push({ key, label: group.label, options });
  }
  return result;
}
