import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Observable, map } from "rxjs";

import { getServerTime } from "../utils/http-error-code";

import type { SuccessResponse } from "../types/api-response.type";

@Injectable()
export class ResponseInterceptor<T>
  implements NestInterceptor<T, SuccessResponse<T | null>>
{
  intercept(
    _: ExecutionContext,
    next: CallHandler,
  ): Observable<SuccessResponse<T | null>> {
    return next.handle().pipe(
      map((response) => {
        if (this.isSuccessEnvelope(response)) {
          return {
            ...response,
            serverTime: response.serverTime ?? getServerTime(),
          };
        }

        if (this.isPlainObject(response) && typeof response.message === "string") {
          const { message, ...data } = response;

          return {
            code: "SUCCESS",
            message,
            data: Object.keys(data).length ? data : null,
            serverTime: getServerTime(),
          };
        }

        return {
          code: "SUCCESS",
          message: "Success.",
          data: response ?? null,
          serverTime: getServerTime(),
        };
      }),
    );
  }

  private isSuccessEnvelope(
    response: unknown,
  ): response is SuccessResponse<T | null> {
    return (
      this.isPlainObject(response) &&
      response.code === "SUCCESS" &&
      "data" in response &&
      typeof response.message === "string"
    );
  }

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
}
