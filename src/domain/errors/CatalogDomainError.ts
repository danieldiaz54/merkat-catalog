export type CatalogErrorCode =
  | "PRODUCT_NOT_FOUND"
  | "INVALID_REVIEW"
  | "INVALID_CART_ITEM"
  | "INSUFFICIENT_STOCK"
  | "EMPTY_CART";

export class CatalogDomainError extends Error {
  public readonly code: CatalogErrorCode;
  public readonly statusCode: number;

  public constructor(
    code: CatalogErrorCode,
    message: string,
    statusCode = 400,
  ) {
    super(message);
    this.name = "CatalogDomainError";
    this.code = code;
    this.statusCode = statusCode;
  }
}
