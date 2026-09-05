# MintMap OS Engineering Constitution

Read this file before changing the repository. MintMap is a long-lived personal operating system with existing user data; it is not a disposable MVP.

## Non-negotiable rules

- Never destructively migrate, wipe, reset, or silently discard persisted data.
- Every schema migration must have a version, be idempotent, preserve unknown fields, and have a rollback or export path.
- Keep one canonical identity for each Task, Project, Goal, and financial entity. Screens are projections, not copies.
- Domain rules belong in domain/application modules. React components may render and dispatch commands but may not become the authority for eligibility, scoring, finance, dependencies, reminders, or capacity.
- Deterministic rules run before optional AI. AI returns proposals only; it never authoritatively changes state, money, deadlines, dependencies, TriggerScore, reconciliation, or notifications.
- Bounded contexts own their data: Finance owns money, Execution owns actions, Planner owns time allocation, Trigger Engine owns prioritisation signals, Notification Engine owns nudges, Capture owns ingestion, Mind Map/Knowledge owns relationships and visual projections, Analytics owns derived insights, and adapters own external communication.
- Integrations must be replaceable behind ports/adapters. Core behavior must remain usable when Google, Drive, AI, sync, or browser notification APIs are unavailable.
- Avoid giant god services and cross-context direct mutation. Prefer small commands, queries, typed contracts, and lightweight typed events.
- Keep powerful or risky work behind feature flags with conservative defaults.
- Preserve backwards compatibility for localStorage, IndexedDB blobs, cloud snapshots, imports, exports, and legacy `steps` data.
- Do not redesign the UI or start a large finance, Android, or AI implementation during Foundation work.
- Do not introduce third-party source without checking its license. Never copy GPL/AGPL code into this repository; record adapted source and notices in `THIRD_PARTY_NOTICES.md`.

## Required verification

Before a change is considered complete, run the relevant typecheck, unit tests, production build, and focused end-to-end checks. Record failures separately; do not claim a check passed when it was unavailable.

The permanent product and architecture records are:

- `docs/MINTMAP-FELSEFE.md`
- `docs/ARCHITECTURE.md`
- `docs/BOUNDED_CONTEXTS.md`
- `docs/DATA_MODEL.md`
- `docs/MIGRATION_STRATEGY.md`
- `docs/DOMAIN_EVENTS.md`
- `docs/FEATURE_REGISTRY.md`
- `docs/ROADMAP.md`

Every accepted feature must be registered before implementation and must name its owner, dependencies, tests, migration impact, platform scope, and feature flag.

Finance-specific privacy rule: never store full card numbers, PIN, CVV/CVC, online-banking passwords, or raw authentication tokens in Finance domain records. Use masked identifiers and keep integration secrets in secure infrastructure adapters.
## Kalıcı proje merkezi

- Proje bağlamını ve güncel code-independent durumu görmek için docs/PROJECT_HUB.md dosyasını oku.
- Proje durumu için sohbet, kişisel bağlam veya geçmiş aramasına güvenme; anlamlı değişiklikten sonra hub’daki ilgili durum/kanıt/sıradaki adımı güncelle.
- Bu hub roadmap’in yerine geçmez ve başka projelerin durumunu içermez.
