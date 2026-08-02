import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv'
import addFormats from 'ajv-formats'
import alertClassification from '../../../schemas/ai/alert_classification.json'
import dailySummary from '../../../schemas/ai/daily_summary.json'
import expectationCheck from '../../../schemas/ai/expectation_check.json'
import imageGenerationAsset from '../../../schemas/ai/image_generation_asset.json'
import metaSocialPost from '../../../schemas/ai/meta_social_post.json'
import narrationAsset from '../../../schemas/ai/narration_asset.json'
import timelineEntry from '../../../schemas/ai/timeline_entry.json'
import tomorrowOutlook from '../../../schemas/ai/tomorrow_outlook.json'
import videoScript from '../../../schemas/ai/video_script.json'
import youtubeMetadata from '../../../schemas/ai/youtube_metadata.json'
import { ApiError } from './errors.js'
import type { TaskName } from './types.js'

type JsonSchema = Record<string, unknown>

const schemas: Partial<Record<TaskName, JsonSchema>> = {
  alertClassification,
  timelineFormatting: timelineEntry,
  dailySummary,
  expectationCheck,
  tomorrowOutlook,
  videoScript,
  youtubeMetadata,
  metaSocial: metaSocialPost,
  imageGeneration: imageGenerationAsset,
  narration: narrationAsset
}

const AjvConstructor = Ajv as unknown as new (options?: Record<string, unknown>) => Ajv
const ajv = new AjvConstructor({ allErrors: true, strict: false })
addFormats(ajv)

const validators = new Map<TaskName, ValidateFunction>()
for (const [task, schema] of Object.entries(schemas)) {
  validators.set(task as TaskName, ajv.compile(schema as JsonSchema))
}

export function schemaForTask(task: TaskName): JsonSchema | null {
  return schemas[task] || null
}

export function parseModelJson(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>
  const text = String(raw || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
  try {
    const value = JSON.parse(text)
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an object')
    return value
  } catch (error) {
    throw new ApiError('AI_OUTPUT_INVALID', 'The model returned invalid JSON.', 422, false, error)
  }
}

export function validateTaskOutput(task: TaskName, output: unknown): void {
  if (task === 'articleGeneration') {
    const markdown = String(output || '').trim()
    if (markdown.length < 200) {
      throw new ApiError('AI_OUTPUT_INVALID', 'The generated article is shorter than 200 characters.', 422, false)
    }
    return
  }

  const validator = validators.get(task)
  if (!validator) throw new ApiError('TASK_CONFIGURATION_ERROR', `No validator is configured for ${task}.`, 500, false)
  if (!validator(output)) {
    throw new ApiError('AI_OUTPUT_INVALID', formatErrors(validator.errors), 422, false)
  }
}

function formatErrors(errors: ErrorObject[] | null | undefined): string {
  const detail = (errors || []).slice(0, 5).map(error => `${error.instancePath || '/'} ${error.message}`).join('; ')
  return `The model output failed schema validation${detail ? `: ${detail}` : '.'}`
}
