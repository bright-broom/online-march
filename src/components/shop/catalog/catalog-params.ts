/**
 * /products URL state — shared by the server (loader/serializer) and client filters (useQueryStates).
 * `nuqs/server` has no server-only marker, so this module is safe on both sides.
 */
import {
  createLoader,
  createSerializer,
  parseAsBoolean,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
  type inferParserType,
} from "nuqs/server";
import {
  categoryKeys,
  cultivationMethods,
  priceRanges,
  productSortOptions,
  type CultivationKey,
  type ProductSort,
} from "@/config/catalog";

const sortKeys = Object.keys(productSortOptions) as ProductSort[];
const cultivationKeys = Object.keys(cultivationMethods) as CultivationKey[];
const priceKeys = priceRanges.map((r) => r.key);

export const catalogParsers = {
  q: parseAsString.withDefault(""),
  category: parseAsStringLiteral(categoryKeys),
  farm: parseAsString,
  cultivation: parseAsStringLiteral(cultivationKeys),
  price: parseAsStringLiteral(priceKeys),
  stock: parseAsBoolean.withDefault(false),
  sort: parseAsStringLiteral(sortKeys).withDefault("recommended"),
  page: parseAsInteger.withDefault(1),
};

export type CatalogParams = inferParserType<typeof catalogParsers>;

export const loadCatalogParams = createLoader(catalogParsers);
export const serializeCatalog = createSerializer(catalogParsers);

/** Filter keys that narrow the result set (used for "active filters" chips / reset). */
export const filterKeys = ["q", "category", "farm", "cultivation", "price", "stock"] as const;
