# Manual Regression Checklist

Run through this list before any release or after major changes to core flows.

## Environment

- [x] `npm run typecheck` passes with zero errors
- [x] `npm test` passes with zero failures (54 tests across 8 suites)
- [x] `npx expo export --platform web` completes successfully
- [ ] Fresh install on a clean device/emulator initializes SQLite without errors

## Authentication

- [ ] New user can sign up with email and password
- [ ] Existing user can sign in with email and password
- [ ] Session persists after app restart
- [ ] Sign out clears session and returns to auth screen
- [ ] App lock gate (if enabled) requires biometric/PIN on foreground

## Accounts / Wallets

- [ ] Create a new account with initial balance
- [ ] Edit account name and initial balance
- [ ] Archive an account (soft delete)
- [ ] Archived account no longer appears in transaction pickers
- [ ] Total balance on Home updates immediately after account changes
- [ ] Hide/show balances toggle masks all money surfaces

## Categories

- [ ] Create a custom category
- [ ] Create a subcategory under a parent
- [ ] Category appears in transaction picker
- [ ] Deleted category is excluded from pickers

## Transactions

- [ ] Add income transaction → account balance increases
- [ ] Add expense transaction → account balance decreases
- [ ] Add transfer between two accounts → balances shift, total unchanged
- [ ] Transfer fails if source and destination are the same account
- [ ] Lazy entry saves with `isLazyEntry` flag and appears on Home
- [ ] Complete a lazy entry later → flag clears, balances recalculate
- [ ] Edit transaction updates balances correctly
- [ ] Delete transaction (soft) removes it from reports and balances
- [ ] Search/filter by text, type, date range, account, category works
- [ ] Date/time picker produces correct ISO timestamps

## Budgets

- [ ] Set daily budget for today
- [ ] Set future-dated budget
- [ ] Carry-over applies unused budget to next day
- [ ] Overspend reduces next day’s available budget
- [ ] Home budget snapshot reflects live calculations

## Reports

- [ ] Weekly summary shows correct income, expenses, net, and daily average
- [ ] Monthly summary shows correct month-to-date totals
- [ ] Category spending totals add up to total expenses
- [ ] Account spending totals add up to total expenses
- [ ] Biggest expenses list is sorted descending by amount
- [ ] Impulse expenses are isolated and totalled correctly

## Sync

- [ ] Create transaction offline → sync queue item enqueued
- [ ] Edit transaction offline → sync queue item enqueued
- [ ] Delete transaction offline → sync queue item enqueued
- [ ] App online → pending items push to Supabase
- [ ] Remote changes pull down and merge into local SQLite
- [ ] Latest-change-wins conflict: local newer version kept, remote discarded
- [ ] Sync status badge shows pending count when offline changes exist
- [ ] Sync status badge shows "Synced" when queue is empty

## Reminders & Check-In

- [ ] Morning/afternoon/night reminders schedule without errors
- [ ] Daily check-in prompt appears once per day on Home
- [ ] "No spending" dismisses the prompt until tomorrow
- [ ] "Yes, add expense" navigates to transaction screen and dismisses prompt

## Security

- [ ] Biometric lock prompt appears on app open (if enabled)
- [ ] Balances are hidden when toggle is active
- [ ] Balances reveal when toggle is pressed again

## Edge Cases

- [ ] Account with zero transactions shows correct initial balance
- [ ] Budget with no configured days shows zero available spend
- [ ] Report with all deleted transactions shows zero counts
- [ ] Sync with no Supabase config does not crash the app
