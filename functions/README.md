# Functions

Cloudflare Pages Functions live here.

- `api/timeline/` serves live alert timeline reads.
- `api/day-status/` serves topic/day readiness and publish state.
- `api/navigation/` serves previous and next day navigation data.
- `api/topics/` serves topic metadata and listing data.
- `lib/` holds shared function helpers.

Functions should remain thin and focused on reading operational data from D1.