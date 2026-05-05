# Security Measures Plan

## Goal

The app handles private financial data: account names, balances, transaction history, budgets, savings goals, debts, wishlist items, photos, locations, exports, and AI prompts. The security goal is not enterprise-grade hardening. The goal is practical privacy protection for each user with clear guardrails that are simple enough to maintain.

This plan focuses on:

- hiding money values from casual viewing
- preventing one user from reading or changing another user's cloud data
- validating and sanitizing all user-controlled input before it reaches SQLite, Supabase, CSV exports, or AI prompts
- reducing abuse through rate limits and duplicate-submit guards
- keeping the repository clean of local logs, builds, secrets, and generated noise
- avoiding accidental exposure through exports, photos, logs, sync errors, and AI requests

## Current Security Baseline

The app already has useful foundations:

- Supabase Auth is used before cloud sync.
- Supabase tables use row-level security policies scoped by `auth.uid() = user_id`.
- Local app lock exists through device authentication when enabled.
- Balance hiding exists as a user preference.
- SQLite is the offline source of truth, with Supabase as the cloud copy.
- `.env`, `node_modules`, `.expo`, `dist`, and `*.log` are ignored by Git.
- CSV import already validates transaction type, amount, and date.
- Transaction save flow already checks invalid amounts, transfer fees, duplicate transactions, budgets, and spendable funds.

These are good MVP foundations, but several privacy gaps remain because financial data moves through many surfaces: forms, local storage, sync queue, exports, AI context, logs, and generated files.

## Recommended MVP Measures

| Measure | What For | Why Implement It | Effectiveness |
| --- | --- | --- | --- |
| Central input validation and sanitization | Forms, CSV import, templates, accounts, categories, notes, locations, wishlist, waiting room, reminders | Validation currently exists in several screens/services, but it is spread out. A shared validation layer prevents inconsistent rules and keeps unsafe or malformed input out of SQLite, Supabase, exports, and AI prompts. | High for data integrity and accidental privacy leaks. Medium for malicious input because client-side checks must be paired with database constraints. |
| Server-side constraints for every synced table | Supabase tables | Client validation can be bypassed. Database constraints protect the canonical cloud copy from impossible amounts, invalid statuses, blank names, invalid dates, oversized notes, or malformed metadata. | High. This is one of the best low-complexity protections because it protects every client and sync path. |
| Supabase RLS verification checklist | Multi-user privacy | RLS is the main boundary preventing users from seeing or mutating each other's data. Every new table must enable RLS and use own-row policies before shipping. | Very high for cloud isolation when implemented consistently. |
| Secure auth session storage on native | Supabase session tokens | The current Supabase client stores native sessions in AsyncStorage. For stronger privacy, store auth tokens with SecureStore-compatible storage on iOS/Android, while keeping web behavior separate. | High for stolen-device and local-inspection scenarios. Low against fully compromised devices. |
| App lock hardening | Hidden balances and transaction privacy | Device authentication should lock the app on foreground, after timeout, and before showing balances, transactions, exports, import previews, and AI screens. | Medium to high against casual access. It protects privacy when someone briefly handles the user's phone. |
| Private money display mode | Balances, transaction amounts, reports, budgets, exports preview | Balance hiding should mask all money values, not just dashboard balances. It should cover cards, charts, transaction lists, account chips, budget warnings, reports, debt totals, savings, wishlist prices, and AI insight summaries. | High against shoulder-surfing and screenshots. It does not encrypt stored data. |
| Rate limits and submit cooldowns | Auth, sync, AI, CSV import, exports, transaction saves | Rate limits prevent repeated auth attempts, accidental double-submits, expensive AI calls, and sync retry loops. This keeps the app stable and reduces abuse without adding complex infrastructure. | Medium. Strong for accidental abuse and cost control, partial for intentional abuse unless enforced server-side. |
| AI data minimization | AI chat and insights | AI features should receive only the minimum financial summary needed, not raw full ledgers, exact account names, photos, location names, or personally identifying notes unless explicitly required. | High for privacy. It reduces third-party exposure even when AI features are useful. |
| Export safety | CSV monthly export and sharing | CSV files contain private money data. Exports should require confirmation, respect money-hidden mode when previewing, use clear file names, avoid logging file contents, and warn that shared CSVs leave app protection. | Medium to high. It prevents accidental disclosure but cannot protect files after sharing. |
| CSV injection protection | CSV export | Spreadsheet apps may interpret cells starting with `=`, `+`, `-`, `@`, tab, or carriage return as formulas. Escape or prefix risky exported text fields to prevent formula execution when users open CSVs. | High for a specific but real export risk. Low complexity. |
| Photo and location privacy rules | Transaction attachments and location names | Receipt photos and locations can expose sensitive habits. Store local URI references carefully, avoid uploading by default, and strip or avoid collecting metadata unless receipt cloud storage is intentionally added. | Medium. Strong for accidental over-collection. |
| Safe logging | Console errors, sync errors, AI errors | Logs must never include transaction notes, full CSV contents, auth tokens, API keys, exact balances, or full AI prompts. Use generic entity IDs and error codes where possible. | High for repo cleanliness and debug-log privacy. |
| Repository noise guardrails | Git hygiene | Generated folders, logs, local env files, test coverage, exports, and temporary app data should stay out of Git. This prevents secrets and personal finance samples from being committed. | High for accidental leaks. Very low maintenance. |
| Dependency and secret checks | Package dependencies and env files | Run dependency audits periodically and scan for committed secrets before sharing or pushing. Public Expo env vars should be treated as client-visible, not private secrets. | Medium to high. It catches common supply-chain and secret mistakes early. |

## Implementation Details

### 1. Central Validation Layer

Create shared validation helpers instead of repeating ad hoc checks in screens:

- `src/shared/validation/money.ts`
- `src/shared/validation/text.ts`
- `src/shared/validation/date.ts`
- `src/shared/validation/domain.ts`

Recommended rules:

- Money values must be finite, non-negative where appropriate, and capped to a realistic maximum such as `999999999999.99` to match `numeric(14,2)`.
- Use cents-safe rounding or explicit two-decimal normalization before storage.
- Names should be trimmed, non-empty, and length-limited.
- Notes, location names, item names, template names, and CSV fields should have maximum lengths.
- Dates must be valid ISO strings or strict `YYYY-MM-DD` / `HH:MM` values depending on the field.
- Enum fields must use allowlists, not free text.
- IDs must be treated as opaque strings and never interpolated into SQL table or column names.

Effectiveness: high for keeping data clean and preventing accidental breakage. It is not enough alone because users can bypass the client.

### 2. Database Constraints and RLS

Every Supabase table that stores user data should follow this checklist:

- `user_id uuid not null references auth.users(id) on delete cascade`
- row-level security enabled
- policy uses `using (auth.uid() = user_id)` and `with check (auth.uid() = user_id)`
- check constraints for enum fields
- check constraints for positive amounts and valid rates
- `updated_at` trigger
- soft delete support where sync needs it

Effectiveness: very high for multi-user privacy and data integrity. This is the strongest simple control in the app.

### 3. Native Secure Token Storage

Supabase native sessions should move from plain AsyncStorage to SecureStore-backed storage. AsyncStorage is acceptable for non-sensitive preferences like theme and balance-hidden toggles, but auth refresh tokens deserve stronger storage.

What this protects:

- local token extraction from basic device backups or casual inspection
- accidental token exposure through debugging tools

Limitations:

- it does not protect data on a rooted or fully compromised device
- web still needs a separate browser storage strategy

Effectiveness: high for native token privacy with low user-facing complexity.

### 4. Money Hiding Policy

The app should treat hidden money mode as a display policy:

- replace amounts with `[hidden]` or a consistent masked value
- hide chart labels and report totals
- hide transaction list amounts
- hide account and savings balances
- hide budget remaining values and spendable funds
- hide debt totals and wishlist estimated prices
- keep form inputs visible while the user is actively entering a transaction
- keep exported CSV data real only after explicit confirmation

Effectiveness: high for casual privacy, especially screenshots and shoulder-surfing. It should be described as display privacy, not encryption.

### 5. Rate Limits and Cooldowns

Recommended simple limits:

- Auth submit: disable submit while pending, then add a short cooldown after repeated failures.
- Transaction save: one save in flight per screen, plus duplicate detection before insert.
- Sync: cap batch size, exponential backoff failed items, and avoid tight retry loops.
- AI: cap requests per minute per user locally, enforce server-side rate limits if AI calls move behind an API.
- CSV import: cap file size and row count before parsing.
- Export: prevent repeated export/share taps while a file is being created.

Effectiveness: medium. Client limits improve UX and reduce accidental abuse. Server-side limits are needed for strong abuse protection.

### 6. AI Privacy Rules

AI prompts should not receive raw financial data by default. Prefer summarized and redacted context:

- category totals instead of full transaction rows
- relative dates or month buckets where possible
- account type instead of account name
- masked notes unless the user explicitly asks the AI to reason over notes
- no auth tokens, API keys, local file paths, receipt image URIs, or location trails

The current Groq key is exposed through Expo public config, which means it should be considered public to the client. For production, route AI calls through a backend or Supabase Edge Function where the provider key is server-side and rate limits can be enforced.

Effectiveness: high for privacy and cost control when implemented before AI usage grows.

### 7. Export and Import Safety

CSV export should sanitize text cells that spreadsheet programs can treat as formulas. Text fields beginning with `=`, `+`, `-`, `@`, tab, or carriage return should be prefixed or otherwise escaped before export.

CSV import should add:

- file size limit
- row count limit
- strict header validation
- max field length validation
- clearer rejection of unknown columns if strict mode is enabled
- per-row error cap so a bad file does not flood the UI

Effectiveness: high for import/export safety with low implementation cost.

### 8. Repository Noise and Secret Hygiene

Keep these out of Git:

- `.env`, `.env.local`, and any real API keys
- `.expo`, `.expo-shared`, `dist`, `web-build`
- `node_modules`
- `*.log`
- `coverage`
- generated CSV exports
- local database files
- screenshots containing real balances
- temporary receipt images

Add a short release checklist:

- run `git status --short`
- inspect untracked files before staging
- run a secret scan or at least search for `API_KEY`, `SUPABASE`, `GROQ`, `Bearer`, and real-looking tokens
- do not commit personal sample finance data

Effectiveness: high for preventing accidental leakage through the repository.

## Priority Order

1. Verify RLS and constraints for every current Supabase table, including phase-two tables.
2. Add shared validators for money, text, dates, enums, and imported CSV rows.
3. Expand hidden money mode across all money surfaces.
4. Move native Supabase session persistence to SecureStore-compatible storage.
5. Add CSV injection protection and import size/row limits.
6. Add local cooldowns for auth, sync, AI, import, export, and repeated save taps.
7. Redact AI context and move AI provider keys behind a backend before production.
8. Add a repo hygiene checklist and optional secret/dependency scan script.

## What This Does Not Try To Solve Yet

These are useful later, but not necessary for the current target:

- full local database encryption
- custom cryptographic key management
- enterprise audit logs
- device management controls
- advanced fraud detection
- complex role-based access control
- full backend API gateway for every app operation

Those would add significant complexity. The practical MVP path is to enforce ownership with Supabase RLS, validate aggressively, minimize what leaves the device, protect auth tokens, hide money in the UI, rate-limit expensive or risky flows, and keep private artifacts out of Git.
