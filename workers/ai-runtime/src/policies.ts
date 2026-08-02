import type { TaskName, TaskPolicy } from './types.js'

const FAST_MODEL = '@cf/openai/gpt-oss-20b'
const STANDARD_MODEL = '@cf/openai/gpt-oss-120b'
const FAST_FALLBACK = 'openai/gpt-4o-mini'
const STANDARD_FALLBACK = 'openai/gpt-4o'

export const TASK_POLICIES: Record<TaskName, TaskPolicy> = {
  alertClassification: policy('alertClassification', 'alert-classification-v1', FAST_MODEL, FAST_FALLBACK, 0.1, 400, false, 'json'),
  timelineFormatting: policy('timelineFormatting', 'timeline-formatting-v1', FAST_MODEL, FAST_FALLBACK, 0.1, 300, false, 'json'),
  dailySummary: policy('dailySummary', 'daily-summary-v1', STANDARD_MODEL, STANDARD_FALLBACK, 0.2, 1000, true, 'json'),
  articleGeneration: policy('articleGeneration', 'article-generation-v1', STANDARD_MODEL, STANDARD_FALLBACK, 0.3, 1500, true, 'markdown'),
  expectationCheck: policy('expectationCheck', 'expectation-check-v1', STANDARD_MODEL, STANDARD_FALLBACK, 0.2, 700, true, 'json'),
  tomorrowOutlook: policy('tomorrowOutlook', 'tomorrow-outlook-v1', STANDARD_MODEL, STANDARD_FALLBACK, 0.2, 700, true, 'json'),
  videoScript: policy('videoScript', 'video-script-v1', STANDARD_MODEL, STANDARD_FALLBACK, 0.4, 1500, true, 'json'),
  youtubeMetadata: policy('youtubeMetadata', 'youtube-metadata-v1', FAST_MODEL, FAST_FALLBACK, 0.2, 800, true, 'json'),
  metaSocial: policy('metaSocial', 'meta-social-v1', FAST_MODEL, FAST_FALLBACK, 0.6, 800, true, 'json'),
  imageGeneration: policy('imageGeneration', 'image-generation-v1', '@cf/black-forest-labs/flux-2-dev', 'openai/gpt-image-1.5', 0, 0, false, 'image'),
  narration: policy('narration', 'narration-v1', '@cf/deepgram/aura-2-en', 'openai/tts-1', 0, 0, false, 'audio')
}

function policy(
  task: TaskName,
  promptVersion: string,
  primaryModel: string,
  fallbackModel: string,
  temperature: number,
  maxTokens: number,
  cacheable: boolean,
  kind: TaskPolicy['kind']
): TaskPolicy {
  return {
    task,
    promptVersion,
    schemaVersion: '1',
    primaryModel,
    fallbackModel,
    temperature,
    maxTokens,
    cacheable,
    kind
  }
}

export function providerFor(model: string): string {
  if (model.startsWith('@cf/')) return 'workers-ai'
  return model.split('/')[0] || 'unknown'
}
