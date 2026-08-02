export const TASKS = [
  'alertClassification',
  'timelineFormatting',
  'dailySummary',
  'articleGeneration',
  'expectationCheck',
  'tomorrowOutlook',
  'videoScript',
  'youtubeMetadata',
  'metaSocial',
  'imageGeneration',
  'narration'
] as const

export type TaskName = typeof TASKS[number]
export type CacheMode = 'reuse' | 'refresh'

export interface TaskRequest {
  request_id: string
  execution_id?: string | number | null
  topic_slug?: string | null
  date_key?: string | null
  input: Record<string, unknown>
  cache_mode?: CacheMode
}

export interface TaskPolicy {
  task: TaskName
  promptVersion: string
  schemaVersion: string
  primaryModel: string
  fallbackModel: string
  temperature: number
  maxTokens: number
  cacheable: boolean
  kind: 'json' | 'markdown' | 'image' | 'audio'
}

export interface InvocationMeta {
  provider: string
  model: string
  gateway_log_id: string | null
  prompt_version: string
  schema_version: string
  cache_status: 'bypass' | 'eligible'
  fallback_used: boolean
  latency_ms: number
  usage: Record<string, unknown>
}

export interface Env {
  AI: Ai
  DB: D1Database
  AI_ASSETS: R2Bucket
  ENVIRONMENT: string
  GATEWAY_ID: string
  ACCESS_TEAM_DOMAIN: string
  ACCESS_AUD: string
  PUBLIC_BASE_URL: string
  ALLOW_LOCAL_AUTH?: string
  LOCAL_DEV_TOKEN?: string
  ASSET_SIGNING_KEY: string
}

export interface InvocationRecord {
  requestId: string
  task: TaskName
  executionId: string | null
  topicSlug: string | null
  dateKey: string | null
  provider: string | null
  model: string | null
  promptVersion: string
  schemaVersion: string
  gatewayLogId: string | null
  status: 'ok' | 'error'
  fallbackUsed: boolean
  cacheStatus: InvocationMeta['cache_status']
  latencyMs: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
  estimatedCostUsd: number | null
  errorCode: string | null
  errorMessage: string | null
}
