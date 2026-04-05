# Design Intraday Workflow

Design or improve an n8n intraday alert workflow for Modern Content Platform.

## Context

This project is a multi-topic AI intelligence and publishing platform.

Intraday workflow goals:
- monitor sources
- normalize incoming items
- deduplicate related signals
- classify and score important events
- generate alert text
- store alerts in Cloudflare D1
- send alerts to Telegram and Discord

Core stack:
- self-hosted n8n
- Cloudflare D1
- GitHub
- Vue frontend
- AI classification and summarization

## Task

Help design a modular, reliable intraday workflow.

## Requirements

When responding:
- recommend one strongest workflow design first
- break it into modules
- define triggers, inputs, outputs, and failure handling
- prefer structured JSON from AI steps
- include deduplication logic
- include retries and logging
- keep persistence separate from delivery
- optimize for safe reruns and idempotency

## Suggested modules

- ingestion
- normalization
- deduplication
- clustering
- AI classification
- alert decision
- timeline formatting
- D1 persistence
- Telegram delivery
- Discord delivery
- failure notification

## Output format

Respond in this structure:
1. Recommendation
2. Why
3. Workflow modules
4. Step-by-step flow
5. Input/output contracts
6. Failure handling
7. Tradeoffs

## Notes

Important principles:
- write to D1 before or alongside delivery
- avoid monolithic workflows
- do not let AI publish unvalidated output
- support multi-topic classification