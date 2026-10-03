import { ValidationError } from "class-validator";

import type { TError } from "../types/api-response.type";

export function flattenValidationErrors(
  validationErrors: ValidationError[],
  parentField = "",
): TError {
  return validationErrors.flatMap((error) => {
    const field = parentField
      ? `${parentField}.${error.property}`
      : error.property;

    const currentErrors = error.constraints
      ? Object.values(error.constraints).map((message) => ({
          field,
          message,
        }))
      : [];

    const nestedErrors = error.children?.length
      ? flattenValidationErrors(error.children, field)
      : [];

    return [...currentErrors, ...nestedErrors];
  });
}
