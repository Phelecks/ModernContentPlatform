---
name: n8n-workflows
description: Use this skill for n8n workflow architecture, modular automation design, retries, deduplication, AI step orchestration, publishing flows, and alert delivery logic.
---

# n8n Workflows Skill

This skill helps design and improve n8n workflows for Modern Content Platform.

## Use this skill when

Use this skill for tasks such as:
- designing ingestion workflows
- designing normalization and cleaning steps
- defining deduplication logic
- clustering related events
- orchestrating AI classification steps
- deciding alert thresholds
- storing records in D1
- delivering alerts to Telegram and Discord
- generating daily summaries
- generating video scripts
- publishing to GitHub
- triggering video generation or upload steps
- adding retries, logging, and failure handling

## Platform context

Modern Content Platform is a multi-topic AI intelligence and publishing platform.

The platform has two main flows:

1. Intraday alert flow
- fetch source items
- normalize incoming data
- deduplicate similar items
- classify and score importance
- generate alert text
- write timeline entries to D1
- send alerts to Telegram and Discord

2. Daily editorial flow
- gather all topic/day alerts
- aggregate event context
- generate one final daily summary
- generate one video script
- generate metadata
- publish content to GitHub
- trigger Cloudflare Pages deployment through GitHub push
- update status in D1

## Workflow design rules

Prefer:
- modular workflows over one giant workflow
- explicit input and output contracts between steps
- structured JSON from AI steps
- deterministic validation after AI output
- idempotency where possible
- retries for network/API failures
- logging and error capture
- separate publish status tracking
- clear branching for success, retry, and failure

## Recommended workflow modules

Preferred modules include:
- source ingestion
- normalization
- deduplication
- clustering
- AI classification
- alert decision
- timeline formatting
- D1 persistence
- Telegram delivery
- Discord delivery
- daily aggregation
- summary generation
- expectation check
- tomorrow outlook generation
- video script generation
- GitHub publishing
- publish state update
- failure notification

## Intraday workflow principles

For intraday alerts:
- normalize source items into one internal format
- assign topic candidates
- deduplicate before expensive AI steps where possible
- use AI for structured scoring and classification
- apply rules before sending alerts
- write to D1 before or together with downstream delivery
- keep delivery failures from corrupting timeline persistence

## Daily workflow principles

For daily summary generation:
- fetch all alerts for topic/date
- optionally fetch cluster summaries and source context
- validate that the day is ready for summarization
- generate structured daily summary output first
- then render article/script/metadata from that structured output
- update GitHub content
- update D1 status
- track publish job results

## AI usage rules

Use AI for:
- classification
- extraction
- ranking
- summarization
- timeline phrasing
- expectation checks
- tomorrow outlooks
- video script generation
- metadata generation

Do not let AI directly publish without validation.

Always prefer structured JSON outputs before final rendering or storage.

## Output contract rules

When defining workflow steps:
- specify trigger
- specify inputs
- specify transformation
- specify outputs
- specify failure behavior
- specify retry behavior
- specify state update behavior

## Reliability rules

Always think about:
- duplicate source ingestion
- repeat job safety
- partial downstream failure
- GitHub commit failure
- D1 write failure
- Telegram/Discord delivery failure
- YouTube/video pipeline delay
- late-arriving events
- reruns for the same topic/day

## Preferred D1 interaction pattern

n8n should write to D1 for:
- alerts
- clusters
- daily_status
- publish_jobs
- workflow state

The frontend should not depend on n8n internals directly.

## Output style

When responding with workflow help:
1. recommend one strongest workflow design
2. explain why
3. break it into modules
4. define step-by-step flow
5. provide structured input/output examples if useful
6. mention retries and failure handling
7. keep outputs practical and implementation-focused

## Avoid

Avoid:
- giant monolithic workflows
- unvalidated free-form AI outputs
- hidden business logic spread across many unrelated nodes
- delivery-first logic that skips persistence
- using n8n as a public API layer
- mixing final editorial publication state with raw ingestion state without separation

## Preferred outcome

The final output should be:
- modular
- reliable
- observable
- easy to debug
- easy to rerun safely
- aligned with n8n + D1 + GitHub + Vue + Cloudflare Pages