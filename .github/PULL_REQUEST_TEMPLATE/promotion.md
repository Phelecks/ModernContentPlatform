## Production Promotion — `staging` → `main`

### Summary

<!-- Brief description of what is being promoted. -->

### Changes included

<!-- List the key features, fixes, or updates in this release. -->

- 

### Pre-merge validation

- [ ] CI passes on this pull request (build + tests)
- [ ] Staging smoke checks pass (`bash scripts/smoke-check.sh staging`)
- [ ] All relevant manual validation items pass ([checklist](docs/operations/promotion-workflow.md#step-3--validate-in-staging))
- [ ] No staging-specific configuration in the diff (URLs, database IDs, debug code)
- [ ] D1 migration changes are safe and additive (if any)
- [ ] No secrets or environment-specific values in committed code

### Post-merge steps

- [ ] Cloudflare Pages production deployment succeeds
- [ ] D1 migrations applied to production (`bash scripts/d1-migrate-remote.sh production`) (if any)
- [ ] n8n workflows imported to production (`bash scripts/n8n-workflow-import.sh production`) (if any)
- [ ] Production smoke checks pass (`bash scripts/smoke-check.sh production`)
- [ ] Delivery channels verified (if changed)

### Rollback plan

<!-- Describe how to roll back if something goes wrong. Default: -->

Rollback via Cloudflare Pages deployment history. See [rollback procedures](docs/operations/promotion-workflow.md#rollback-procedures).
