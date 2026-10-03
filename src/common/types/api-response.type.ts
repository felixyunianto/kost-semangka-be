export type TErrorCode =
  | "SUCCESS"
  | "BAD_REQUEST"
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "TOO_MANY_REQUESTS"
  | "INTERNAL_ERROR";

export type TFieldError = {
  field: string;
  message: string;
};

export type TError = TFieldError[];

export type ErrorResponse = {
  code: Exclude<TErrorCode, "SUCCESS">;
  data: null;
  message: string;
  serverTime?: string | number;
  status?: number;
  errors?: TError;
};

export type ErrorResponseWithData<TData> = {
  code: Exclude<TErrorCode, "SUCCESS">;
  data: TData;
  message: string;
  serverTime?: string | number;
  status?: number;
  errors?: TError;
};

export type SuccessResponse<TData> = {
  code: "SUCCESS";
  message: string;
  data: TData;
  serverTime: string | number;
  errors?: TError;
};
