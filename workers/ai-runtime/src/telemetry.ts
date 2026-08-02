import type { Env, InvocationRecord } from './types.js'

export async function writeInvocation(env: Env, record: InvocationRecord): Promise<void> {
  await env.DB.prepare(`
    INSERT INTO ai_invocations (
      request_id, task, environment, execution_id, topic_slug, date_key,
      provider, model, prompt_version, schema_version, gateway_log_id,
      status, fallback_used, cache_status, latency_ms,
      prompt_tokens, completion_tokens, total_tokens, estimated_cost_usd,
      error_code, error_message, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    ON CONFLICT(request_id) DO UPDATE SET
      provider = excluded.provider,
      model = excluded.model,
      gateway_log_id = excluded.gateway_log_id,
      status = excluded.status,
      fallback_used = excluded.fallback_used,
      cache_status = excluded.cache_status,
      latency_ms = excluded.latency_ms,
      prompt_tokens = excluded.prompt_tokens,
      completion_tokens = excluded.completion_tokens,
      total_tokens = excluded.total_tokens,
      estimated_cost_usd = excluded.estimated_cost_usd,
      error_code = excluded.error_code,
      error_message = excluded.error_message,
      updated_at = excluded.updated_at
  `).bind(
    record.requestId,
    record.task,
    env.ENVIRONMENT,
    record.executionId,
    record.topicSlug,
    record.dateKey,
    record.provider,
    record.model,
    record.promptVersion,
    record.schemaVersion,
    record.gatewayLogId,
    record.status,
    record.fallbackUsed ? 1 : 0,
    record.cacheStatus,
    record.latencyMs,
    record.promptTokens,
    record.completionTokens,
    record.totalTokens,
    record.estimatedCostUsd,
    record.errorCode,
    record.errorMessage
  ).run()
}

export function usageNumbers(usage: Record<string, unknown>): Pick<InvocationRecord, 'promptTokens' | 'completionTokens' | 'totalTokens' | 'estimatedCostUsd'> {
  const promptTokens = integer(usage.prompt_tokens ?? usage.input_tokens)
  const completionTokens = integer(usage.completion_tokens ?? usage.output_tokens)
  const totalTokens = integer(usage.total_tokens) || promptTokens + completionTokens
  const cost = Number(usage.cost ?? usage.estimated_cost_usd)
  return {
    promptTokens,
    completionTokens,
    totalTokens,
    estimatedCostUsd: Number.isFinite(cost) && cost >= 0 ? cost : null
  }
}

function integer(value: unknown): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0
}
