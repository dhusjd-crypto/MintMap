# Mind Map OS Feature Registry

Registry version: `0.1-foundation` | status values: `PLANNED`, `IN_PROGRESS`, `IMPLEMENTED`, `PARTIAL`, `DISABLED`, `DEPRECATED`.

Phase 2/3/4 architecture support and Phase 5 local persistence are implemented for `applicationCommandLayer`, `domainEventsV1`, `repositoryCompatibilityLayer`, `Clock`, the Execution and Finance domain cores, versioned canonical envelopes, migration journal, local backup/restore, and the synthetic migration runner. User-facing future features remain planned or partial; interfaces alone do not promote them.

`Current` means the repository already has a usable implementation. `Partial` means the concept exists but does not yet satisfy the accepted long-term contract. Every row names the future owner and the minimum evidence required before promotion.

## A — Task Domain (12)

| ID | Feature | Owner | Status | Dependencies | Tests / migration / platforms / flag |
|---|---|---|---|---|---|
| A001 | Canonical Task identity | Execution | IMPLEMENTED | current Todo | mapping/ID fixtures; preserve IDs; Web/PWA; `executionCore` |
| A002 | INBOX/READY/PLANNED/NOW/DOING/WAITING/BLOCKED/SOMEDAY/DONE/CANCELLED states | Execution | PARTIAL | A001 | transition matrix; additive field migration; all; `executionCore` |
| A003 | Distinct created/updated/touched/start/do/soft-end/due/remind/follow-up dates | Execution | PARTIAL | A001 | date semantics and timezone tests; additive; all; `executionDates` |
| A004 | Estimate, actual, chunk limits, splittable, started/completed, snooze count | Execution | PARTIAL | A001 | round-trip fixtures; additive; all; `executionMetrics` |
| A005 | Project, goal, blockedBy, blocks, waitingFor relationships | Execution | PARTIAL | A001 | graph fixtures; preserve IDs; all; `dependencyGraph` |
| A006 | Manual priority, strategic weight, impact, energy, context | Execution | PARTIAL | A001 | validation tests; additive; all; `executionSignals` |
| A007 | NORMAL/PERSISTENT/CRITICAL notification policy | Execution/Notification | PARTIAL | A003 | policy tests; additive; all; `notificationPolicy` |
| A008 | Task CRUD and completion/reopen/cancel | Execution | IMPLEMENTED | current store | unit/E2E; backwards compatible; Web/PWA; `executionCore` |
| A009 | One recursive subtasks tree via parentId | Execution | IMPLEMENTED | A001 | migration/idempotency/reorder tests; legacy steps preserved; all; `subtaskTree` |
| A010 | Project next action and no-next-action warning | Execution | PLANNED | A005, T21 | use-case/E2E; additive; all; `projectHealth` |
| A011 | Blocking/dependency readiness and critical path | Execution | PARTIAL | A005 | dependency/actionability tests; critical path is not implemented; all; `dependencyGraph` |
| A012 | Snooze, waiting, follow-up and re-entry-safe task lifecycle | Execution | PARTIAL | A002, A003 | transition fixtures; additive; all; `executionCore` |

## T — Trigger Engine (25)

| ID | Trigger | Owner | Status | Dependencies | Tests / flag |
|---|---|---|---|---|---|
| T01 | Morning Top 3 | Trigger | PLANNED | A002, P | deterministic score; `triggerEngine` |
| T02 | Best NOW task | Trigger | PARTIAL | current focus engine | reason tests; `triggerEngine` |
| T03 | Adaptive 2–3 hour execution check | Trigger | PLANNED | P, F | clock fixtures; `smartRescheduling` |
| T04 | Deadline 7 days away | Trigger | PLANNED | A003 | boundary tests; `triggerEngine` |
| T05 | Deadline 3 days away | Trigger | PLANNED | A003 | boundary tests; `triggerEngine` |
| T06 | Deadline tomorrow | Trigger | PLANNED | A003 | timezone tests; `triggerEngine` |
| T07 | Deadline today | Trigger | PLANNED | A003 | timezone tests; `triggerEngine` |
| T08 | Deadline hours away | Trigger | PLANNED | A003 | boundary tests; `triggerEngine` |
| T09 | Task stale several days | Trigger | PLANNED | A003 | clock fixture; `triggerEngine` |
| T10 | Task severely stale | Trigger | PLANNED | A003 | clock fixture; `triggerEngine` |
| T11 | Waiting follow-up due | Trigger | PLANNED | A005, A003 | relationship fixture; `triggerEngine` |
| T12 | Dependency completion makes task actionable | Trigger | PLANNED | A005 | graph fixture; `dependencyGraph` |
| T13 | Repeated snooze threshold | Trigger | PLANNED | A004 | transition fixture; `triggerEngine` |
| T14 | Excessive snoozing decision prompt | Trigger | PLANNED | T13, N | E2E action test; `persistentReminders` |
| T15 | Daily workload exceeds capacity | Trigger | PLANNED | P | capacity fixture; `planner` |
| T16 | Task likely to miss deadline | Trigger | PLANNED | A003, P | reason assertion; `triggerEngine` |
| T17 | Free calendar slot available | Trigger | PLANNED | X001, P | fake calendar; `calendarIntegration` |
| T18 | Meeting cancellation creates time | Trigger | PLANNED | X001, P | adapter contract; `calendarIntegration` |
| T19 | Schedule change requires replan | Trigger | PLANNED | P, X001 | deterministic diff; `smartRescheduling` |
| T20 | User returns after inactivity | Trigger | PLANNED | R | re-entry fixture; `reEntryMode` |
| T21 | Project stale | Trigger | PLANNED | A010 | project fixture; `projectHealth` |
| T22 | Task blocks important downstream work | Trigger | PLANNED | A005, A006 | graph/reason tests; `dependencyGraph` |
| T23 | Too many WAITING items | Trigger | PLANNED | A012 | query fixture; `triggerEngine` |
| T24 | Quick win fits short slot | Trigger | PLANNED | P, F | eligibility tests; `focusModes` |
| T25 | Evening/tomorrow planning | Trigger/Routines | PLANNED | R, P | clock/E2E; `routines` |

Scoring must be deterministic, configurable, and return human-readable reasons. AI cannot calculate the base score.

## N — Notification Engine (12)

| ID | Feature | Owner | Status | Dependencies | Tests / flag |
|---|---|---|---|---|---|
| N001 | NORMAL/PERSISTENT/CRITICAL levels | Notification | PARTIAL | A007 | policy matrix; `notifications` |
| N002 | START/DONE/SNOOZE 10m/30m/1h actions | Notification | PLANNED | A002 | action contract; `persistentReminders` |
| N003 | CANNOT_DO_TODAY, MOVE_TO_WAITING, OPEN_TASK | Notification | PLANNED | A012 | transition E2E; `persistentReminders` |
| N004 | Cooldown and notification fatigue | Notification | PLANNED | N001 | deterministic clock; `notificationPolicies` |
| N005 | Quiet hours and working hours | Notification | PLANNED | Clock | timezone tests; `notificationPolicies` |
| N006 | Weekend policy | Notification | PLANNED | N005 | timezone tests; `notificationPolicies` |
| N007 | Escalation and maximum repeat count | Notification | PLANNED | N001, T | policy tests; `persistentReminders` |
| N008 | Persistent/Bug-Me reminders | Notification | PLANNED | N007 | browser/E2E; `persistentReminders` |
| N009 | Relative reminders | Notification | PARTIAL | current reminder scheduler | date fixtures; `relativeReminders` |
| N010 | Deadline-based escalation | Notification | PLANNED | T04–T08 | boundary tests; `persistentReminders` |
| N011 | Browser/system adapter fallback to toast | Notification | PARTIAL | current scheduler | unavailable API test; `notifications` |
| N012 | Delivery and save/sync feedback | Notification | PARTIAL | current UI feedback | E2E; `notifications` |

## F — Focus / Execution (11)

| ID | Feature | Owner | Status | Dependencies | Tests / flag |
|---|---|---|---|---|---|
| F001 | One primary NOW task | Focus | PARTIAL | current focus engine | selection reasons; `focusModes` |
| F002 | Next two candidates | Focus | PLANNED | T02 | deterministic selection; `focusModes` |
| F003 | Selection reason, duration, deadline, project/goal context | Focus | PARTIAL | F001, A003 | query assertions; `focusModes` |
| F004 | Start/Done/Snooze/Skip | Focus | PLANNED | A002, N002 | transitions; `focusModes` |
| F005 | Cannot do today / Move to Waiting | Focus | PLANNED | A012 | transitions; `focusModes` |
| F006 | Single Task Focus | Focus | PLANNED | F001 | E2E; `focusModes` |
| F007 | Flow Timer | Focus | PLANNED | F006 | timer clock; `timers` |
| F008 | Countdown Timer | Focus | PARTIAL | current Pomodoro widget | E2E; `timers` |
| F009 | Pomodoro-compatible mode | Focus | PARTIAL | F008 | timer tests; `timers` |
| F010 | This-or-That and Quick Win | Focus | PLANNED | T24 | eligibility; `focusModes` |
| F011 | Task Jar with eligible-only random selection | Focus | PLANNED | A002 | seeded random/property test; `focusModes` |

## P — Planner / Capacity (15)

| ID | Feature | Owner | Status | Dependencies | Tests / flag |
|---|---|---|---|---|---|
| P001 | available/planned/remaining/overcommit minutes | Planner | PLANNED | A004 | arithmetic tests; `planner` |
| P002 | Estimated finish and tasks at risk | Planner | PLANNED | P001, A003 | deterministic fixture; `planner` |
| P003 | Task chunking min/max/splittable | Planner | PARTIAL | A004 | chunk property tests; `planner` |
| P004 | TimeBlocks reference canonical Task IDs | Planner | PLANNED | A001 | identity test; `planner` |
| P005 | Manual blocks | Planner | PLANNED | P004 | CRUD/E2E; `planner` |
| P006 | Calendar availability windows | Planner | PLANNED | X001 | adapter test; `calendarIntegration` |
| P007 | Focus windows and buffers | Planner | PLANNED | P006 | allocation tests; `planner` |
| P008 | Meetings and fixed events | Planner | PLANNED | P006 | calendar fixture; `planner` |
| P009 | Flexible tasks | Planner | PLANNED | P004 | allocation tests; `planner` |
| P010 | Lock Horizon | Planner | PLANNED | P004 | boundary tests; `planner` |
| P011 | Manual locks always win | Planner | PLANNED | P010 | precedence test; `planner` |
| P012 | Today mostly stable horizon | Planner | PLANNED | P010 | clock fixture; `planner` |
| P013 | Tomorrow moderately flexible | Planner | PLANNED | P010 | clock fixture; `planner` |
| P014 | Far future flexible | Planner | PLANNED | P010 | clock fixture; `planner` |
| P015 | Re-plan without silently moving unfinished work | Planner | PLANNED | P010, A003 | regression fixture; `smartRescheduling` |

## R — Routines / Review (8)

| ID | Feature | Owner | Status | Dependencies | Tests / flag |
|---|---|---|---|---|---|
| R001 | Morning Planning | Routines | PLANNED | P, T01 | workflow test; `routines` |
| R002 | Yesterday leftovers review | Routines | PLANNED | A003 | no-auto-move test; `routines` |
| R003 | Today's Top 3 | Routines | PLANNED | T01 | query test; `routines` |
| R004 | Midday Recalibration | Routines | PLANNED | P | workflow test; `routines` |
| R005 | Evening Shutdown | Routines | PLANNED | A002 | workflow test; `routines` |
| R006 | Tomorrow Planning configurable time | Routines | PLANNED | R005 | timezone test; `routines` |
| R007 | Weekly Review | Routines | PLANNED | L | workflow test; `routines` |
| R008 | Week Ahead Planning | Routines | PLANNED | P | workflow test; `routines` |

## Q — Quick Capture (14)

| ID | Feature | Owner | Status | Dependencies | Tests / flag |
|---|---|---|---|---|---|
| Q001 | Text capture | Capture | PARTIAL | current quick capture | round-trip; `quickCapture` |
| Q002 | Clipboard capture | Capture | PARTIAL | current share/PWA flow | E2E; `quickCapture` |
| Q003 | Voice capture | Capture | PARTIAL | current voice UI | adapter test; `quickCapture` |
| Q004 | Image/screenshot and camera capture | Capture | PARTIAL | current Kutu media | E2E; `quickCapture` |
| Q005 | PDF capture | Capture | PARTIAL | current PDF handling | fixture; `quickCapture` |
| Q006 | Email capture | Capture | PLANNED | X002 | adapter test; `gmailIntegration` |
| Q007 | Financial document capture | Capture/Finance | PLANNED | FIN010 | confirmation E2E; `financeCapture` |
| Q008 | CSV/OFX/QFX/QIF/CAMT import | Capture/Finance | PLANNED | FIN042 | parser fixtures; `financeCapture` |
| Q009 | Manual capture | Capture | IMPLEMENTED | current forms | E2E; `quickCapture` |
| Q010 | Turkish-first natural language task parsing | Capture | PARTIAL | current parser | Turkish fixtures; `quickCapture` |
| Q011 | Duration, tags, person, dates and intent parsing | Capture | PARTIAL | Q010 | confidence fixtures; `quickCapture` |
| Q012 | Confidence and user confirmation | Capture | PLANNED | Q010 | proposal contract; `captureConfirmation` |
| Q013 | Do not map every date to dueAt | Capture | PLANNED | Q010 | semantic date tests; `quickCapture` |
| Q014 | Capture proposal history and retry | Capture | PLANNED | Q012 | recovery test; `captureConfirmation` |

## V — Smart Views (19)

| ID | View | Owner | Status | Dependencies | Tests / flag |
|---|---|---|---|---|---|
| V001 | NOW | Queries | PARTIAL | current task queries | query test; `smartViews` |
| V002 | Top 3 Today | Queries | PLANNED | T01 | query test; `smartViews` |
| V003 | Today | Queries | PARTIAL | current my-day | query test; `smartViews` |
| V004 | This Week | Queries | PLANNED | A003 | date test; `smartViews` |
| V005 | Waiting | Queries | PARTIAL | A012 | query test; `smartViews` |
| V006 | Follow-Up Due | Queries | PLANNED | A003 | date test; `smartViews` |
| V007 | Stale 7+ Days | Queries | PLANNED | A003 | clock test; `smartViews` |
| V008 | Deadline Risk | Queries | PLANNED | T16 | reason test; `smartViews` |
| V009 | Blocked | Queries | PARTIAL | A005 | graph test; `smartViews` |
| V010 | Blocking Other Work | Queries | PLANNED | A005 | graph test; `smartViews` |
| V011 | Quick Wins | Queries | PLANNED | P, T24 | eligibility; `smartViews` |
| V012 | 15-Minute Tasks | Queries | PLANNED | A004 | duration test; `smartViews` |
| V013 | Phone Context | Queries | PLANNED | A006 | filter test; `smartViews` |
| V014 | Office Context | Queries | PLANNED | A006 | filter test; `smartViews` |
| V015 | Outside Context | Queries | PLANNED | A006 | filter test; `smartViews` |
| V016 | Low Energy | Queries | PLANNED | A006 | filter test; `smartViews` |
| V017 | Deep Work | Queries | PLANNED | A006 | filter test; `smartViews` |
| V018 | Someday | Queries | PARTIAL | A002 | query test; `smartViews` |
| V019 | Completed | Queries | PARTIAL | A002 | query test; `smartViews` |

## L — Learning / Analytics (10)

| ID | Feature | Owner | Status | Dependencies | Tests / flag |
|---|---|---|---|---|---|
| L001 | Planned vs actual duration | Analytics | PLANNED | A004 | fixture with confidence; `analytics` |
| L002 | Daily workload realism | Analytics | PLANNED | P001 | metric test; `analytics` |
| L003 | Completion by time of day | Analytics | PLANNED | A003 | aggregation test; `analytics` |
| L004 | Estimate error | Analytics | PLANNED | A004 | sample-size test; `analytics` |
| L005 | Weekly capacity accuracy | Analytics | PLANNED | P001 | metric test; `analytics` |
| L006 | Productive windows and context switching | Analytics | PLANNED | A006, A004 | event fixture; `activityLearning` |
| L007 | Spending patterns and monthly cashflow | Analytics | PLANNED | FIN003 | ledger fixture; `analytics` |
| L008 | Payment punctuality and budget adherence | Analytics | PLANNED | FIN011, FIN033 | metric test; `analytics` |
| L009 | Net worth and asset allocation | Analytics | PLANNED | FIN038 | metric test; `investmentAnalytics` |
| L010 | Confidence and sample size on learning results | Analytics | PLANNED | L001–L009 | statistical fixture; `analytics` |

## M — Mind Map Intelligence (8)

| ID | Feature | Owner | Status | Dependencies | Tests / flag |
|---|---|---|---|---|---|
| M001 | Node/context relationship ownership | Knowledge | PARTIAL | current node store | graph fixture; `knowledgeCore` |
| M002 | Task tree projection into Mind Map | Knowledge | PARTIAL | A001, A009 | identity regression; `mindMapProjection` |
| M003 | Goal/project/task big-picture progress | Knowledge | PARTIAL | A005 | projection test; `mindMapProjection` |
| M004 | Context workload and health projection | Knowledge | PLANNED | A010, L | visual query test; `mindMapIntelligence` |
| M005 | Relationship-aware navigation | Knowledge | PARTIAL | M001 | E2E; `mindMapNavigation` |
| M006 | No independent task copies in views | Knowledge | PLANNED | M002 | identity property test; `mindMapProjection` |
| M007 | Decision and knowledge links | Knowledge | PARTIAL | current decisions | relationship fixture; `knowledgeCore` |
| M008 | Projection recovery after sync | Knowledge/Sync | PLANNED | X004, M002 | multi-device fixture; `syncV2` |

## X — Integrations (8)

| ID | Adapter | Owner | Status | Dependencies | Tests / flag |
|---|---|---|---|---|---|
| X001 | Google Calendar read/write | Integration | PARTIAL | current Google code | contract/E2E; `calendarIntegration` |
| X002 | Gmail capture | Integration | PLANNED | Q006 | adapter contract; `gmailIntegration` |
| X003 | ActivityWatch | Integration | PLANNED | L006 | fake adapter; `activityLearning` |
| X004 | Google Drive sync/backup | Integration | PARTIAL | current Drive code | tombstone/recovery; `driveSync` |
| X005 | Firebase sync adapter | Integration | PLANNED | repository ports | contract; `firebaseSync` |
| X006 | WebDAV adapter | Integration | PLANNED | repository ports | contract; `webdavSync` |
| X007 | Future bank import connectors | Integration/Finance | PLANNED | Q008, FIN042 | fixture/consent; `bankConnectors` |
| X008 | AI adapters: OpenAI, Gemini, local AI | Integration/AI | PARTIAL | current Gemini endpoints | proposal contract; `aiAssistant` |

## FIN — Finance (61)

| ID | Feature | Owner | Status | Dependencies | Tests / flag |
|---|---|---|---|---|---|
| FIN000 | Personal/Business FinanceBook isolation | Finance | IMPLEMENTED | ports | book isolation fixtures; no persistence migration; all; `financeDomain` |
| FIN001 | Institutions and stable canonical IDs | Finance | IMPLEMENTED | ports | identity fixtures; `financeDomain` |
| FIN002 | Bank/Cash/Credit Card/Loan/Investment accounts | Finance | IMPLEMENTED | FIN001 | entity fixtures; `financeDomain` |
| FIN003 | Transaction ledger | Finance | IMPLEMENTED | FIN002 | ledger invariants; `financeDomain` |
| FIN004 | Linked transfers without duplicate income/expense | Finance | IMPLEMENTED | FIN003 | transfer/sign fixtures; `financeDomain` |
| FIN005 | Split transaction, category, payee, tag | Finance | IMPLEMENTED | FIN003 | split-total fixtures; `financeDomain` |
| FIN006 | Financial attachments and source references | Finance | PARTIAL | FIN003 | IDs/provenance only; storage adapter later; `financeDomain` |
| FIN007 | FinancialObligation entity | Finance | IMPLEMENTED | FIN002 | amount/lifecycle fixtures; `financeDomain` |
| FIN008 | Obligation types and lifecycle states | Finance | IMPLEMENTED | FIN007 | state/payment matrix; `financeDomain` |
| FIN009 | CreditCardStatement entity | Finance | IMPLEMENTED | FIN002 | review/link fixtures; `financeDomain` |
| FIN010 | Screenshot/PDF classification and extraction proposal | Finance/Capture | PLANNED | Q007, FIN009 | confirmation required; `financeCapture` |
| FIN011 | Payment due/overdue workflow linked to Task by ID | Finance/Execution | PLANNED | FIN007, A001 | identity fixture; `financeDomain` |
| FIN012 | Payment preset PAYMENT_STANDARD | Finance/Notification | PLANNED | FIN011 | policy test; `financeNotifications` |
| FIN013 | Payment preset PAYMENT_IMPORTANT | Finance/Notification | PLANNED | FIN011 | policy test; `financeNotifications` |
| FIN014 | Payment preset PAYMENT_CRITICAL | Finance/Notification | PLANNED | FIN011 | escalation test; `financeNotifications` |
| FIN015 | Monthly budgets | Finance | PLANNED | FIN003 | ledger fixture; `financeDomain` |
| FIN016 | Category/wallet/account budgets | Finance | PLANNED | FIN015 | method-neutral tests; `financeDomain` |
| FIN017 | Budget progress and overspending warnings | Finance/Trigger | PLANNED | FIN015 | deterministic metric; `financeNotifications` |
| FIN018 | Financial goals and reserve goals | Finance | PLANNED | FIN015 | entity fixture; `financeDomain` |
| FIN019 | 7-day cashflow forecast | Finance | PLANNED | FIN003, FIN007 | forecast fixture; `cashflowForecast` |
| FIN020 | 14-day cashflow forecast | Finance | PLANNED | FIN019 | horizon test; `cashflowForecast` |
| FIN021 | 30-day cashflow forecast | Finance | PLANNED | FIN019 | horizon test; `cashflowForecast` |
| FIN022 | 90-day cashflow forecast | Finance | PLANNED | FIN019 | horizon test; `cashflowForecast` |
| FIN023 | ExpectedCashShortfallDetected event | Finance/Events | PLANNED | FIN019 | event contract; `cashflowForecast` |
| FIN024 | Deterministic finance rules | Finance | PLANNED | FIN003 | explainability test; `financeRules` |
| FIN025 | Reconciliation states | Finance | IMPLEMENTED | FIN003, FIN009 | state matrix; `financeDomain` |
| FIN026 | Duplicate prevention and confidence explanation | Finance | PARTIAL | FIN025 | statement duplicate protection; full matching later; `financeReconciliation` |
| FIN027 | Asset and liability | Finance | IMPLEMENTED | FIN002 | account role fixture; `financeDomain` |
| FIN028 | Investment position and portfolio | Finance | PLANNED | FIN027 | valuation fixture; `investmentAnalytics` |
| FIN029 | Real estate and land assets | Finance | PLANNED | FIN027 | entity fixture; `investmentAnalytics` |
| FIN030 | Net worth snapshots and performance | Finance/Analytics | PLANNED | FIN027 | metric fixture; `investmentAnalytics` |
| FIN031 | Savings rate and debt ratios | Finance/Analytics | PLANNED | FIN003, FIN027 | metric fixture; `analytics` |
| FIN032 | FIN-T01 payment due in 7 days | Finance/Trigger | PLANNED | FIN011 | boundary test; `financeTriggers` |
| FIN033 | FIN-T02 payment due in 3 days | Finance/Trigger | PLANNED | FIN011 | boundary test; `financeTriggers` |
| FIN034 | FIN-T03 payment due tomorrow | Finance/Trigger | PLANNED | FIN011 | timezone test; `financeTriggers` |
| FIN035 | FIN-T04 payment due today | Finance/Trigger | PLANNED | FIN011 | timezone test; `financeTriggers` |
| FIN036 | FIN-T05 payment due in hours | Finance/Trigger | PLANNED | FIN011 | boundary test; `financeTriggers` |
| FIN037 | FIN-T06 payment overdue | Finance/Trigger | PLANNED | FIN011 | state test; `financeTriggers` |
| FIN038 | FIN-T07 statement captured but not reviewed | Finance/Trigger | PLANNED | FIN009 | workflow test; `financeTriggers` |
| FIN039 | FIN-T08 statement received but obligation missing | Finance/Trigger | PLANNED | FIN007, FIN009 | workflow test; `financeTriggers` |
| FIN040 | FIN-T09 minimum payment detected | Finance/Trigger | PLANNED | FIN009 | extraction fixture; `financeTriggers` |
| FIN041 | FIN-T10 scheduled payment unconfirmed | Finance/Trigger | PLANNED | FIN011 | workflow test; `financeTriggers` |
| FIN042 | FIN-T11 recurring payment generated | Finance/Trigger | PLANNED | FIN007 | recurrence test; `financeTriggers` |
| FIN043 | FIN-T12 recurring payment missing | Finance/Trigger | PLANNED | FIN007 | recurrence test; `financeTriggers` |
| FIN044 | FIN-T13 high 7-day cash requirement | Finance/Trigger | PLANNED | FIN019 | forecast test; `financeTriggers` |
| FIN045 | FIN-T14 high 30-day cash requirement | Finance/Trigger | PLANNED | FIN021 | forecast test; `financeTriggers` |
| FIN046 | FIN-T15 expected cash shortfall | Finance/Trigger | PLANNED | FIN023 | event test; `financeTriggers` |
| FIN047 | FIN-T16 unpaid card after repeated nudges | Finance/Trigger | PLANNED | FIN012–014 | escalation test; `financeTriggers` |
| FIN048 | FIN-T17 tax/social security deadline | Finance/Trigger | PLANNED | FIN011 | boundary test; `financeTriggers` |
| FIN049 | FIN-T18 supplier payment due | Finance/Trigger | PLANNED | FIN011 | boundary test; `financeTriggers` |
| FIN050 | FIN-T19 loan installment due | Finance/Trigger | PLANNED | FIN011 | boundary test; `financeTriggers` |
| FIN051 | FIN-T20 subscription/recurring-charge review | Finance/Trigger | PLANNED | FIN007 | review workflow; `financeTriggers` |
| FIN052 | Finance import formats CSV/OFX/QFX/QIF/CAMT | Finance/Capture | PLANNED | Q008 | parser fixtures; `financeCapture` |
| FIN053 | User confirmation for extracted amount/minimum/due date/account/currency | Finance/Capture | PLANNED | FIN010 | rejection/confirm E2E; `financeCapture` |
| FIN054 | FinancialDocumentExtractor and FinancialCaptureProposal | Finance/Capture | PLANNED | FIN010 | proposal contract; `financeCapture` |
| FIN055 | Obligation recurrence and payment reference | Finance | PARTIAL | FIN007 | schedule primitive only; generator later; `financeDomain` |
| FIN056 | Obligation sourceType/sourceReference and linked execution task | Finance/Execution | PLANNED | FIN011 | identity fixture; `financeDomain` |
| FIN057 | No full card credentials in domain records | Finance | IMPLEMENTED | FIN007 | masked/privacy validation; `financeDomain` |
| FIN058 | Finance rule conditions/actions/order/enabled state | Finance | PLANNED | FIN024 | explainability fixture; `financeRules` |
| FIN059 | Suggested finance rules from repeated corrections | Finance/Analytics | PLANNED | FIN058 | proposal/confirmation test; `financeRules` |
| FIN060 | Financial capture review state and reconciliation confidence | Finance | PLANNED | FIN025, FIN053 | state/property tests; `financeReconciliation` |

Phase 5 persistence features now implemented: versioned canonical envelopes (`canonicalPersistenceV1`), Execution extension sidecar (`executionExtensionPersistence`), local Finance repositories (`financePersistenceV1`), migration journal, checksum-validated local backup/restore (`migrationBackups`), canonical hydration, and corruption quarantine. UI, multi-device canonical sync, imports, OCR/AI, budgets, cashflow, investments, bank connections, and trigger/notification integration remain planned or partial.
