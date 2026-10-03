import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { Response } from "express";

import { getErrorCode, getServerTime } from "../utils/http-error-code";

import type { ErrorResponse, TError } from "../types/api-response.type";

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      const { message, errors, data } = this.parseExceptionResponse(
        exceptionResponse,
        exception.message,
      );

      const body: ErrorResponse = {
        code:
          errors?.length && status === HttpStatus.BAD_REQUEST
            ? "VALIDATION_ERROR"
            : getErrorCode(status),
        data: data ?? null,
        message,
        serverTime: getServerTime(),
        status,
        ...(errors?.length ? { errors } : {}),
      };

      return response.status(status).json(body);
    }

    const body: ErrorResponse = {
      code: "INTERNAL_ERROR",
      data: null,
      message: "Internal server error.",
      serverTime: getServerTime(),
      status: HttpStatus.INTERNAL_SERVER_ERROR,
    };

    return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json(body);
  }

  private parseExceptionResponse(
    exceptionResponse: string | object,
    fallbackMessage: string,
  ): {
    message: string;
    errors?: TError;
    data?: null;
  } {
    if (typeof exceptionResponse === "string") {
      return {
        message: exceptionResponse,
      };
    }

    const payload = exceptionResponse as {
      message?: string | string[];
      errors?: TError;
      error?: string;
    };

    if (payload.errors?.length) {
      return {
        message:
          typeof payload.message === "string"
            ? payload.message
            : "Validation failed.",
        errors: payload.errors,
      };
    }

    if (Array.isArray(payload.message)) {
      return {
        message: "Validation failed.",
        errors: payload.message.map((message) => ({
          field: "unknown",
          message,
        })),
      };
    }

    return {
      message: payload.message ?? payload.error ?? fallbackMessage,
    };
  }
}
