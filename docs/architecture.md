# Architecture

## Recommended Technical Direction

### Client

- React Native with Expo
- Expo Router for navigation
- TypeScript
- Local SQLite as the offline source of truth on device

### Backend

- Supabase Auth for identity
- Supabase Postgres for canonical cloud state
- Supabase Storage later for receipts

## Why SQLite For Offline

SQLite is the best fit for the MVP because it:

- handles structured relational finance data better than AsyncStorage
- is simpler to control than WatermelonDB for a solo MVP
- supports local queries for reports, balances, and budgets
- works well with explicit mutation queues

AsyncStorage is acceptable for tiny preferences, but not for transaction-heavy finance data.

## System Model

The app should use a local-first architecture:

1. UI writes to SQLite immediately.
2. Local domain services compute derived balances and report data.
3. A sync worker pushes queued mutations to Supabase.
4. Remote updates are pulled down and merged into SQLite.
5. UI reads from SQLite so the app stays responsive offline.

## Data Ownership

### Supabase

Canonical cloud copy for:

- profiles
- accounts
- categories
- transactions
- budgets
- savings goals
- reminders
- balance adjustments

### Local SQLite

Device copy for:

- the same core domain tables
- sync queue
- sync metadata
- UI preferences and cached derived data

The sync queue should stay local rather than becoming a server table.

## Sync Strategy

### Mutation Queue

Every create, update, or delete should enqueue a mutation:

- `entity_type`
- `entity_id`
- `operation`
- serialized payload
- `created_at`
- `attempt_count`
- `last_error`

### Conflict Policy

Use latest-write-wins based on `updated_at`, with these guardrails:

- keep `updated_at` on every syncable row
- use soft deletes with `deleted_at` where practical
- notify the user if a remote version overwrote a pending local assumption

### Deletion Strategy

Prefer soft delete for syncable entities to avoid resurrection bugs during offline merges.

## Domain Rules

### Accounts

- balances should be derived from `initial_balance + ledger movements`, not edited blindly
- manual corrections should be stored as balance adjustments
- transfers move money between owned accounts without affecting income or expense reports

### Transactions

Supported MVP types:

- `income`
- `expense`
- `transfer`

Planned later:

- `savings_in`
- `savings_out`
- `debt`

### Budgets

Daily budget calculation should be explicit:

- base budget for a date
- carry-over from previous days
- overspend reduction from prior days
- actual spent amount
- remaining amount

Store the inputs and calculate the final number deterministically.

### Spendable Balance

Do not hardcode this as just total minus savings forever. Use a derived service layer so new reserve types can be added without schema churn.

## Suggested App Module Structure

```text
src/
  app/
    (tabs)/
  features/
    auth/
    accounts/
    transactions/
    categories/
    budgets/
    reports/
    settings/
  db/
    sqlite/
    migrations/
    repositories/
  sync/
    queue/
    push/
    pull/
    merge/
  services/
    balances/
    budgets/
    reports/
    reminders/
  shared/
    ui/
    utils/
    constants/
    types/
```

## Security Decisions

- Require authenticated user before sync
- Gate app entry with biometric or device auth when enabled
- Store tokens using secure storage, not plain local storage
- Allow the user to hide balances globally in UI

## Analytics Strategy

All essential reports should be computed locally from SQLite first.

Benefits:

- works offline
- avoids unnecessary AI dependency
- makes reports fast
- provides structured summary input later for Groq

## Open Technical Decisions

1. Google OAuth feasibility in Expo Go may affect whether email/password ships first.
2. Background sync frequency depends on Expo constraints and battery tradeoffs.
3. Push-based sync updates can be added later; polling is enough for MVP.
4. Savings and debt should remain schema-ready but UI-light until the core loop is stable.
