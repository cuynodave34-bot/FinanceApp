# Product Requirements

## Product Summary

An offline-first student finance tracker that makes it easy to see total money, know what is safe to spend, and log transactions quickly across multiple wallets, banks, e-wallets, and cash accounts.

## Primary User

A student who:

- keeps money in multiple places
- often forgets to log spending
- wants fast manual entry instead of bank integrations
- needs offline access
- benefits from reminders, check-ins, and simple motivation

## Core User Problems

1. Money is split across multiple accounts, so the real total is unclear.
2. Logging transactions takes enough effort that it gets skipped.
3. Impulse spending happens because safe-to-spend money is unclear.
4. Physical cash balances drift because not every transaction is recorded.
5. Broad expense types require flexible categories, not rigid templates.

## Product Principles

1. Reduce friction first.
2. Show current money clearly.
3. Prioritize spendable balance over raw total balance.
4. Design for manual entry before automation.
5. Work offline by default.
6. Use reminders and feedback to build consistency.

## MVP Outcome

The first usable version must support this loop:

Open app -> see balances -> add transaction quickly -> understand safe-to-spend amount -> get reminded -> review simple reports

## MVP Features

### 1. Authentication

- Google sign-in through Supabase if feasible
- Email and password fallback
- Session persistence

### 2. Accounts

- Create, edit, archive accounts
- Support `cash`, `bank`, `e_wallet`, and `other`
- Track per-account balance
- Show total balance
- Hide or reveal balances in UI

### 3. Transactions

- Add income
- Add expense
- Add transfer between owned accounts
- Add notes
- Use date and time pickers
- Show recent transactions

### 4. Categories

- Create custom categories
- Support subcategories through parent-child structure
- Distinguish `income`, `expense`, or `both`

### 5. Lazy Mode

- Allow amount-only quick entry
- Save incomplete entries with default type/category state
- Surface incomplete entries for later completion

### 6. Budgets

- Set daily budget
- Set future dated budgets
- Carry forward unused budget
- Reduce future budget after overspending

### 7. Spendable Balance

Formula for MVP:

`spendable = total_balance - reserved_savings - pending_budget_reserves - upcoming_planned_expenses`

If all reserve sources are not yet fully implemented in UI, compute from the subset that exists and label it clearly.

### 8. Offline-First Usage

- Create, update, and delete core records while offline
- Persist locally in SQLite
- Queue mutations for later sync
- Sync to Supabase when online
- Resolve conflicts with latest `updated_at`
- Show sync status and conflict warning

### 9. Reports

- Weekly spending summary
- Monthly spending summary
- Category totals
- Account totals
- Daily average spend
- Biggest expenses

### 10. Reminders and Security

- Morning, afternoon, and evening reminder settings
- Daily check-in prompt
- Device biometric or app lock gate on open

## Deferred Features

These are intentionally not MVP:

- receipt photo storage
- location capture
- savings goal progress UX
- debt workflows
- advanced calendar UX
- export/import
- streaks and motivation engine
- AI insights via Groq
- shared budgets
- investments

## Non-Functional Requirements

- Mobile-first UX
- Offline-capable for all core financial actions
- Clear auditability of balance changes
- Fast entry flow with minimal taps
- Scalable schema for future multi-user features
- Secure defaults for auth and amount visibility

## Success Metrics For MVP

- User can create at least 3 accounts and keep balances consistent.
- User can add an expense in under 10 seconds from the home screen.
- User can recover from a day offline without data loss.
- Transfers never inflate income or expenses.
- Spendable balance stays interpretable and trusted.
