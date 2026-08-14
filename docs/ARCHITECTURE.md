# MintMap OS Architecture

## Current reality (audited 2026-08-14)

MintMap is a React 19 application built with TanStack Start/Router, Vite, TypeScript, Tailwind/Radix UI, and Cloudflare Worker server functions. Routes cover Mind Map, Tasks, Pulse, Borsa, Kutu, Pano, Takvim, sharing, and unlock. There is no native Windows or Android package in this repository.

The current state layer is a set of module singletons exposed through `useSyncExternalStore`. `src/lib/mindmap-store.ts` is the main canonical store for workspaces, nodes, and todos; `keep-store.ts`, `goal-store.ts`, `pulse-store.ts`, `decision-store.ts`, and the watchlist store own adjacent records. UI components and stores still contain some business rules and integration orchestration.

Persistence is local-first in practice: legacy JSON snapshots use localStorage (`mindgrove.v2` and feature-specific keys), binary images/files use IndexedDB, and Phase 5 canonical Execution extensions and Finance entities use the separate versioned `mintmap-canonical` IndexedDB namespace. Cloud sync uses a Cloudflare D1 sync document plus history. Google Drive provides legacy backup/sync paths; Google Calendar and Google Tasks are adapters. Reminder scheduling is a browser-side timer/Notification/toast service. AI endpoints are server functions and are advisory.

Existing safety work includes idempotent legacy `steps` to child-task migration and tombstones for deleted nodes, todos, keep cards, images, files, and attachments. These mechanisms must remain backwards compatible.

## Target direction

Use an incremental strangler migration:

`routes/components -> application commands/queries -> bounded context domain -> ports -> current stores/adapters`

The current stores remain the persistence boundary while commands and queries are introduced around them. New SQLite/local database work must wait until backup, versioned migrations, and recovery are proven. The Mind Map should eventually become a visual projection of canonical execution/knowledge data, not a second source of truth.

## Dependency rules

- Domain code depends on shared types and ports, never React, browser APIs, Google SDKs, AI SDKs, Tauri, or Cloudflare.
- Application code coordinates use-cases and validates proposals.
- Infrastructure implements repositories, sync, notifications, storage, clock, and external adapters.
- UI consumes queries and dispatches commands.
- Adapters translate external data; they do not bypass canonical repositories.

## Phase 2/3 boundary currently in use

`src/application/task-application.ts` composes `CreateTask`, `UpdateTask`, `CompleteTask`, `ReopenTask`, and delete commands with `LegacyTaskRepository`, `LegacyProjectRepository`, and `LegacyGoalRepository`. `TaskFormPanel` creation and `TaskSheet` completion use this path. The adapter still calls the existing store, so persisted shape and undo/sync behavior remain unchanged. Queries expose canonical task records and basic project/goal reads.

`LocalDomainEventDispatcher` currently receives `TaskCreated`, `TaskUpdated`, `TaskCompleted`, `TaskReopened`, and `TaskCancelled` from commands. There are no Trigger, Finance, or Notification consumers yet.

Phase 3 adds a pure Execution Domain under `src/domain/execution`. It owns canonical task state transitions, dates, actionability, waiting, dependencies, and execution metadata. `src/application/mapping/execution-task-mapping.ts` translates this model to/from legacy `Todo` records with patch-based writes. The current UI and persistence adapters remain unchanged.

## Known coupling and risks

- `mindmap-store.ts` is a large aggregate, persistence adapter, history manager, and command surface in one module.
- Task and node relationships are represented inside workspace snapshots; server sync currently merges documents rather than operating a domain database.
- Reminders use browser timers and local fired-state, so delivery is best-effort when the browser is closed.
- Goals, Pulse, decisions, and watchlist have separate localStorage stores and do not yet share one sync protocol.
- Legacy migration/version metadata remains implicit in storage keys and repair functions; canonical persistence now has explicit schema metadata and a durable migration journal.
- AI, Google, and Drive availability can vary by environment; the core must keep working without them.
- The existing lint command fails on a large pre-existing Prettier backlog; this Foundation run does not reformat unrelated code.
