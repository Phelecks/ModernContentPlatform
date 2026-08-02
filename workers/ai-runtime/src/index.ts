import { authenticate } from './auth.js'
import { serveAsset } from './assets.js'
import { ApiError, errorResponse } from './errors.js'
import { TASK_POLICIES } from './policies.js'
import { executeTask } from './runtime.js'
import { usageNumbers, writeInvocation } from './telemetry.js'
import { TASKS, type Env, type TaskName, type TaskRequest } from './types.js'

const MAX_BODY_BYTES = 1_000_000
const TOPIC_PATTERN = /^[a-z][a-z0-9_-]*$/
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{8,200}$/

export default {
  async fetch(request: Request, env: Env, context: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    const assetMatch = request.method === 'GET' ? url.pathname.match(/^\/v1\/assets\/(.+)$/) : null
    if (assetMatch) {
      try {
        return await serveAsset(request, env, decodeURIComponent(assetMatch[1]))
      } catch (error) {
        return errorResponse(error instanceof ApiError ? error : new ApiError('ASSET_ERROR', 'Unable to serve the asset.', 500, true, error), null)
      }
    }

    if (request.method === 'GET' && url.pathname === '/health') {
      return Response.json({ status: 'ok', service: 'mcp-ai-runtime', environment: env.ENVIRONMENT })
    }

    const taskMatch = url.pathname.match(/^\/v1\/tasks\/([A-Za-z]+)$/)
    if (request.method !== 'POST' || !taskMatch) {
      return errorResponse(new ApiError('NOT_FOUND', 'Route not found.', 404, false), null)
    }

    let requestId: string | null = null
    let task: TaskName | null = null
    let body: TaskRequest | null = null
    const startedAt = Date.now()

    try {
      await authenticate(request, env)
      task = parseTask(taskMatch[1])
      body = await parseRequest(request)
      requestId = body.request_id
      const response = await executeTask(env, task, body)
      const usage = usageNumbers(response.meta.usage)

      context.waitUntil(writeInvocation(env, {
        requestId,
        task,
        executionId: body.execution_id == null ? null : String(body.execution_id),
        topicSlug: body.topic_slug || null,
        dateKey: body.date_key || null,
        provider: response.meta.provider,
        model: response.meta.model,
        promptVersion: response.meta.prompt_version,
        schemaVersion: response.meta.schema_version,
        gatewayLogId: response.meta.gateway_log_id,
        status: 'ok',
        fallbackUsed: response.meta.fallback_used,
        cacheStatus: response.meta.cache_status,
        latencyMs: response.meta.latency_ms,
        ...usage,
        errorCode: null,
        errorMessage: null
      }))

      console.log(JSON.stringify({ event: 'ai_task_completed', request_id: requestId, task, ...response.meta }))
      return Response.json({ request_id: requestId, task, output: response.output, meta: response.meta })
    } catch (error) {
      const apiError = error instanceof ApiError
        ? error
        : new ApiError('INTERNAL_ERROR', 'The AI runtime failed unexpectedly.', 500, true, error)
      const policy = task ? TASK_POLICIES[task] : null
      if (task && body && requestId && policy) {
        context.waitUntil(writeInvocation(env, {
          requestId,
          task,
          executionId: body.execution_id == null ? null : String(body.execution_id),
          topicSlug: body.topic_slug || null,
          dateKey: body.date_key || null,
          provider: null,
          model: null,
          promptVersion: policy.promptVersion,
          schemaVersion: policy.schemaVersion,
          gatewayLogId: null,
          status: 'error',
          fallbackUsed: false,
          cacheStatus: 'bypass',
          latencyMs: Date.now() - startedAt,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          estimatedCostUsd: null,
          errorCode: apiError.code,
          errorMessage: apiError.message
        }))
      }
      console.error(JSON.stringify({ event: 'ai_task_failed', request_id: requestId, task, code: apiError.code, cause: safeCause(apiError.cause) }))
      return errorResponse(apiError, requestId)
    }
  }
} satisfies ExportedHandler<Env>

function parseTask(value: string): TaskName {
  if (!TASKS.includes(value as TaskName)) throw new ApiError('TASK_NOT_FOUND', `Unsupported AI task: ${value}.`, 404, false)
  return value as TaskName
}

async function parseRequest(request: Request): Promise<TaskRequest> {
  const contentLength = Number(request.headers.get('content-length') || 0)
  if (contentLength > MAX_BODY_BYTES) throw new ApiError('PAYLOAD_TOO_LARGE', 'The request body exceeds 1 MB.', 413, false)
  const text = await request.text()
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) throw new ApiError('PAYLOAD_TOO_LARGE', 'The request body exceeds 1 MB.', 413, false)

  let body: Record<string, unknown>
  try {
    body = JSON.parse(text)
  } catch (error) {
    throw new ApiError('INVALID_JSON', 'The request body must be valid JSON.', 400, false, error)
  }

  const allowed = new Set(['request_id', 'execution_id', 'topic_slug', 'date_key', 'input', 'cache_mode'])
  const unexpected = Object.keys(body).filter(key => !allowed.has(key))
  if (unexpected.length) throw new ApiError('INVALID_INPUT', `Unexpected request fields: ${unexpected.join(', ')}.`, 400, false)
  if (typeof body.request_id !== 'string' || !REQUEST_ID_PATTERN.test(body.request_id)) {
    throw new ApiError('INVALID_INPUT', 'request_id must be 8-200 URL-safe characters.', 400, false)
  }
  if (!body.input || typeof body.input !== 'object' || Array.isArray(body.input)) {
    throw new ApiError('INVALID_INPUT', 'input must be a JSON object.', 400, false)
  }
  if (body.topic_slug != null && (typeof body.topic_slug !== 'string' || !TOPIC_PATTERN.test(body.topic_slug))) {
    throw new ApiError('INVALID_INPUT', 'topic_slug is invalid.', 400, false)
  }
  if (body.date_key != null && (typeof body.date_key !== 'string' || !DATE_PATTERN.test(body.date_key))) {
    throw new ApiError('INVALID_INPUT', 'date_key must use YYYY-MM-DD.', 400, false)
  }
  if (body.cache_mode != null && body.cache_mode !== 'reuse' && body.cache_mode !== 'refresh') {
    throw new ApiError('INVALID_INPUT', 'cache_mode must be reuse or refresh.', 400, false)
  }

  return body as unknown as TaskRequest
}

function safeCause(cause: unknown): string | null {
  return cause instanceof Error ? cause.message.slice(0, 500) : cause == null ? null : String(cause).slice(0, 500)
}
