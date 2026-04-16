# AI Provider — Architecture

## Overview

Modern Content Platform v1 now supports two first-class AI providers:
**OpenAI** and **Google**.

All internal AI tasks run through a provider-agnostic contract layer
(`app/src/utils/openaiConfig.js` exports `AI_TASK_CONTRACTS`,
`TASK_SUPPORT_MATRIX`, and `resolveTaskProvider()`), so workflow logic can
request a task and provider without embedding provider-specific rules.

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

## Provider/task support matrix (v1)

| Internal task | OpenAI | Google | Fallback behavior |
|---|---|---|---|
| alertClassification | ✅ | ✅ | none |
| timelineFormatting | ✅ | ✅ | none |
| dailySummary | ✅ | ✅ | none |
| articleGeneration | ✅ | ✅ | none |
| expectationCheck | ✅ | ✅ | none |
| tomorrowOutlook | ✅ | ✅ | none |
| videoScript | ✅ | ✅ | none |
| youtubeMetadata | ✅ | ✅ | none |
| imageGeneration | ✅ | ⚠️ not wired | fallback to OpenAI |
| tts | ✅ | ⚠️ not wired | fallback to OpenAI |

### Structured-output capability handling

- OpenAI JSON-output tasks use `responseFormat: "json_object"`.
- Google JSON-output tasks use `responseFormat: "prompt_and_validate"` in v1,
  then pass through the same deterministic validators.
- This difference is explicit in:
  - `OPENAI_STRUCTURED_OUTPUT_TASKS`
  - `GOOGLE_STRUCTURED_OUTPUT_TASKS`
  - `resolveTaskProvider()` fallback metadata

---

## Task mapping

| Task | Workflow | Default model | Model tier | Rationale |
|------|----------|--------------|-----------|-----------|
| Alert classification | `intraday/05_ai_classification.json` | `gpt-4o-mini` | Fast | High volume, short prompts, cost-sensitive; runs every 15 min per source |
| Timeline entry formatting | `intraday/05_ai_classification.json` | `gpt-4o-mini` | Fast | Headline and label generated within the same classification call today; separate workflow step planned for future |
| Daily summary generation | `daily/02_generate_summary.json` | `gpt-4o` | Standard | Editorial quality matters; moderate-length structured JSON output |
| Article generation | `daily/03_generate_article.json` | `gpt-4o` | Standard | Long-form Markdown; needs strong reasoning and coherent narrative |
| Expectation check | `daily/04_generate_expectation_check.json` | `gpt-4o` | Standard | Analytical; compares prior predictions to actual outcomes |
| Tomorrow outlook | `daily/05_generate_tomorrow_outlook.json` | `gpt-4o` | Standard | Forward-looking editorial content; requires nuanced reasoning |
| Video script generation | `daily/06_generate_video_script.json` | `gpt-4o` | Standard | Spoken-word quality; longer output; audience-facing |
| YouTube metadata generation | `daily/07_generate_youtube_metadata.json` | `gpt-4o-mini` | Fast | Short structured output (title, description, tags); cost-sensitive |

### Model tiers

| Variable | Default value | Intended use |
|----------|--------------|-------------|
| `AI_MODEL_STANDARD` | `gpt-4o` | Editorial content generation — summary, article, expectation check, outlook, script |
| `AI_MODEL_FAST` | `gpt-4o-mini` | High-volume or short-output tasks — classification, timeline formatting, metadata |

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

The following variables are also passed to the n8n container:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AI_PROVIDER` | No | `openai` | AI provider slug (`openai` or `google`) |
| `OPENAI_API_KEY` | Yes when `AI_PROVIDER=openai` | n/a | OpenAI API key |
| `GOOGLE_API_KEY` | Yes when `AI_PROVIDER=google` | n/a | Google API key |
| `OPENAI_MODEL_ALERT_CLASSIFICATION` | No | `gpt-4o-mini` | Alert classification (intraday fast tier) |
| `OPENAI_MODEL_TIMELINE_FORMATTING` | No | `gpt-4o-mini` | Timeline entry formatting (intraday fast tier) |
| `OPENAI_MODEL_DAILY_SUMMARY` | No | `gpt-4o` | Daily summary generation (daily standard tier) |
| `OPENAI_MODEL_ARTICLE_GENERATION` | No | `gpt-4o` | Article generation (daily standard tier) |
| `OPENAI_MODEL_EXPECTATION_CHECK` | No | `gpt-4o` | Expectation check (daily standard tier) |
| `OPENAI_MODEL_TOMORROW_OUTLOOK` | No | `gpt-4o` | Tomorrow outlook generation (daily standard tier) |
| `OPENAI_MODEL_VIDEO_SCRIPT` | No | `gpt-4o` | Video script generation (daily standard tier) |
| `OPENAI_MODEL_YOUTUBE_METADATA` | No | `gpt-4o-mini` | YouTube metadata generation (daily fast tier) |
| `GOOGLE_MODEL_ALERT_CLASSIFICATION` | No | `gemini-2.5-flash` | Alert classification model override |
| `GOOGLE_MODEL_TIMELINE_FORMATTING` | No | `gemini-2.5-flash` | Timeline formatting model override |
| `GOOGLE_MODEL_DAILY_SUMMARY` | No | `gemini-2.5-pro` | Daily summary model override |
| `GOOGLE_MODEL_ARTICLE_GENERATION` | No | `gemini-2.5-pro` | Article generation model override |
| `GOOGLE_MODEL_EXPECTATION_CHECK` | No | `gemini-2.5-pro` | Expectation check model override |
| `GOOGLE_MODEL_TOMORROW_OUTLOOK` | No | `gemini-2.5-pro` | Tomorrow outlook model override |
| `GOOGLE_MODEL_VIDEO_SCRIPT` | No | `gemini-2.5-pro` | Video script model override |
| `GOOGLE_MODEL_YOUTUBE_METADATA` | No | `gemini-2.5-flash` | YouTube metadata model override |

> **Important:** current n8n workflows select models via the n8n variables
> `$vars.AI_MODEL_STANDARD` and `$vars.AI_MODEL_FAST` (with hard-coded
> fallbacks), **not** via the `OPENAI_MODEL_*` environment variables above.
> Setting only `OPENAI_MODEL_*` here will **not** change workflow behavior
> unless you also map those values into n8n variables or update the workflows
> to reference them directly.
>
> For the current workflows, set these in **n8n Settings → Variables**:
> - `AI_MODEL_STANDARD=gpt-4o` — daily editorial tasks (summary, article,
>   expectation check, tomorrow outlook, video script)
> - `AI_MODEL_FAST=gpt-4o-mini` — intraday and short-output tasks
>   (classification, timeline formatting, YouTube metadata)

The `OPENAI_MODEL_*` environment variables document the intended per-task model
split and are consumed by `app/src/utils/openaiConfig.js` for local config
validation. They serve as the source of truth for future per-task workflow wiring.

Config parsing and validation are handled by `app/src/utils/openaiConfig.js`,
which exports `parseAIProviderConfig(env)` (with `parseOpenAIConfig(env)` kept
as a backward-compatible alias). It throws an `AI_PROVIDER_CONFIG_ERROR` when:
- provider-specific API key is missing (`OPENAI_API_KEY` or `GOOGLE_API_KEY`)
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
- the n8n OpenAI node sets `responseFormat: "json_object"` (maps to
  `response_format: { type: "json_object" }` in the OpenAI API) to enforce
  valid JSON at the API level, independent of prompt instructions
- the validation step (Code node after each AI call) strips any remaining code
  fences, parses JSON, and validates required fields before passing the output
  downstream
- on parse failure the workflow throws a descriptive error; alert
  classification additionally falls back to a zero-score safe default rather
  than dropping the item silently

`OPENAI_STRUCTURED_OUTPUT_TASKS` in `app/src/utils/openaiConfig.js` documents
the `responseFormat` setting for each task and serves as the canonical
reference for which tasks use JSON mode. The reusable validation logic for
each task lives in `app/src/utils/validateAiOutput.js`.

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
  intraday cycles each cycle classifies up to ~30 items and formats timeline entries;
  keeping both intraday paths on the fast tier controls the per-item cost.
- `AI_MODEL_STANDARD` (`gpt-4o`) is used only once per topic per day across five
  daily generation steps (summary, article, expectation check, tomorrow outlook,
  video script). YouTube metadata also runs once per day but on the fast tier.
  The total daily token spend per topic is bounded by the `maxTokens` cap in each
  node (400–1 500 tokens per call).
- The intraday `05_ai_classification.json` workflow applies a **pre-filter** step
  before any items reach the AI node. Items with too little content (headline +
  body under 10 chars) are dropped, and the batch is capped at `AI_MAX_ITEMS_PER_BATCH`
  (default 30) items per execution. This is the primary lever for controlling
  intraday API call volume.
- Both models can be changed to any OpenAI Chat Completions model that supports
  the same JSON output contract by updating the n8n variables.

For the full cost control strategy, per-task guardrails, and monitoring queries,
see [OpenAI Cost Controls and Usage Guardrails](./openai-cost-controls.md).

---

## When to override models

The two-tier model split (`gpt-4o` / `gpt-4o-mini`) is the recommended v1
default. Override individual tasks only when you have a clear reason:

| Scenario | Suggested override |
|----------|--------------------|
| Daily summary quality is too low | Check the prompt and token limits first; only set a task-specific `OPENAI_MODEL_*` override if you need a higher-quality compatible model than the standard tier |
| Alert classification cost is too high | Ensure `AI_MODEL_FAST` is `gpt-4o-mini`; do not upgrade to standard tier |
| Video script quality needs improvement | Verify prompt length first; if quality is still insufficient, set `OPENAI_MODEL_VIDEO_SCRIPT` to a higher-quality compatible model and update the workflow node |
| Testing a faster editorial pipeline | Set `AI_MODEL_STANDARD=gpt-4o-mini`; accept lower quality |
| A newer cheaper model is available | Update `AI_MODEL_FAST` in n8n variables only; no workflow JSON changes needed |
| A task needs a reasoning model | Set the task-specific `OPENAI_MODEL_*` var and update the corresponding workflow node |

**Rules of thumb:**

- Change `AI_MODEL_FAST` and `AI_MODEL_STANDARD` in n8n variables to affect all
  tasks in a tier at once.
- Set a task-specific `OPENAI_MODEL_*` env var (and wire it into the workflow
  node) only when one task needs a different model than the rest of its tier.
- Do not upgrade intraday classification to the standard tier — the volume makes
  it cost-prohibitive.
- Do not downgrade daily summary, article, or video script to the fast tier in
  production — quality will noticeably suffer.

---



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
