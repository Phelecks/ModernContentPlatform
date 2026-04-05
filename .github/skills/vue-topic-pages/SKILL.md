---
name: vue-topic-pages
description: Use this skill for Vue route design, topic/day page layout, reusable components, placeholder states, timeline UI, and responsive frontend structure.
---

# Vue Topic Pages Skill

This skill helps design and implement the Vue frontend structure for Modern Content Platform.

## Use this skill when

Use this skill for tasks such as:
- defining Vue routes
- building homepage topic cards
- building topic/day pages
- creating reusable components
- implementing date navigation
- rendering summary placeholder states
- embedding YouTube videos
- showing live timeline panels
- improving responsive layout and mobile behavior
- organizing frontend folder structure

## Platform context

Modern Content Platform is a multi-topic AI intelligence and publishing platform.

The website is built in Vue and hosted on Cloudflare Pages.

Each topic/day page should support:
- topic title
- date centered at the top
- previous day and next day arrows
- YouTube video near the top
- written daily summary below
- live alert timeline on the side or below on mobile

During the day:
- the page already exists
- the summary area may show a placeholder message
- the live timeline keeps updating from D1 through Pages Functions

At the end of the day:
- the final summary is shown
- the final video is embedded
- the page acts as a searchable topic/day archive page

## Architectural boundaries

Vue frontend owns:
- rendering
- page layout
- component composition
- route structure
- responsive behavior
- placeholder display
- summary display
- video embed
- timeline UI

Vue frontend should not own:
- publish orchestration
- D1 schema logic
- AI prompt logic
- heavy business rules for publish readiness

Pages Functions should provide the live data needed from D1.

GitHub should provide the final editorial content.

## Routing principles

Prefer:
- dynamic routes
- reusable templates
- one topic/day page pattern for all topics and dates
- simple URL structure
- clear navigation behavior

Preferred pattern:
- `/`
- `/topics/:topicSlug`
- `/topics/:topicSlug/:dateKey`

Alternative acceptable pattern:
- `/:topicSlug/:dateKey`

Prefer the more explicit route if clarity matters more than short URLs.

## Component priorities

Preferred reusable components:
- `TopicCard`
- `TopicGrid`
- `TopicDayHeader`
- `DateNavigator`
- `VideoEmbed`
- `SummarySection`
- `SummaryPlaceholder`
- `AlertTimeline`
- `AlertTimelineItem`
- `PageStateBanner`
- `TopicMetaBar`

## UI principles

Prefer:
- simple modern layout
- clear visual hierarchy
- fast page load
- repeat-daily usability
- strong readability
- responsive design
- reusable components
- minimal visual clutter

For desktop:
- main content + timeline side panel layout is preferred

For mobile:
- stack sections vertically
- show header, date navigation, video, summary, then timeline
- keep navigation obvious and tap-friendly

## Data flow rules

Prefer this data split:
- final article and summary content from GitHub-backed content files
- live timeline and day status from Pages Functions
- frontend combines both cleanly at render time

The page should not guess business state from missing fields when a clean status response exists.

## Placeholder state rules

During pre-publish state:
- show topic title
- show date
- show placeholder summary message
- show live timeline
- hide or reserve video area depending on design choice

When summary is ready:
- show final article content
- optionally show video pending state if video is not ready yet

When fully published:
- show article + embedded video + timeline/archive experience

## Output style

When responding with frontend work:
1. recommend one strongest route/component structure
2. explain why
3. provide copy-paste-ready routes, components, or folder structure
4. note data responsibilities clearly
5. mention tradeoffs only when relevant

## Avoid

Avoid:
- one custom component per date
- frontend direct database logic
- overcomplicated state machines in components
- duplicated page templates across topics
- mixing live timeline fetching with editorial content parsing in one giant component

## Preferred outcome

The final output should be:
- reusable
- clean
- easy to maintain
- optimized for multi-topic daily publishing
- aligned with Vue + Cloudflare Pages + D1 + GitHub