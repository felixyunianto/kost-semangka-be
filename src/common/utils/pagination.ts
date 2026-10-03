import type { PaginationQueryDto } from "../dto/pagination-query.dto";
import type { PaginatedResult, Pagination } from "../types/pagination.type";

export function getPaginationParams(query: PaginationQueryDto) {
  const page = query.page ?? 1;
  const limit = query.limit ?? 10;

  return {
    page,
    limit,
    skip: (page - 1) * limit,
    take: limit,
  };
}

export function buildPagination(
  page: number,
  limit: number,
  total: number,
): Pagination {
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit) || 0,
  };
}

export function paginate<T>(
  items: T[],
  page: number,
  limit: number,
  total: number,
): PaginatedResult<T> {
  return {
    items,
    pagination: buildPagination(page, limit, total),
  };
}
