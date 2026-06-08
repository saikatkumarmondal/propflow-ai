// backend/src/utils/queryBuilder.ts
import { Request } from "express";
import { buildPaginatedResult, parsePagination } from "./pagination";

export type SortOrder = "asc" | "desc";

export interface QueryOptions {
  allowedFilters?: string[];
  allowedSortFields?: string[];
  defaultSortField?: string;
  defaultSortOrder?: SortOrder;
  searchFields?: string[];
}

export interface ParsedQuery {
  where: Record<string, unknown>;
  orderBy: Record<string, SortOrder>;
  skip: number;
  take: number;
  page: number;
  limit: number;
}

const PRISMA_STRING_FILTER_KEYS = new Set([
  "status", "type", "role", "currency", "priority", "country", "city",
]);

export const parseQuery = (req: Request, options: QueryOptions = {}): ParsedQuery => {
  const {
    allowedFilters = [],
    allowedSortFields = [],
    defaultSortField = "createdAt",
    defaultSortOrder = "desc",
    searchFields = [],
  } = options;

  const pagination = parsePagination(req);

  // ─── Filters ────────────────────────────────────
  const where: Record<string, unknown> = {};

  for (const field of allowedFilters) {
    const value = req.query[field] as string | undefined;
    if (!value) continue;

    if (PRISMA_STRING_FILTER_KEYS.has(field)) {
      where[field] = value.toUpperCase();
    } else {
      where[field] = value;
    }
  }

  // ─── Search (OR across multiple fields) ─────────
  const searchTerm = req.query.search as string | undefined;
  if (searchTerm && searchFields.length > 0) {
    where["OR"] = searchFields.map((field) => ({
      [field]: { contains: searchTerm, mode: "insensitive" },
    }));
  }

  // ─── Date Range ──────────────────────────────────
  const from = req.query.from as string | undefined;
  const to = req.query.to as string | undefined;
  if (from || to) {
    where["createdAt"] = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to) } : {}),
    };
  }

  // ─── Sort ────────────────────────────────────────
  const sortField = req.query.sortBy as string | undefined;
  const sortOrder = (req.query.sortOrder as SortOrder | undefined) ?? defaultSortOrder;

  const resolvedSortField =
    sortField && allowedSortFields.includes(sortField)
      ? sortField
      : defaultSortField;

  const resolvedSortOrder: SortOrder =
    sortOrder === "asc" || sortOrder === "desc" ? sortOrder : defaultSortOrder;

  return {
    where,
    orderBy: { [resolvedSortField]: resolvedSortOrder },
    skip: pagination.skip,
    take: pagination.limit,
    page: pagination.page,
    limit: pagination.limit,
  };
};

export const buildResponse = <T>(
  data: T[],
  total: number,
  query: ParsedQuery
) => {
  return buildPaginatedResult(data, total, {
    page: query.page,
    limit: query.limit,
    skip: query.skip,
  });
};