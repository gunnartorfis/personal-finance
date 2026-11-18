// Error messages, causes, request bodies, and SQL parameters can contain financial data.
const errorTypes = new Set([
  "AI_APICallError",
  "AI_LoadAPIKeyError",
  "AI_NoObjectGeneratedError",
  "AI_RetryError",
  "AI_TypeValidationError",
  "GatewayAuthenticationError",
  "GatewayFailedDependencyError",
  "GatewayForbiddenError",
  "GatewayInternalServerError",
  "GatewayInvalidRequestError",
  "GatewayModelNotFoundError",
  "GatewayRateLimitError",
  "GatewayResponseError",
  "DrizzleQueryError",
  "AbortError",
  "TimeoutError",
]);

const errorCodes = new Set([
  "22P02", "22001", "23502", "23503", "23505", "23514", "40001", "40P01",
  "42501", "42703", "42P01", "57014", "ECONNREFUSED", "ECONNRESET",
  "EAI_AGAIN", "ENOTFOUND", "ETIMEDOUT",
]);

/** Extract allowlisted diagnostics through SDK retry and database wrappers. */
export function classificationFailure(error: unknown) {
  let errorType: string | undefined;
  let httpStatus: number | undefined;
  let errorCode: string | undefined;

  for (let depth = 0; depth < 5 && error && typeof error === "object"; depth++) {
    const { name, statusCode, code, lastError, cause } = error as {
      name?: unknown;
      statusCode?: unknown;
      code?: unknown;
      lastError?: unknown;
      cause?: unknown;
    };
    if (typeof name === "string" && errorTypes.has(name)) errorType = name;
    if (typeof statusCode === "number" && Number.isInteger(statusCode) && statusCode >= 400 && statusCode <= 599) {
      httpStatus = statusCode;
    }
    if (typeof code === "string" && errorCodes.has(code)) errorCode = code;
    error = lastError ?? cause;
  }

  return { errorType: errorType ?? "unknown", httpStatus, errorCode };
}
