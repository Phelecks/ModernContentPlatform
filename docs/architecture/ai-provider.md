# AI Provider — Architecture

## Overview

OpenAI is the default AI provider for Modern Content Platform v1.

All AI-powered steps — alert classification, timeline summarisation, daily
summary generation, article generation, expectation checks, tomorrow outlooks,
video script generation, and YouTube metadata generation — run through the
OpenAI Chat Completions API via the `OpenAiApi` n8n credential.

The integration is modular:

- every AI step lives in a dedicated n8n sub-workflow
- most AI prompts demand a **structured JSON output**; article generation
  (`daily/03_generate_article.json`) returns Markdown and is validated with
  Markdown-specific rules before use
- every AI output is **validated before use** — the workflow throws or falls
  back rather than storing malformed AI data
- model selection is **environment-controlled** via n8n variables
  (`AI_MODEL_STANDARD` and `AI_MODEL_FAST`) so no workflow JSON needs to be
  edited when switching models

---

## Task mapping

| Task | Workflow | Model tier | Why |
|------|----------|-----------|-----|
| Alert classification | `intraday/05_ai_classification.json` | `AI_MODEL_FAST` | High volume, short prompts, cost-sensitive |
| Daily summary generation | `daily/02_generate_summary.json` | `AI_MODEL_STANDARD` | Quality matters; editorial output |
| Article generation | `daily/03_generate_article.json` | `AI_MODEL_STANDARD` | Long-form Markdown; needs strong reasoning |
| Expectation check | `daily/04_generate_expectation_check.json` | `AI_MODEL_STANDARD` | Analytical; compares predictions to outcomes |
| Tomorrow outlook | `daily/05_generate_tomorrow_outlook.json` | `AI_MODEL_STANDARD` | Forward-looking editorial content |
| Video script | `daily/06_generate_video_script.json` | `AI_MODEL_STANDARD` | Spoken-word quality; longer output |
| YouTube metadata | `daily/07_generate_youtube_metadata.json` | `AI_MODEL_FAST` | Short structured output; cost-sensitive |

### Model tiers

| Variable | Recommended value | Intended use |
|----------|-------------------|-------------|
| `AI_MODEL_STANDARD` | `gpt-4o` | Editorial content generation — summary, article, script |
| `AI_MODEL_FAST` | `gpt-4o-mini` | High-volume or short-output tasks — classification, metadata |

Create both variables in n8n **Settings → Variables** and set them to the
recommended values above unless you intentionally want different models.
Changing a variable immediately affects all subsequent workflow executions
without any code changes.

---

## Environment variable and credential setup

### n8n credential — `OpenAiApi`

Create one credential in n8n with type **OpenAI API** and name it exactly
`OpenAiApi`. Paste your OpenAI API key into the **API Key** field.

All AI nodes reference this credential by name. No workflow JSON needs to
change when rotating the API key.

### n8n variables

Set the following variables in **Settings → Variables** in your n8n instance:

| Variable | Required | Recommended value | Description |
|----------|----------|--------------------|-------------|
| `AI_MODEL_STANDARD` | Yes | `gpt-4o` | Model used for editorial generation tasks |
| `AI_MODEL_FAST` | Yes | `gpt-4o-mini` | Model used for classification and metadata tasks |

### `.env` / Docker environment

The `OPENAI_API_KEY` environment variable is passed to the n8n container via
`n8n/docker-compose.yml`. n8n uses it to pre-populate credentials or make it
available as a variable reference. Set it in `.env` (see `.env.example`).

The following variables are also passed to the n8n container and are available
as workflow variable references:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AI_PROVIDER` | No | `openai` | AI provider slug — only `openai` is supported in v1 |
| `OPENAI_MODEL_ALERT_CLASSIFICATION` | No | `gpt-4o-mini` | Model for alert classification |
| `OPENAI_MODEL_DAILY_SUMMARY` | No | `gpt-4o` | Model for daily summary generation |
| `OPENAI_MODEL_VIDEO_SCRIPT` | No | `gpt-4o` | Model for video script generation |
| `OPENAI_MODEL_YOUTUBE_METADATA` | No | `gpt-4o-mini` | Model for YouTube metadata generation |

Omitting a model variable causes the platform to use the default for that task.
Set a variable only when you want to override the default for a specific task.

Config parsing and validation are handled by `app/src/utils/openaiConfig.js`,
which exports `parseOpenAIConfig(env)`. It throws an `OPENAI_CONFIG_ERROR` when:
- `OPENAI_API_KEY` is missing or empty
- `AI_PROVIDER` is set to an unsupported value

Per-task model overrides fall back to their defaults when absent or empty, so
they are never a validation error.

---

## Structured output contract

Most AI steps use a **structured JSON output** contract. Article generation
(`daily/03_generate_article.json`) is the exception — it returns Markdown and
is validated with Markdown-specific rules before use.

For JSON-output steps:

- the system prompt defines an exact JSON schema the model must return
- the model is instructed to return **only** a JSON object — no markdown
  fences, no surrounding text
- the validation step (Code node after each AI call) strips code fences,
  parses JSON, and validates required fields before passing the output
  downstream
- on parse failure the workflow throws a descriptive error; alert
  classification additionally falls back to a zero-score safe default rather
  than dropping the item silently

For the Markdown article step, the validation Code node checks minimum content
length and structure rather than parsing JSON.

AI output schemas live in `schemas/ai/`:

| Schema file | Used by |
|-------------|---------|
| `alert_classification.json` | `05_ai_classification.json` |
| `daily_summary.json` | `02_generate_summary.json` |
| `expectation_check.json` | `04_generate_expectation_check.json` |
| `tomorrow_outlook.json` | `05_generate_tomorrow_outlook.json` |
| `video_script.json` | `06_generate_video_script.json` |
| `youtube_metadata.json` | `07_generate_youtube_metadata.json` |

---

## Retry behaviour

Every AI node is configured with `retryOnFail: true`, `maxTries: 3`, and a
5-second delay between attempts. This covers transient rate limits and
intermittent network failures.

After all retries are exhausted n8n triggers the `failure_notifier` workflow,
which sends a Telegram alert to the `FAILURE_ALERT_CHANNEL` chat.

---

## Cost management

- `AI_MODEL_FAST` (`gpt-4o-mini`) is used for all high-volume steps. At 15-minute
  intraday cycles each cycle classifies up to ~30 items; keeping this path on the
  fast tier controls the per-item cost.
- `AI_MODEL_STANDARD` (`gpt-4o`) is used only once per topic per day across six
  daily generation steps. The total daily token spend per topic is bounded by
  the `maxTokens` cap in each node (400–1 500 tokens per call).
- Both models can be changed to any OpenAI Chat Completions model that supports
  the same JSON output contract by updating the n8n variables.

---

## Adding a secondary AI provider (future)

To add a secondary provider (e.g., Anthropic Claude) in a future release:

1. Add a new n8n credential for the target provider.
2. Create a parallel sub-workflow variant for the affected task (e.g.,
   `05_ai_classification_claude.json`).
3. Add an `AI_PROVIDER` variable with values `openai` (default) or `claude`.
4. Add a Switch node in the orchestrator to route to the appropriate
   sub-workflow based on `$vars.AI_PROVIDER`.

No changes to the validation layer or downstream modules are required because
both providers must return the same structured JSON contract.

---

## Architecture boundaries

| Layer | AI responsibility |
|-------|-----------------|
| n8n | Calls the AI API; validates structured output; handles retries |
| AI | Classification, summarisation, generation — structured JSON only |
| D1 | Stores validated AI outputs (scores, headline, summary_text) |
| GitHub | Stores final editorial AI outputs (article, summary, script) |
| Vue frontend | Renders stored outputs; never calls AI directly |
| Pages Functions | Thin read APIs; no AI involvement |

AI does **not** publish content directly. Every AI output passes through a
validation step before it is written to D1 or GitHub.
