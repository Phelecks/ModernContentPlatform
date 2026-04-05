# Design D1 Migration

Design or update a Cloudflare D1 migration for Modern Content Platform.

## Context

This repository powers a multi-topic AI intelligence and publishing platform.

Core stack:
- Vue.js frontend
- Cloudflare Pages
- Cloudflare Pages Functions
- Cloudflare D1
- GitHub
- self-hosted n8n
- AI workflows

The platform has two core flows:
1. Intraday alerts
2. Daily editorial publishing

Cloudflare D1 stores:
- alerts
- event clusters
- daily status
- publish jobs
- workflow state
- navigation metadata

GitHub stores:
- final editorial content
- summary JSON
- markdown/article files

## Task

Help design a migration-safe D1 schema change.

## Requirements

When responding:
- recommend one strongest schema design first
- explain why briefly
- produce copy-paste-ready SQL
- include indexes
- preserve compatibility with existing tables where possible
- prefer `topic_slug` and `date_key`
- include `created_at` and `updated_at` when appropriate
- prefer explicit status fields
- avoid overengineering

## Output format

Respond in this structure:
1. Recommendation
2. Why
3. SQL migration
4. Indexes
5. Example queries
6. Tradeoffs

## Notes

Optimize for these read patterns:
- timeline by topic/date
- latest days for a topic
- previous/next day navigation
- daily status lookup
- publish readiness