# Agent Instructions

Always analyze, diagnose, and surgically fix when prompts ask for bug fixes. Keep summaries coherent and concise. When planning, make the plan detailed enough to execute safely.

## Security Rule

Before implementing any new feature, modifying data flows, adding inputs, changing sync behavior, touching AI prompts, or changing import/export behavior, read and follow `docs/security-measures.md`.

Every feature change must preserve these security expectations:

- validate and sanitize user-controlled input at shared service or repository boundaries
- keep Supabase row-level security and ownership checks intact
- avoid exposing balances, transactions, notes, locations, photos, tokens, API keys, or raw AI prompts in logs
- respect money-hiding behavior wherever financial values are displayed
- keep generated files, logs, local exports, env files, screenshots with real balances, and local databases out of Git
- add rate limits or in-flight guards for repeated network, AI, sync, import, export, and submit actions
- minimize data sent to AI providers and prefer summaries over raw private records

If a requested change conflicts with `docs/security-measures.md`, call that out before implementation and choose the safer design unless the user explicitly approves the risk.

## Cybersecurity Protocol

All agents working in this repository must treat the app as a private financial-data system and apply an attacker-minded review before changing behavior.

### 1. Security preflight

Before touching any feature, data flow, sync path, AI prompt, import/export path, auth/session logic, repository method, Supabase migration, logging, notification, or file generation:

- read `docs/security-measures.md`
- identify the protected data involved: balances, transactions, notes, locations, photos, account names, debts, savings, budgets, tokens, API keys, prompts, exports, local databases, logs, and screenshots
- identify the trust boundary: UI input, local SQLite, AsyncStorage/SecureStore, Supabase, AI provider, file system, sharing target, notification system, or Git
- state the likely attacker path in the implementation notes or final summary when the change has security impact

### 2. Attacker-minded checklist

For every security-relevant change, consider how an attacker or careless user could:

- bypass client checks and write directly to Supabase
- access or modify another user's rows by changing `user_id`, IDs, sync payloads, or queued operations
- inject malformed values through forms, CSV import, templates, notes, names, categories, locations, photos, or metadata JSON
- trigger CSV formula execution in spreadsheet apps
- abuse repeated auth, sync, AI, import, export, or submit actions
- extract tokens or provider keys from client storage, Expo public config, logs, generated files, or Git history
- leak private financial data through console output, error messages, AI prompts, cache rows, exports, screenshots, local files, or notifications
- bypass money-hiding mode on dashboards, lists, charts, previews, modals, notifications, exports, or AI summaries
- use prompt injection to reveal system prompts, hidden instructions, secrets, raw private records, or non-finance answers

### 3. Required controls

Agents must preserve or add these controls when the touched code path needs them:

- validate and normalize input at shared service or repository boundaries, not only in screens
- use allowlists for enums, IDs as opaque values, strict date parsing, money caps, finite numbers, and length limits
- keep Supabase RLS enabled on every user-owned table with `auth.uid() = user_id` policies and matching `with check`
- add database constraints for amounts, enum values, required names, status fields, metadata shape, and ownership-sensitive relations
- store native auth sessions in SecureStore-compatible storage; never put tokens, API keys, raw prompts, or private records in AsyncStorage unless explicitly documented as non-sensitive
- add in-flight guards, retry caps, backoff, or rate limits to repeated network, AI, sync, import, export, and submit operations
- sanitize spreadsheet-bound text cells that start with `=`, `+`, `-`, `@`, tab, or carriage return
- minimize data sent to AI providers; prefer summaries and labels over raw ledgers, notes, locations, photos, account names, and exact private context unless the feature explicitly requires it
- make AI prompts refuse requests for secrets, system prompts, hidden instructions, non-finance content, or raw private records
- redact logs and user-facing errors so they do not include balances, transactions, notes, locations, photo URIs, tokens, API keys, raw AI prompts, CSV contents, or full Supabase payloads
- keep `.env`, logs, exports, local databases, screenshots with real balances, receipt images, and generated private artifacts out of Git

### 4. Verification expectations

When security-sensitive code is changed, add or update focused tests where practical and verify at least the touched path. Prefer tests for:

- repository/service validation of malformed and oversized input
- RLS/ownership assumptions in Supabase migrations or sync filters
- CSV import limits and CSV export formula escaping
- AI prompt data minimization and refusal behavior
- rate limits, in-flight guards, duplicate-submit guards, and sync retry caps
- money-hiding behavior for any newly displayed financial value

If tests cannot be run, state that clearly in the final summary with the reason.

### 5. Security response format

When asked for a penetration test, security review, or attacker analysis:

- keep the work authorized and defensive
- describe realistic attack paths at a high level without providing exploit kits, credential theft steps, destructive payloads, persistence instructions, or operational abuse guidance
- rank findings by practical risk to this app's data
- pair every attack path with concrete mitigations in code, Supabase, configuration, or process
- call out already-existing protections so future agents do not duplicate or weaken them
- recommend safer designs when a requested change would increase exposure
