import { HttpStatus } from "@nestjs/common";

import type { TErrorCode } from "../types/api-response.type";

export function getServerTime() {
  return new Date().toISOString();
}

export function getErrorCode(status: number): Exclude<TErrorCode, "SUCCESS"> {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return "BAD_REQUEST";
    case HttpStatus.UNAUTHORIZED:
      return "UNAUTHORIZED";
    case HttpStatus.FORBIDDEN:
      return "FORBIDDEN";
    case HttpStatus.NOT_FOUND:
      return "NOT_FOUND";
    case HttpStatus.CONFLICT:
      return "CONFLICT";
    case HttpStatus.TOO_MANY_REQUESTS:
      return "TOO_MANY_REQUESTS";
    default:
      return status >= 400 && status < 500 ? "BAD_REQUEST" : "INTERNAL_ERROR";
  }
}
