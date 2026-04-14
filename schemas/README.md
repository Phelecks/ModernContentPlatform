# Schemas

Structured schemas shared across the platform live here.

- `ai/` — validated AI output shapes (JSON Schema draft-07)
- `api/` — Pages Functions response contracts
- `content/` — editorial content shape definitions
- `workflow/` — workflow step payload contracts

Use these schemas to keep boundaries explicit between Vue, Pages Functions, n8n, and AI steps.

---

## AI schemas (`schemas/ai/`)

All JSON-output AI steps must return a valid JSON object matching the relevant schema before any downstream consumer (n8n, D1, GitHub, or the frontend) uses them. Validation runs in n8n code nodes immediately after each AI call. The daily article generation step (`daily/03_generate_article.json`) is the exception — it returns Markdown and is validated with Markdown-specific rules instead.

Every JSON-output OpenAI node in the n8n workflows sets `responseFormat: "json_object"` (OpenAI `response_format: { type: "json_object" }`). This enforces valid JSON at the API level before validation runs, so the workflow never receives malformed non-JSON responses.

The reusable validation logic for all AI output schemas is implemented in `app/src/utils/validateAiOutput.js`. It exports per-task `validate*` and `parseAndValidate*` functions that can be used in tests, scripts, and any JS consumer outside n8n.

### Schema list

| File | AI step | Consumed by | Flow |
|---|---|---|---|
| `alert_classification.json` | Alert classification | n8n module 05 → modules 06–09 | Intraday |
| `timeline_entry.json` | Timeline entry formatting | *(not yet wired — future intraday step after module 05)* | Intraday |
| `daily_summary.json` | Daily summary generation | n8n module 02 → module 08 → GitHub | Daily editorial |
| `expectation_check.json` | Expectation check | n8n module 04 → module 08 → GitHub | Daily editorial |
| `tomorrow_outlook.json` | Tomorrow outlook | n8n module 05 → module 08 → GitHub | Daily editorial |
| `video_script.json` | Video script generation | n8n module 06 → module 08 → GitHub | Daily editorial |
| `youtube_metadata.json` | YouTube metadata generation | n8n module 07 → module 08 → YouTube | Daily editorial |

---

### `alert_classification.json`

**AI step:** Alert classification (intraday module 05).

**Purpose:** Primary classification of a raw normalized news item. The AI assigns a topic, scores severity, importance, and confidence, decides whether to send an alert, and identifies a cluster label.

**Required fields:** `topic_slug`, `headline`, `summary_text`, `severity_score`, `importance_score`, `confidence_score`, `send_alert`, `cluster_label`

**Optional fields:** `secondary_topics`, `alert_reason`

**Usage notes:**
- Validated by the Parse and Validate AI Output code node in module 05.
- `send_alert` is advisory — the alert decision module (06) applies additional threshold rules before finalising.
- `cluster_label` is used by module 07 to upsert the `event_clusters` table in D1.
- Scores must be integers 0–100; the code node clamps and rounds any out-of-range values.
- `additionalProperties: false` — the AI must not return extra fields.

---

### `timeline_entry.json`

**AI step:** Timeline entry formatting (intraday, after classification).

**Purpose:** Defines the structured output for a display-ready version of an alert for the live timeline. It reformats the headline and summary for scannability and assigns a human-readable label and severity level for frontend styling when that formatting step is wired into the intraday flow.

**Required fields:** `headline`, `summary_text`, `severity_level`, `label`

**Optional fields:** `label_color`

**Usage notes:**
- Intended to run after `alert_classification` for alerts that have already passed the intraday alert decision flow; there is no separate display-threshold path in the current workflow.
- `severity_level` is derived from the classification `severity_score`: high ≥ 75, medium ≥ 40, low < 40.
- `label` should be a short human-readable category badge (e.g. "Price Action", "Regulatory", "Macro").
- `headline` has a tighter 150-character limit than the classification headline to suit the timeline UI.
- Current intraday D1 persistence does not write these timeline formatting fields into `alerts.metadata_json`; the existing `metadata_json` payload only includes `item_id`, `secondary_topics`, and `alert_reason`.
- Treat this schema as the contract for future timeline-formatting wiring unless and until the workflow is updated to persist or otherwise consume `headline`, `summary_text`, `severity_level`, `label`, and `label_color`.
- `label_color` is a semantic hint; if this schema is wired into the frontend later, the UI may still ignore it and apply its own colour logic.

---

### `daily_summary.json`

**AI step:** Daily summary generation (daily module 02).

**Purpose:** Produces the structured editorial summary for a topic on a specific day. The overview, key events, sentiment, and topic score are consumed by the article generator and rendered on the topic/day page.

**Required fields:** `headline`, `overview`, `key_events`, `sentiment`, `topic_score`

**Optional fields:** `market_context`

**Usage notes:**
- Input context is the `daily_aggregate_context` contract built by module 01.
- `key_events` must have 1–7 items, ranked by `importance_score` descending.
- `sentiment` enum: `bullish`, `bearish`, `neutral`, `mixed`.
- `topic_score` represents overall activity level for the day (0 = quiet, 100 = extremely active).
- Validated by module 08 (`08_validate_outputs.json`) before GitHub publishing.
- The `summary` object is embedded in the `daily_generation_output` contract passed to module 09.

---

### `expectation_check.json`

**AI step:** Expectation check (daily module 04).

**Purpose:** Compares the day's actual events against the prior day's tomorrow outlook. Identifies which expectations were met, missed, or partially met, and surfaces surprise events.

**Required fields:** `expectations_checked`, `surprise_events`, `alignment_score`

**Optional fields:** `analyst_note`

**Usage notes:**
- Input is the prior day's `tomorrow_outlook` output plus today's alert/cluster context.
- `expectations_checked` may be empty (array length 0) when no prior outlook exists.
- `alignment_score` 0–100: 0 = day was completely unexpected, 100 = exactly as anticipated.
- Validated by module 08 before inclusion in the daily generation output.
- Rendered as a standalone section on the topic/day page.

---

### `tomorrow_outlook.json`

**AI step:** Tomorrow outlook (daily module 05).

**Purpose:** Forward-looking section covering key watchpoints and scheduled events for the next session. Stored in GitHub and displayed on the current day's topic/day page.

**Required fields:** `key_watchpoints`, `scheduled_events`, `outlook_summary`, `risk_level`

**Optional fields:** none

**Usage notes:**
- `key_watchpoints` must have 1–5 items.
- `scheduled_events` may be empty when no relevant events are scheduled.
- `risk_level` enum: `low`, `medium`, `high`.
- Tomorrow's output is also used as the input expectation context when the next day's `expectation_check` runs.
- Validated by module 08 before GitHub publishing.

---

### `video_script.json`

**AI step:** Video script generation (daily module 06).

**Purpose:** Produces a spoken-word script for the daily topic video, structured as intro + segments + outro. Used to generate the YouTube video via text-to-speech or presenter recording.

**Required fields:** `intro`, `segments`, `outro`, `total_duration_seconds`

**Optional fields:** `call_to_action`

**Usage notes:**
- `segments` must have 2–5 items, each covering one key event or theme.
- `total_duration_seconds` should reflect the realistic sum of all segment durations plus intro and outro.
- Validated by module 08. Stored in GitHub alongside the editorial article.
- `call_to_action` is appended at the end of the outro for subscriber engagement.

---

### `youtube_metadata.json`

**AI step:** YouTube metadata generation (daily module 07).

**Purpose:** Produces title, description, and tags for the daily topic video uploaded to YouTube. Used directly by the YouTube Data API v3 during publishing.

**Required fields:** `title`, `description`, `tags`

**Optional fields:** `category`, `visibility`

**Usage notes:**
- `title` max 100 characters (YouTube API limit for safe display); must include the topic and date context.
- `description` max 5000 characters (YouTube API limit); plain text, no HTML.
- `tags` 5–15 items; mix of broad topic keywords and specific event keywords for discoverability.
- `visibility` defaults to `public`; set to `unlisted` for testing or delayed publish.
- Validated by module 08 before the YouTube publish step.