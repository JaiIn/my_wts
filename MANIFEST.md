# Package Manifest

Package: `my_wts-development-guide`  
Generated: 2026-07-31
Revision: 8 (M07 simulation order rules)
Official API snapshot: Toss OpenAPI `1.2.5`

## Documents

- `README.md`
- `CODEX.md`
- `docs/00_ENV_FIRST_SETUP.md`
- `docs/01_SOURCE_SCOPE_AND_DECISIONS.md`
- `docs/02_AUTH_ERRORS_AND_RATE_LIMITS.md`
- `docs/03_MARKET_AND_REFERENCE_APIS.md`
- `docs/04_ACCOUNT_ASSET_AND_ORDER_APIS.md`
- `docs/05_ARCHITECTURE_AND_PROJECT_STRUCTURE.md`
- `docs/06_SECURITY_AND_ORDER_SAFETY.md`
- `docs/07_DETAILED_MICRO_WBS.md`
- `docs/08_STAGE_GATE_AND_CHECKLISTS.md`
- `docs/09_TEST_STRATEGY.md`
- `docs/10_LOCAL_RUNBOOK.md`
- `docs/11_GIT_GITHUB_WORKFLOW.md`
- `docs/12_PRAGMATIC_DEVELOPMENT_POLICY.md`
- `docs/13_ROLE_BASED_DEVELOPMENT_GUIDES.md`
- `docs/14_TECH_STACK_DECISION.md`
- `docs/15_PRODUCT_REQUIREMENTS_AND_SCREENS.md`
- `docs/16_INTERNAL_BFF_API_SPEC.md`
- `docs/17_DATABASE_AND_STATE_MODEL.md`
- `docs/18_ERROR_LOGGING_AND_STATE_CATALOG.md`
- `docs/19_CONFIG_COMMANDS_AND_FILE_CONVENTIONS.md`
- `docs/20_REQUIREMENTS_TRACEABILITY_AND_ACCEPTANCE.md`
- `docs/21_DOCUMENTATION_FREEZE_POLICY.md`
- `docs/22_LOCAL_AUTHENTICATION_SPEC.md`
- `references/ENDPOINT_MATRIX.md`
- `references/DATA_CONTRACTS.md`
- `references/BFF_TO_TOSS_MAPPING.md`
- `specs/my-wts-bff-openapi.yaml`
- `specs/sqlite-schema-v1.sql`
- `templates/.env.example`

## Official source snapshots

| File | SHA-256 |
|---|---|
| `references/source/official-api-reference-v1.2.4.md` | `7d669bb69f3e85808a999cd45d5e9914f075b4d72d12833c23911e09937594b3` |
| `references/source/official-overview-v1.2.4.md` | `ea55335c6e10ff89bea2b941c0a8d41105d0d17fbff33a12bd391a3fd5e46cf3` |
| `references/source/openapi-v1.2.4.json` | `7000d89ea3d783b0fa36d32e31750e85e139098306dbfce53a75fc4891019f1b` |
| `references/source/openapi-v1.2.5.json` | `0f2cb7ef938fe1c50b7d69348705632ad488ea68d63fc762847f6c9485a3a111` |

## Frozen implementation contracts

| File | SHA-256 |
|---|---|
| `specs/my-wts-bff-openapi.yaml` | `d0db84e66943a4d6611d3fba150fe362167f78d852e2acd949ad20443c22fe57` |
| `specs/sqlite-schema-v1.sql` | `e05e3f26862fc12631400d0c75e281d979b2b392a5d37def146b7e1e2d1a0931` |
| `templates/.env.example` | `0db210cdb59ea2e20ca27d32a0b91cb3947969d54c8ea4574c10efe217f2798f` |

## Coverage

- 27 OpenAPI paths
- 30 operations
- 72 component schemas
- 36 internal BFF paths
- 39 internal BFF operations
- 16 internal BFF schemas
- 6 executable SQLite tables
- Local signup/login/logout with scrypt and hashed sessions
- Read-only Toss integration; 6 order mutations explicitly prohibited
- Local-only Next.js/React architecture
- Auth, errors, rate limits
- Full market/account/asset/order/conditional-order domains
- Practical Micro Stage WBS
- Stage checklist and credential/order gates
- Tiered test strategy
- Windows local runbook
- GitHub stage commit workflow for `JaiIn/my_wts`
- Environment-first `.env.example` / ignored `.env.local` workflow
- Role-based guides for coordinator, environment, frontend, API, market, account, orders, tests, Git, and docs
- Accepted ADR for Next.js 16, React 19, TypeScript 5.9, Node 24 LTS, pnpm 11, SQLite/Drizzle, and the test stack
- Frozen product, screen, BFF, database, error, logging, configuration, command, and acceptance contracts
- Development-time documentation write ban with explicit change-control exceptions
- Official Markdown and canonical OpenAPI JSON snapshots
