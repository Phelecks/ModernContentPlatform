#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const textWorkflows = [
  ['workflows/n8n/intraday/05_ai_classification.json', 'alertClassification', 'Expand Items', 'Classify with AI', 'Parse and Validate AI Output'],
  ['workflows/n8n/daily/02_generate_summary.json', 'dailySummary', 'Build Prompt Context', 'Generate Summary with AI', 'Parse and Validate Summary'],
  ['workflows/n8n/daily/03_generate_article.json', 'articleGeneration', 'Execute Workflow Trigger', 'Generate Article with AI', 'Validate Article'],
  ['workflows/n8n/daily/04_generate_expectation_check.json', 'expectationCheck', 'Execute Workflow Trigger', 'Generate Expectation Check with AI', 'Parse and Validate Expectation Check'],
  ['workflows/n8n/daily/05_generate_tomorrow_outlook.json', 'tomorrowOutlook', 'Execute Workflow Trigger', 'Generate Tomorrow Outlook with AI', 'Parse and Validate Tomorrow Outlook'],
  ['workflows/n8n/daily/06_generate_video_script.json', 'videoScript', 'Execute Workflow Trigger', 'Generate Video Script with AI', 'Parse and Validate Video Script'],
  ['workflows/n8n/daily/07_generate_youtube_metadata.json', 'youtubeMetadata', 'Execute Workflow Trigger', 'Generate YouTube Metadata with AI', 'Parse and Validate YouTube Metadata'],
  ['workflows/n8n/daily/11_generate_meta_social.json', 'metaSocial', 'Build AI Prompt', 'AI Generate Social Post', 'Parse and Validate AI Output']
]

const mediaWorkflows = [
  ['workflows/n8n/daily/06b_generate_images.json', 'imageGeneration', 'Build Image Prompt', 'Validate Image Asset', 'image_assets'],
  ['workflows/n8n/daily/06c_generate_narration.json', 'narration', 'Build Narration Text', 'Validate Narration Asset', 'narration_asset']
]

for (const [file, task, predecessor, legacyNode, parser] of textWorkflows) {
  update(file, workflow => migrateText(workflow, task, predecessor, legacyNode, parser))
}

for (const [file, task, predecessor, validator, outputField] of mediaWorkflows) {
  update(file, workflow => migrateMedia(workflow, task, predecessor, validator, outputField))
}

updateOrchestrator()
updateRuntimeSelectors()

function update(file, mutate) {
  const absolute = path.join(root, file)
  const workflow = JSON.parse(fs.readFileSync(absolute, 'utf8'))
  if (workflow.nodes.some(node => node.name === 'AI Runtime Route')) return
  mutate(workflow)
  fs.writeFileSync(absolute, `${JSON.stringify(workflow, null, 2)}\n`)
}

function updateOrchestrator() {
  const absolute = path.join(root, 'workflows/n8n/daily/orchestrator.json')
  const workflow = JSON.parse(fs.readFileSync(absolute, 'utf8'))
  const build = node(workflow, 'Build Topic Context')
  if (!build.parameters.jsCode.includes('const ai_runtime =')) {
    build.parameters.jsCode = build.parameters.jsCode
      .replace(
        "const ai_provider = rawProvider !== '' ? rawProvider : 'openai';",
        "const ai_provider = rawProvider !== '' ? rawProvider : 'openai';\n\nconst VALID_AI_RUNTIMES = ['legacy', 'shadow', 'cloudflare'];\nconst ai_runtime = ($vars.AI_RUNTIME || 'legacy').trim().toLowerCase();\nif (!VALID_AI_RUNTIMES.includes(ai_runtime)) {\n  throw new Error(`AI_RUNTIME_CONFIG_ERROR: Unknown AI_RUNTIME \\\"${ai_runtime}\\\". Supported values: ${VALID_AI_RUNTIMES.join(', ')}.`);\n}"
      )
      .replace(
        'return [{ json: { topic_slug, date_key, ai_provider, media_mode } }];',
        'return [{ json: { topic_slug, date_key, ai_provider, media_mode, ai_runtime } }];'
      )
  }

  const merge = node(workflow, 'Merge Job Context')
  if (!merge.parameters.jsCode.includes('ai_runtime: ctx.ai_runtime')) {
    merge.parameters.jsCode = merge.parameters.jsCode.replace(
      'date_key: ctx.date_key,',
      'date_key: ctx.date_key,\n    ai_provider: ctx.ai_provider,\n    media_mode: ctx.media_mode,\n    ai_runtime: ctx.ai_runtime,'
    )
  }

  const extract = node(workflow, 'Extract Publish Job ID')
  extract.parameters.jsCode = extract.parameters.jsCode.replace(
    'return [{ json: { topic_slug: ctx.topic_slug, date_key: ctx.date_key, publish_job_id } }];',
    'return [{ json: { ...ctx, publish_job_id } }];'
  )

  fs.writeFileSync(absolute, `${JSON.stringify(workflow, null, 2)}\n`)
}

function migrateText(workflow, task, predecessor, legacyNode, parser) {
  const legacy = node(workflow, legacyNode)
  const [x, y] = legacy.position
  legacy.position = [x + 520, y - 160]

  workflow.nodes.push(
    runtimeSwitch(task, [x, y]),
    runtimeCall(task, false, [x + 260, y + 120]),
    runtimeCall(task, true, [x + 260, y + 320]),
    codeNode('Normalize AI Runtime Response', [x + 520, y + 120],
      `const response = $input.first().json;\nconst content = typeof response.output === 'string' ? response.output : JSON.stringify(response.output);\nreturn [{ json: { message: { content }, _ai_runtime_meta: response.meta || null } }];`),
    codeNode('Shadow: Restore Legacy Input', [x + 520, y + 320],
      `const original = $('${predecessor.replaceAll("'", "\\'")}').item.json;\nreturn [{ json: { ...original, _ai_shadow: $input.first().json } }];`)
  )

  workflow.connections[predecessor] = mainTo('AI Runtime Route')
  workflow.connections['AI Runtime Route'] = {
    legacy: [[edge(legacyNode)]],
    shadow: [[edge('Call AI Runtime (Shadow)')]],
    cloudflare: [[edge('Call AI Runtime')]],
    extra: [[edge(legacyNode)]]
  }
  workflow.connections['Call AI Runtime'] = mainTo('Normalize AI Runtime Response')
  workflow.connections['Normalize AI Runtime Response'] = mainTo(parser)
  workflow.connections['Call AI Runtime (Shadow)'] = mainTo('Shadow: Restore Legacy Input')
  workflow.connections['Shadow: Restore Legacy Input'] = mainTo(legacyNode)
}

function migrateMedia(workflow, task, predecessor, validator, outputField) {
  const providerRoute = node(workflow, 'Route by Provider')
  const [x, y] = providerRoute.position
  providerRoute.position = [x + 520, y - 160]

  workflow.nodes.push(
    runtimeSwitch(task, [x, y]),
    runtimeCall(task, false, [x + 260, y + 120]),
    runtimeCall(task, true, [x + 260, y + 320]),
    codeNode('Normalize AI Runtime Media', [x + 520, y + 120],
      `const response = $input.first().json;\nconst ctx = $('${predecessor}').item.json;\nreturn [{ json: { ...ctx, ${outputField}: response.output, _ai_runtime_meta: response.meta || null } }];`),
    codeNode('Shadow: Restore Legacy Input', [x + 520, y + 320],
      `const original = $('${predecessor}').item.json;\nreturn [{ json: { ...original, _ai_shadow: $input.first().json } }];`)
  )

  workflow.connections[predecessor] = mainTo('AI Runtime Route')
  workflow.connections['AI Runtime Route'] = {
    legacy: [[edge('Route by Provider')]],
    shadow: [[edge('Call AI Runtime (Shadow)')]],
    cloudflare: [[edge('Call AI Runtime')]],
    extra: [[edge('Route by Provider')]]
  }
  workflow.connections['Call AI Runtime'] = mainTo('Normalize AI Runtime Media')
  workflow.connections['Normalize AI Runtime Media'] = mainTo(validator)
  workflow.connections['Call AI Runtime (Shadow)'] = mainTo('Shadow: Restore Legacy Input')
  workflow.connections['Shadow: Restore Legacy Input'] = mainTo('Route by Provider')

  const validationNode = node(workflow, validator)
  validationNode.parameters.jsCode = validationNode.parameters.jsCode
    .replace("['openai', 'google']", "['openai', 'google', 'cloudflare']")
    .replace("['url', 'b64_json']", "['url', 'b64_json', 'r2_url']")
    .replace("['b64_json']", "['b64_json', 'r2_url']")

  if (task === 'imageGeneration') {
    validationNode.parameters.jsCode = validationNode.parameters.jsCode.replace(
      "if (img.format === 'b64_json' && !img.b64_json) errors.push(`images[${i}].b64_json missing for b64_json format`);",
      "if (img.format === 'b64_json' && !img.b64_json) errors.push(`images[${i}].b64_json missing for b64_json format`);\n      if (img.format === 'r2_url' && (!img.url || !img.object_key)) errors.push(`images[${i}] missing signed URL or R2 object key`);"
    )
  } else {
    validationNode.parameters.jsCode = validationNode.parameters.jsCode.replace(
      "if (asset.audio_b64 !== null && asset.audio_b64 !== undefined && typeof asset.audio_b64 !== 'string') {",
      "if (asset.format === 'r2_url' && (!asset.audio_url || !asset.object_key)) errors.push('r2_url narration missing signed URL or object key');\n  if (asset.audio_b64 !== null && asset.audio_b64 !== undefined && typeof asset.audio_b64 !== 'string') {"
    )
  }
}

function runtimeSwitch(task, position) {
  const variable = runtimeVariable(task)
  const rule = value => ({
    conditions: {
      options: { caseSensitive: false },
      conditions: [{
        leftValue: `={{ ($vars.${variable} || $vars.AI_RUNTIME || 'legacy').toLowerCase() }}`,
        rightValue: value,
        operator: { type: 'string', operation: 'equals' }
      }]
    },
    renameOutput: true,
    outputKey: value
  })
  return {
    parameters: {
      rules: { values: ['legacy', 'shadow', 'cloudflare'].map(rule) },
      options: { fallbackOutput: 'extra' }
    },
    id: idFor(`runtime-route-${position.join('-')}`),
    name: 'AI Runtime Route',
    type: 'n8n-nodes-base.switch',
    typeVersion: 3,
    position
  }
}

function updateRuntimeSelectors() {
  for (const [file, task] of [...textWorkflows, ...mediaWorkflows]) {
    const absolute = path.join(root, file)
    const workflow = JSON.parse(fs.readFileSync(absolute, 'utf8'))
    const route = node(workflow, 'AI Runtime Route')
    const variable = runtimeVariable(task)
    for (const rule of route.parameters.rules.values) {
      rule.conditions.conditions[0].leftValue = `={{ ($vars.${variable} || $vars.AI_RUNTIME || 'legacy').toLowerCase() }}`
    }
    if (!workflow.nodes.some(current => current.name === 'Invalid AI Runtime')) {
      workflow.nodes.push(codeNode('Invalid AI Runtime', [route.position[0] + 260, route.position[1] + 500],
        `throw new Error('AI_RUNTIME_CONFIG_ERROR: ${variable} or AI_RUNTIME must be legacy, shadow, or cloudflare.');`))
    }
    workflow.connections['AI Runtime Route'].extra = [[edge('Invalid AI Runtime')]]
    fs.writeFileSync(absolute, `${JSON.stringify(workflow, null, 2)}\n`)
  }
}

function runtimeVariable(task) {
  if (['alertClassification', 'timelineFormatting', 'youtubeMetadata', 'metaSocial'].includes(task)) return 'AI_RUNTIME_FAST'
  if (task === 'imageGeneration') return 'AI_RUNTIME_IMAGE'
  if (task === 'narration') return 'AI_RUNTIME_NARRATION'
  return 'AI_RUNTIME_EDITORIAL'
}

function runtimeCall(task, shadow, position) {
  const name = shadow ? 'Call AI Runtime (Shadow)' : 'Call AI Runtime'
  return {
    parameters: {
      url: `={{ ($vars.AI_RUNTIME_URL || '').replace(/\\/$/, '') + '/v1/tasks/${task}' }}`,
      method: 'POST',
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      sendHeaders: true,
      headerParameters: { parameters: [{ name: 'Content-Type', value: 'application/json' }] },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: `={{ { request_id: String($execution.id) + '-${task}-' + String($itemIndex), execution_id: String($execution.id), topic_slug: $json.topic_slug || undefined, date_key: $json.date_key || undefined, input: $json, cache_mode: $json.force_regenerate ? 'refresh' : 'reuse' } }}`,
      options: { timeout: 120000 }
    },
    id: idFor(`${task}-${shadow ? 'shadow' : 'authoritative'}`),
    name,
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4,
    position,
    credentials: {
      httpHeaderAuth: { id: 'mcp-ai-runtime-access', name: 'McpAiRuntimeAccess' }
    },
    ...(shadow ? { continueOnFail: true } : {})
  }
}

function codeNode(name, position, jsCode) {
  return {
    parameters: { jsCode },
    id: idFor(`${name}-${position.join('-')}`),
    name,
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position
  }
}

function node(workflow, name) {
  const found = workflow.nodes.find(candidate => candidate.name === name)
  if (!found) throw new Error(`${workflow.name}: node not found: ${name}`)
  return found
}

function edge(name) {
  return { node: name, type: 'main', index: 0 }
}

function mainTo(name) {
  return { main: [[edge(name)]] }
}

function idFor(value) {
  let hash = 2166136261
  for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619)
  const hex = (hash >>> 0).toString(16).padStart(8, '0')
  return `${hex}-a100-4f00-8000-${hex}${hex.slice(0, 4)}`
}
