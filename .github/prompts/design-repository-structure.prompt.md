# Design Repository Structure

Design the initial repository structure for Modern Content Platform.

## Context

This project is a multi-topic AI intelligence and publishing platform.

Core stack:
- Vue.js
- Cloudflare Pages
- Cloudflare Pages Functions
- Cloudflare D1
- GitHub
- self-hosted n8n
- AI workflows
- Telegram
- Discord
- YouTube

The platform has two core flows:
1. Intraday alerts
2. Daily editorial publishing

System responsibilities:
- GitHub stores final editorial content
- D1 stores alerts, daily status, publish state, and live operational state
- n8n handles orchestration and automation
- Vue handles frontend rendering
- Pages Functions provide thin read APIs over D1

## Task

Help design a simple, modular, scalable repository structure.

## Requirements

When responding:
- recommend one strongest structure first
- keep app code, content, database, workflows, schemas, and docs clearly separated
- assume multi-topic growth over time
- keep v1 lean and implementation-friendly
- avoid overengineering
- prefer folders that map cleanly to platform responsibilities

## Output format

Respond in this structure:
1. Recommended folder structure
2. Why this structure is best
3. Which folders are essential for v1
4. Which folders can be added later

## Notes

Important principles:
- keep frontend, API, database, content, and workflow concerns separate
- store final published editorial artifacts in GitHub
- treat D1 as the operational and live-state store
- keep Pages Functions thin
- keep n8n workflow assets modular and easy to rerun
- optimize for reusable topic/day patterns rather than topic-specific code