#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const workflowRoot = path.join(root, 'workflows/n8n')

const legacyAllowlist = new Map(Object.entries({
  'intraday/05_ai_classification.json': ['Classify with AI'],
  'daily/02_generate_summary.json': ['Generate Summary with AI'],
  'daily/03_generate_article.json': ['Generate Article with AI'],
  'daily/04_generate_expectation_check.json': ['Generate Expectation Check with AI'],
  'daily/05_generate_tomorrow_outlook.json': ['Generate Tomorrow Outlook with AI'],
  'daily/06_generate_video_script.json': ['Generate Video Script with AI'],
  'daily/07_generate_youtube_metadata.json': ['Generate YouTube Metadata with AI'],
  'daily/11_generate_meta_social.json': ['AI Generate Social Post'],
  'daily/06b_generate_images.json': ['Generate Image — Google Imagen', 'Generate Image — OpenAI'],
  'daily/06c_generate_narration.json': ['Generate Narration — Google TTS', 'Generate Narration — OpenAI TTS']
}))

const expectedTasks = new Map(Object.entries({
  'intraday/05_ai_classification.json': 'alertClassification',
  'daily/02_generate_summary.json': 'dailySummary',
  'daily/03_generate_article.json': 'articleGeneration',
  'daily/04_generate_expectation_check.json': 'expectationCheck',
  'daily/05_generate_tomorrow_outlook.json': 'tomorrowOutlook',
  'daily/06_generate_video_script.json': 'videoScript',
  'daily/07_generate_youtube_metadata.json': 'youtubeMetadata',
  'daily/11_generate_meta_social.json': 'metaSocial',
  'daily/06b_generate_images.json': 'imageGeneration',
  'daily/06c_generate_narration.json': 'narration'
}))

const errors = []
for (const absolute of walk(workflowRoot, '.json')) {
  const relative = path.relative(workflowRoot, absolute).replaceAll(path.sep, '/')
  let workflow
  try {
    workflow = JSON.parse(fs.readFileSync(absolute, 'utf8'))
  } catch (error) {
    errors.push(`${relative}: invalid JSON: ${error.message}`)
    continue
  }

  const directNodes = workflow.nodes.filter(isDirectProviderNode)
  if (directNodes.length) {
    const allowed = new Set(legacyAllowlist.get(relative) || [])
    for (const current of directNodes) {
      if (!allowed.has(current.name)) errors.push(`${relative}: unapproved direct AI node ${current.name}`)
    }
    if (!workflow.nodes.some(current => current.name === 'AI Runtime Route')) {
      errors.push(`${relative}: retained legacy AI nodes are not behind AI Runtime Route`)
    }
  }

  const expectedTask = expectedTasks.get(relative)
  if (expectedTask) {
    const calls = workflow.nodes.filter(current => current.name === 'Call AI Runtime' || current.name === 'Call AI Runtime (Shadow)')
    if (calls.length !== 2) errors.push(`${relative}: expected authoritative and shadow AI Runtime calls`)
    for (const call of calls) {
      const serialized = JSON.stringify(call.parameters)
      if (!serialized.includes(`/v1/tasks/${expectedTask}`)) errors.push(`${relative}: ${call.name} targets the wrong task`)
      if (/\b(prompt|model|provider|max_tokens|gateway)\b\s*:/.test(String(call.parameters.jsonBody || ''))) {
        errors.push(`${relative}: ${call.name} attempts to control server-owned AI policy`)
      }
    }
    const invalidTarget = workflow.connections?.['AI Runtime Route']?.extra?.[0]?.[0]?.node
    if (invalidTarget !== 'Invalid AI Runtime') errors.push(`${relative}: invalid AI runtime values must fail closed`)
  }
}

for (const schema of [
  'alert_classification.json', 'daily_summary.json', 'expectation_check.json',
  'image_generation_asset.json', 'meta_social_post.json', 'narration_asset.json',
  'timeline_entry.json', 'tomorrow_outlook.json', 'video_script.json', 'youtube_metadata.json'
]) {
  const file = path.join(root, 'schemas/ai', schema)
  if (!fs.existsSync(file)) errors.push(`schemas/ai/${schema}: required Worker schema is missing`)
  else {
    try { JSON.parse(fs.readFileSync(file, 'utf8')) } catch (error) { errors.push(`schemas/ai/${schema}: invalid JSON: ${error.message}`) }
  }
}

if (errors.length) {
  console.error(errors.join('\n'))
  process.exit(1)
}
console.log('AI runtime boundary check passed.')

function isDirectProviderNode(current) {
  const type = String(current.type || '').toLowerCase()
  const url = String(current.parameters?.url || '').toLowerCase()
  return type.includes('openai') || /api\.openai\.com|generativelanguage\.googleapis\.com|texttospeech\.googleapis\.com/.test(url)
}

function walk(directory, extension) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const absolute = path.join(directory, entry.name)
    return entry.isDirectory() ? walk(absolute, extension) : entry.name.endsWith(extension) ? [absolute] : []
  })
}
