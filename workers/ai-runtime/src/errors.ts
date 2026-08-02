export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly retryable: boolean,
    public readonly cause?: unknown
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export function classifyUpstreamError(error: unknown): ApiError {
  if (error instanceof ApiError) return error

  const message = error instanceof Error ? error.message : String(error)
  if (/\b429\b|rate.?limit/i.test(message)) {
    return new ApiError('AI_RATE_LIMITED', 'The AI provider rate limit was reached.', 429, true, error)
  }
  if (/timeout|timed out|network connection lost|daemonDown/i.test(message)) {
    return new ApiError('AI_UPSTREAM_TIMEOUT', 'The AI provider timed out.', 504, true, error)
  }
  return new ApiError('AI_UPSTREAM_ERROR', 'The AI provider request failed.', 502, true, error)
}

export function errorResponse(error: ApiError, requestId: string | null): Response {
  return Response.json({
    request_id: requestId,
    code: error.code,
    message: error.message,
    retryable: error.retryable
  }, { status: error.status })
}
