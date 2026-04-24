# Student Finance App

Mobile-first personal finance tracker for students using React Native, Expo Router, SQLite, and Supabase.

## Current Repo State

The repository now contains an implementation-ready foundation:

- Expo SDK 55 app scaffold with bottom-tab navigation
- local SQLite bootstrap and sync queue schema
- Supabase backend schema and row-level security setup
- home/dashboard shell shaped around the product brief
- living tracker for everything that still needs to be built

## Core Docs

- [Product requirements](C:/Finance%20Tracker/docs/prd.md)
- [Architecture decisions](C:/Finance%20Tracker/docs/architecture.md)
- [MVP roadmap](C:/Finance%20Tracker/docs/mvp-roadmap.md)
- [Implementation tracker](C:/Finance%20Tracker/docs/implementation-tracker.md)
- [Supabase schema](C:/Finance%20Tracker/supabase/schema.sql)

## Run The App

1. Copy `.env.example` to `.env` and fill in the Supabase values.
2. In the Supabase dashboard, open SQL Editor and run [supabase/schema.sql](C:/Finance%20Tracker/supabase/schema.sql).
3. Start the Expo dev server:

```bash
npm start
```

4. Open the project in Expo Go.

## Current Foundation Scope

- App shell and tabs: Home, Transactions, Budget, Reports, Settings
- Offline-first local database initialization
- Sync queue repository and spendable balance service foundation
- Theme and reusable UI cards
- Placeholder screens aligned to the roadmap

## Next Recommended Slice

1. Wire Supabase auth and session bootstrap.
2. Implement account and category CRUD.
3. Build transaction creation with transfer-safe balance handling.
4. Add deterministic budget carry-over logic.
5. Replace preview data with SQLite-backed repositories.
