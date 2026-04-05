# Build Topic Day Page

Design or implement a Vue topic/day page for Modern Content Platform.

## Context

This project is a multi-topic intelligence and publishing platform.

Each topic/day page should support:
- topic title
- date centered at the top
- previous and next day arrows
- YouTube video near the top
- written daily summary below
- live alert timeline on the side
- placeholder summary state during the day

The website uses:
- Vue.js
- Cloudflare Pages
- Pages Functions
- D1 for live timeline data
- GitHub content for final daily editorial content

## Task

Help build or improve the topic/day page.

## Requirements

When responding:
- recommend one strongest route/component structure first
- prefer reusable components
- prefer dynamic routes
- separate static editorial content from live timeline fetches
- keep business logic out of presentation where possible
- support mobile behavior cleanly
- avoid one-off page implementations

## Preferred components

- TopicDayHeader
- DateNavigator
- VideoEmbed
- SummarySection
- SummaryPlaceholder
- AlertTimeline
- AlertTimelineItem
- PageStateBanner

## Output format

Respond in this structure:
1. Recommendation
2. Why
3. Route structure
4. Component structure
5. Data flow
6. Example code
7. Tradeoffs

## Notes

Desktop should prefer:
- main content area
- timeline side panel

Mobile should prefer:
- vertical stacking
- easy navigation
- readable summary layout