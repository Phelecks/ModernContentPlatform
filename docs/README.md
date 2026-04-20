# Docs

Project documentation lives here.

- `ai-provider-media-modes.md` — **AI provider and media generation mode reference**: supported providers (OpenAI, Google), media modes (image_video, full_video), supported combinations, default behavior, recommended v1 setup for Finance + Crypto, cost guidance, and example configurations. **Start here** when configuring a new environment.
- `roadmap.md` for the implementation roadmap: phases, deliverables, dependencies, and risks.
- `staging-environment.md` for the staging environment plan: architecture, secrets, promotion path, and validation flow.
- `source-provider-modes.md` for source signal provider configuration (X, NewsAPI, hybrid modes, required API keys, and validation rules).
- `source-strategy.md` for the per-topic source strategy, trust model, and source class hierarchy.
- `x-source-rules.md` for v1 X (Twitter) source lists, trust rules, severity caps, and operational guidance.
- `image-video-pipeline.md` for the default v1 image-based video pipeline: stages, asset contracts, render providers, and GitHub content layout.
- `local-development.md` for local environment setup, `.dev.vars`, Wrangler commands, and VS Code configuration.
- `architecture/` for system design decisions.
  - `ai-provider.md` — full AI provider architecture, credential setup, structured output contracts, retry behavior, and per-task model overrides.
  - `full-video-mode.md` — full-video mode design, provider requirements, and implementation plan.
  - `openai-cost-controls.md` — per-task token budgets, pre-filtering, monitoring queries.
  - `daily-editorial-workflow.md` — daily editorial pipeline design.
  - `intraday-workflow.md` — intraday alert pipeline design.
- `data-model/` for D1 and content model references.
- `operations/` for operational procedures.
- `runbooks/` for incident and rerun guidance.