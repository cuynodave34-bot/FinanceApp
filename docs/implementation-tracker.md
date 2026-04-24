# Implementation Tracker

This file is the build ledger for the product brief. It keeps the repo aligned with the full request so features are not forgotten as work shifts from foundation to implementation.

## Status Legend

- `done`: implemented in repo
- `foundation`: schema, architecture, or placeholder scaffolding exists
- `planned`: intentionally scheduled later

## Phase 0. Foundation Decisions

| Item | Status | Notes |
| --- | --- | --- |
| Product requirements captured | done | [docs/prd.md](C:/Finance%20Tracker/docs/prd.md) |
| Architecture decisions captured | done | [docs/architecture.md](C:/Finance%20Tracker/docs/architecture.md) |
| MVP roadmap captured | done | [docs/mvp-roadmap.md](C:/Finance%20Tracker/docs/mvp-roadmap.md) |
| Living implementation ledger | done | This file |
| Supabase schema draft | done | [supabase/schema.sql](C:/Finance%20Tracker/supabase/schema.sql) |
| Expo app scaffold | done | App shell and modules created |
| Local SQLite schema | done | [src/db/sqlite/schema.ts](C:/Finance%20Tracker/src/db/sqlite/schema.ts) |
| Sync queue foundation | foundation | [src/sync/queue](C:/Finance%20Tracker/src/sync/queue) |

## Phase 1. Authentication And Security

| Feature | Status | Notes |
| --- | --- | --- |
| Google sign-in through Supabase OAuth | planned | Depends on Expo auth flow validation |
| Email/password auth fallback | done | [src/features/auth/screens/AuthScreen.tsx](C:/Finance%20Tracker/src/features/auth/screens/AuthScreen.tsx) |
| Session persistence | done | Supabase session bootstrap is wired in [src/features/auth/provider/AuthProvider.tsx](C:/Finance%20Tracker/src/features/auth/provider/AuthProvider.tsx) |
| Profile bootstrap | foundation | Remote profile upsert is attempted after sign-in |
| PIN or biometric lock | planned | `expo-local-authentication` included in manifest |
| Balance hide/show toggle | planned | Home shell is ready for this state |

## Phase 2. Accounts And Wallets

| Feature | Status | Notes |
| --- | --- | --- |
| Create account | done | Settings screen writes to SQLite repository |
| Edit account | done | Settings screen loads account drafts back into the form |
| Archive account | done | Settings screen archives without hard delete |
| Account balance cards | done | Home derives live per-account balances from local transactions |
| Total balance | done | Home totals live account balances, including transfers |
| Account types: cash, bank, e-wallet, other | done | Local and Supabase schema support these |
| Transfer between own accounts | done | Transactions screen validates source and destination accounts |

## Phase 3. Categories And Subcategories

| Feature | Status | Notes |
| --- | --- | --- |
| Custom categories | done | Settings screen writes to SQLite repository |
| Subcategories | done | Parent-child schema supported |
| Income/expense/both type support | done | Schema supports this |
| Create category inside transaction flow | planned | Transaction form is live, but inline category creation is still missing |

## Phase 4. Transactions

| Feature | Status | Notes |
| --- | --- | --- |
| Add income | done | Transactions screen writes validated income entries to SQLite |
| Add expense | done | Transactions screen writes validated expense entries to SQLite |
| Add transfer | done | Transfers validate source/destination accounts and keep totals neutral |
| Notes | done | Local and Supabase schema support this |
| Date/time picker flow | planned | Screen scaffold only |
| Recent transactions list | done | Home and Transactions screens render live local history |
| Search and filters | planned | Transaction creation is live; filters still need dedicated UI |
| Receipt photo | planned | Deliberately deferred from MVP implementation |
| Location tagging | planned | Deliberately deferred from MVP implementation |

## Phase 5. Lazy Mode

| Feature | Status | Notes |
| --- | --- | --- |
| Amount-only quick entry | planned | `is_lazy_entry` exists in schemas |
| Incomplete transaction reminder area | foundation | Home section is wired and will populate once lazy entries can be created |
| Later completion flow | planned | Transaction editor pending |

## Phase 6. Spendable Balance And Budgets

| Feature | Status | Notes |
| --- | --- | --- |
| Spendable balance formula | foundation | [calculateSpendableBalance.ts](C:/Finance%20Tracker/src/services/balances/calculateSpendableBalance.ts) |
| Daily budget | planned | Budget table exists |
| Advance budgets | planned | `budget_date` supports future days |
| Carry-over logic | planned | Service layer still needed |
| Overspending reduction logic | planned | Service layer still needed |
| Budget summary on home screen | foundation | Preview panel exists |

## Phase 7. Savings And Debt

| Feature | Status | Notes |
| --- | --- | --- |
| General savings | foundation | `savings_goals` schema supports it |
| Goal-based savings | foundation | `savings_goals` schema supports targets |
| Savings progress bars | planned | UI pending |
| Savings movement transactions | planned | Transaction types intentionally deferred |
| Debt tracking | planned | Not yet modeled in local scaffold transaction types |
| Negative balance warning | planned | Needs transaction guardrails |

## Phase 8. Offline-First Sync

| Feature | Status | Notes |
| --- | --- | --- |
| Local writes while offline | foundation | SQLite bootstrap exists |
| Queue offline mutations | foundation | Sync queue schema/repository exists |
| Sync to Supabase later | planned | Push/pull worker pending |
| Latest change wins | foundation | Defined in architecture |
| Sync transparency warning | planned | UI state pending |
| Conflict warning | planned | UI state pending |

## Phase 9. Reports And Insights

| Feature | Status | Notes |
| --- | --- | --- |
| Weekly summary | planned | Reports screen placeholder only |
| Monthly summary | planned | Reports screen placeholder only |
| Spending by category | planned | Reports screen placeholder only |
| Income by category | planned | Reports screen placeholder only |
| Spending by account | planned | Reports screen placeholder only |
| Income by account | planned | Reports screen placeholder only |
| Daily average spending | planned | Reports screen placeholder only |
| Biggest expenses | planned | Reports screen placeholder only |
| Impulse spending report | planned | `is_impulse` is ready in schema |
| AI insights via Groq | planned | Explicitly later-phase feature |

## Phase 10. Reminders, Check-In, Motivation

| Feature | Status | Notes |
| --- | --- | --- |
| Morning reminder | planned | Reminder schema and dependency foundation exist |
| Afternoon reminder | planned | Reminder schema and dependency foundation exist |
| Night reminder | planned | Reminder schema and dependency foundation exist |
| Daily check-in prompt | planned | Home shell reserved for it |
| Logging streak | planned | Later-phase motivational layer |
| No-spend day streak | planned | Later-phase motivational layer |
| Savings milestone messaging | planned | Later-phase motivational layer |
| Balance confirmation prompt | planned | `balance_adjustments` foundation exists |

## Phase 11. Calendar, Import, Export, Multi-User Future

| Feature | Status | Notes |
| --- | --- | --- |
| Calendar view | planned | Later-phase feature |
| CSV export | planned | Later-phase feature |
| Excel-compatible export | planned | Later-phase feature |
| Import from CSV/Excel | planned | Later-phase feature |
| Shared budgets | planned | Later-phase feature |
| Multi-user support | planned | Schema patterns are user-scoped |
| Investments | planned | Later-phase feature |

## Immediate Next Build Slice

1. Add deterministic budget and spendable-balance services.
2. Replace budget preview data with real daily budget summaries.
3. Introduce lazy-entry creation and later-completion flow.
4. Start offline sync push/pull workers on top of the existing queue foundation.
