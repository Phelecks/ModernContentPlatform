import { assetKey, createAssetUrl, decodeBase64 } from './assets.js'
import { contentHash } from './cache.js'
import { ApiError, classifyUpstreamError } from './errors.js'
import { TASK_POLICIES, providerFor } from './policies.js'
import { buildImagePrompt, buildNarrationText, buildPrompt } from './prompts.js'
import type { Env, InvocationMeta, TaskName, TaskRequest } from './types.js'
import { parseModelJson, schemaForTask, validateTaskOutput } from './validation.js'

interface RunResult {
  output: unknown
  meta: InvocationMeta
}

interface ModelAttempt {
  raw: unknown
  model: string
  provider: string
  gatewayLogId: string | null
  usage: Record<string, unknown>
}

export async function executeTask(env: Env, task: TaskName, request: TaskRequest): Promise<RunResult> {
  const policy = TASK_POLICIES[task]
  const startedAt = Date.now()

  if (policy.kind === 'image') return executeImage(env, request, startedAt)
  if (policy.kind === 'audio') return executeNarration(env, request, startedAt)

  const prompt = buildPrompt(task as Exclude<TaskName, 'imageGeneration' | 'narration'>, request.input)
  const cacheEnabled = policy.cacheable && request.cache_mode !== 'refresh'
  const cacheKey = cacheEnabled
    ? await contentHash([task, policy.promptVersion, policy.schemaVersion, request.input])
    : undefined

  let primaryError: unknown
  try {
    const attempt = await runTextModel(env, policy.primaryModel, prompt, policy, request, cacheEnabled, cacheKey)
    const output = normalizeTextOutput(task, attempt.raw)
    validateTaskOutput(task, output)
    return result(output, attempt, policy.promptVersion, policy.schemaVersion, cacheEnabled, false, startedAt)
  } catch (error) {
    primaryError = error
    console.warn(JSON.stringify({ event: 'ai_primary_failed', task, request_id: request.request_id, error: safeMessage(error) }))
  }

  try {
    const attempt = await runTextModel(env, policy.fallbackModel, prompt, policy, request, false)
    const output = normalizeTextOutput(task, attempt.raw)
    validateTaskOutput(task, output)
    return result(output, attempt, policy.promptVersion, policy.schemaVersion, false, true, startedAt)
  } catch (fallbackError) {
    if (primaryError instanceof ApiError && primaryError.code === 'AI_OUTPUT_INVALID') {
      throw new ApiError('AI_OUTPUT_INVALID', 'Both primary and fallback models returned invalid output.', 422, false, fallbackError)
    }
    throw classifyUpstreamError(fallbackError)
  }
}

async function runTextModel(
  env: Env,
  model: string,
  prompt: { system: string; user: string },
  policy: typeof TASK_POLICIES[TaskName],
  request: TaskRequest,
  cacheEnabled: boolean,
  cacheKey?: string
): Promise<ModelAttempt> {
  const responseFormat = policy.kind === 'json' && schemaForTask(policy.task)
    ? { type: 'json_schema', json_schema: schemaForTask(policy.task) }
    : undefined
  const raw = await env.AI.run(model as never, {
    messages: [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user }
    ],
    temperature: policy.temperature,
    max_tokens: policy.maxTokens,
    response_format: responseFormat
  } as never, {
    gateway: {
      id: env.GATEWAY_ID,
      skipCache: !cacheEnabled,
      cacheTtl: cacheEnabled ? 86400 : undefined,
      cacheKey,
      collectLog: true,
      metadata: gatewayMetadata(env, policy.task, request, policy.promptVersion)
    }
  })
  const record = raw as unknown as Record<string, unknown>
  return {
    raw,
    model,
    provider: providerFor(model),
    gatewayLogId: env.AI.aiGatewayLogId || null,
    usage: asRecord(record?.usage)
  }
}

function normalizeTextOutput(task: TaskName, raw: unknown): unknown {
  const record = asRecord(raw)
  const choices = Array.isArray(record.choices) ? record.choices : []
  const firstChoice = asRecord(choices[0])
  const message = asRecord(firstChoice.message)
  const content = message.content ?? record.response ?? record.result ?? raw
  return task === 'articleGeneration' ? String(content || '').trim() : parseModelJson(content)
}

async function executeImage(env: Env, request: TaskRequest, startedAt: number): Promise<RunResult> {
  const policy = TASK_POLICIES.imageGeneration
  const prompt = buildImagePrompt(request.input)
  const attempt = await runWithFallback(policy.primaryModel, policy.fallbackModel, async model => {
    const raw = await env.AI.run(model as never, imageInput(model, prompt) as never, {
      gateway: { id: env.GATEWAY_ID, skipCache: true, collectLog: true, metadata: gatewayMetadata(env, policy.task, request, policy.promptVersion) }
    })
    const binary = await imageBytes(raw)
    const key = assetKey(request, 'png')
    await env.AI_ASSETS.put(key, binary, { httpMetadata: { contentType: 'image/png' }, customMetadata: { request_id: request.request_id, task: policy.task } })
    const url = await createAssetUrl(env, key)
    const generatedAt = new Date().toISOString()
    return {
      output: {
        images: [{ index: 0, prompt, revised_prompt: null, provider: 'cloudflare', model, size: '1024x1024', format: 'r2_url', url, b64_json: null, mime_type: 'image/png', object_key: key, generated_at: generatedAt }],
        image_count: 1,
        provider: 'cloudflare',
        model,
        generated_at: generatedAt
      },
      model,
      provider: providerFor(model),
      gatewayLogId: env.AI.aiGatewayLogId || null,
      usage: asRecord(asRecord(raw).usage)
    }
  })
  validateTaskOutput('imageGeneration', attempt.value.output)
  return result(attempt.value.output, attempt.value, policy.promptVersion, policy.schemaVersion, false, attempt.fallbackUsed, startedAt)
}

async function executeNarration(env: Env, request: TaskRequest, startedAt: number): Promise<RunResult> {
  const policy = TASK_POLICIES.narration
  const text = buildNarrationText(request.input)
  if (!text) throw new ApiError('INVALID_INPUT', 'Narration requires input.text or input.video_script.', 400, false)
  const voice = typeof request.input.voice === 'string' ? request.input.voice.slice(0, 100) : 'asteria'
  const attempt = await runWithFallback(policy.primaryModel, policy.fallbackModel, async model => {
    const raw = await env.AI.run(model as never, narrationInput(model, text, voice) as never, {
      gateway: { id: env.GATEWAY_ID, skipCache: true, collectLog: true, metadata: gatewayMetadata(env, policy.task, request, policy.promptVersion) }
    })
    const binary = await audioBytes(raw)
    const key = assetKey(request, 'mp3')
    await env.AI_ASSETS.put(key, binary, { httpMetadata: { contentType: 'audio/mpeg' }, customMetadata: { request_id: request.request_id, task: policy.task } })
    const audioUrl = await createAssetUrl(env, key)
    return {
      output: {
        provider: 'cloudflare',
        model,
        voice,
        format: 'r2_url',
        audio_encoding: 'mp3',
        audio_b64: null,
        audio_url: audioUrl,
        object_key: key,
        char_count: text.length,
        duration_seconds: null,
        generated_at: new Date().toISOString(),
        warning: null
      },
      model,
      provider: providerFor(model),
      gatewayLogId: env.AI.aiGatewayLogId || null,
      usage: asRecord(asRecord(raw).usage)
    }
  })
  validateTaskOutput('narration', attempt.value.output)
  return result(attempt.value.output, attempt.value, policy.promptVersion, policy.schemaVersion, false, attempt.fallbackUsed, startedAt)
}

async function runWithFallback<T>(primary: string, fallback: string, run: (model: string) => Promise<T>): Promise<{ value: T; fallbackUsed: boolean }> {
  try {
    return { value: await run(primary), fallbackUsed: false }
  } catch (primaryError) {
    console.warn(JSON.stringify({ event: 'ai_media_primary_failed', primary, error: safeMessage(primaryError) }))
    try {
      return { value: await run(fallback), fallbackUsed: true }
    } catch (fallbackError) {
      throw classifyUpstreamError(fallbackError)
    }
  }
}

function result(
  output: unknown,
  attempt: Pick<ModelAttempt, 'model' | 'provider' | 'gatewayLogId' | 'usage'>,
  promptVersion: string,
  schemaVersion: string,
  cacheEnabled: boolean,
  fallbackUsed: boolean,
  startedAt: number
): RunResult {
  return {
    output,
    meta: {
      provider: attempt.provider,
      model: attempt.model,
      gateway_log_id: attempt.gatewayLogId,
      prompt_version: promptVersion,
      schema_version: schemaVersion,
      // The Workers AI binding does not expose a trustworthy cache hit/miss
      // signal. Record whether the invocation was eligible and use the
      // correlated Gateway log for the observed cache outcome.
      cache_status: cacheEnabled ? 'eligible' : 'bypass',
      fallback_used: fallbackUsed,
      latency_ms: Date.now() - startedAt,
      usage: attempt.usage
    }
  }
}

function gatewayMetadata(env: Env, task: TaskName, request: TaskRequest, promptVersion: string): Record<string, string> {
  return {
    environment: env.ENVIRONMENT,
    task,
    topic: request.topic_slug || 'global',
    execution_id: String(request.execution_id ?? 'none').slice(0, 100),
    prompt_version: promptVersion
  }
}

async function imageBytes(raw: unknown): Promise<Uint8Array | ArrayBuffer | ReadableStream> {
  if (raw instanceof ReadableStream || raw instanceof ArrayBuffer || raw instanceof Uint8Array) return raw
  const record = asRecord(raw)
  const resultRecord = asRecord(record.result)
  const dataRecord = asRecord((Array.isArray(record.data) ? record.data[0] : null))
  const payload = record.image ?? resultRecord.image ?? record.b64_json ?? dataRecord.b64_json ?? record.url ?? resultRecord.url ?? dataRecord.url
  if (typeof payload === 'string' && /^https:\/\//.test(payload)) {
    const response = await fetch(payload)
    if (!response.ok) throw new Error(`Image download failed with ${response.status}`)
    return response.arrayBuffer()
  }
  if (typeof payload === 'string' && payload) return decodeBase64(payload.replace(/^data:image\/[^;]+;base64,/, ''))
  throw new ApiError('AI_OUTPUT_INVALID', 'The image model returned no supported image payload.', 422, false)
}

async function audioBytes(raw: unknown): Promise<Uint8Array | ArrayBuffer | ReadableStream> {
  if (raw instanceof ReadableStream || raw instanceof ArrayBuffer || raw instanceof Uint8Array) return raw
  const record = asRecord(raw)
  const resultRecord = asRecord(record.result)
  const payload = record.audio ?? resultRecord.audio ?? resultRecord.url ?? record.audio_b64 ?? record.audioContent
  if (typeof payload === 'string' && /^https:\/\//.test(payload)) {
    const response = await fetch(payload)
    if (!response.ok) throw new Error(`Audio download failed with ${response.status}`)
    return response.arrayBuffer()
  }
  if (typeof payload === 'string' && payload) return decodeBase64(payload.replace(/^data:audio\/[^;]+;base64,/, ''))
  throw new ApiError('AI_OUTPUT_INVALID', 'The narration model returned no supported audio payload.', 422, false)
}

function imageInput(model: string, prompt: string): Record<string, unknown> {
  if (model === '@cf/black-forest-labs/flux-2-dev') {
    const form = new FormData()
    form.append('prompt', prompt)
    form.append('steps', '20')
    form.append('width', '1024')
    form.append('height', '1024')
    const formRequest = new Request('https://multipart.invalid', { method: 'POST', body: form })
    return {
      multipart: {
        body: formRequest.body,
        contentType: formRequest.headers.get('content-type') || 'multipart/form-data'
      }
    }
  }
  return { prompt, size: '1024x1024', quality: 'auto' }
}

function narrationInput(model: string, text: string, voice: string): Record<string, unknown> {
  if (model === '@cf/deepgram/aura-2-en') return { text, speaker: voice, encoding: 'mp3' }
  return { text, voice: 'alloy', response_format: 'mp3', speed: 1 }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function safeMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500)
}
