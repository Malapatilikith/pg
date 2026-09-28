export interface PaginationParams {
  page: number;
  pageSize: number;
  offset: number;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface PaginatedData<T> {
  items: T[];
  pagination: PaginationMeta;
}

interface ParsePaginationOptions {
  defaultPage?: number;
  defaultPageSize?: number;
  maxPageSize?: number;
}

const toPositiveInteger = (value: string | undefined, fallback: number) => {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  const normalized = Math.trunc(parsed);
  if (normalized < 1) {
    return fallback;
  }

  return normalized;
};

export const parsePaginationParams = (
  pageValue: string | undefined,
  pageSizeValue: string | undefined,
  options: ParsePaginationOptions = {}
): PaginationParams => {
  const defaultPage = options.defaultPage ?? 1;
  const defaultPageSize = options.defaultPageSize ?? 20;
  const maxPageSize = options.maxPageSize ?? 100;

  const page = toPositiveInteger(pageValue, defaultPage);
  const requestedPageSize = toPositiveInteger(pageSizeValue, defaultPageSize);
  const pageSize = Math.min(requestedPageSize, maxPageSize);

  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize
  };
};

export const buildPaginationMeta = (total: number, page: number, pageSize: number): PaginationMeta => {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return {
    page,
    pageSize,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1
  };
};
