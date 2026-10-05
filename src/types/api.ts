export type ApiSuccessEnvelope<T> = {
  success: true;
  message?: string;
} & T;

export type ApiErrorEnvelope = {
  success: false;
  message: string;
  code?: string;
  details?: unknown;
};

export type ApiEnvelope<T> = ApiSuccessEnvelope<T> | ApiErrorEnvelope;

export type Pagination = {
  limit: number;
  offset: number;
  total: number;
};

export type PaginatedApiResponse<T> = ApiSuccessEnvelope<{
  items: T[];
  pagination: Pagination;
}>;
