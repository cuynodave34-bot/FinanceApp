# MVP Roadmap

## Build Order

### Phase 1. Project Foundation

- Initialize Expo app with TypeScript
- Add Expo Router
- Add linting, formatting, and environment config
- Set up Supabase client module
- Set up SQLite wrapper and migration system

Deliverable:

App boots into a typed shell with tabs and working local database initialization.

### Phase 2. Authentication And Session

- Implement email/password auth (primary method)
- ~~Add Google auth~~ (abolished — email/password remains primary)
- Create profile bootstrap after signup
- Persist session securely
- Add protected app shell

Deliverable:

User can sign up, sign in, and stay signed in.

### Phase 3. Accounts

- Account CRUD
- Account list and detail cards
- Total balance summary
- Hide or reveal balances

Deliverable:

User can create wallets and see total available money.

### Phase 4. Categories

- Default seed categories
- Custom category CRUD
- Parent-child support for subcategories

Deliverable:

User can classify income and expenses flexibly.

### Phase 5. Transactions

- Add income and expense flows
- Add transfer flow
- Account picker and category picker
- Notes, date, and time pickers
- Recent transactions feed
- Balance recalculation service

Deliverable:

User can track real money movement without breaking balances.

### Phase 6. Lazy Mode

- Amount-only quick entry
- Incomplete transaction state
- Home screen reminder section
- Edit flow to complete missing details

Deliverable:

User can log a transaction in seconds even when they do not want full detail.

### Phase 7. Budgets And Spendable Balance

- Daily budget setup
- Future dated budgets
- Carry-over and overspend logic
- Spendable balance service
- Budget summary on home screen

Deliverable:

User can see what is safe to spend today.

### Phase 8. Offline Sync

- Local mutation queue
- Push queued changes to Supabase
- Pull remote changes
- Conflict handling and transparency warning
- Sync status indicator

Deliverable:

Core finance flows work offline and reconcile safely online.

### Phase 9. Reports

- Weekly summary
- Monthly summary
- Category totals
- Account totals
- Biggest expenses
- Daily average spending

Deliverable:

User can review spending behavior without AI features.

### Phase 10. Reminders And Lock

- Reminder preferences
- Daily check-in prompt
- App lock on open

Deliverable:

The app helps the user stay consistent and protects visible balances.

## Practical Sprint Cut

If the goal is the smallest real beta, ship in this order:

1. Project foundation
2. Auth
3. Accounts
4. Categories
5. Transactions
6. Transfers
7. Lazy mode
8. Budgets
9. Spendable balance
10. Offline sync
11. Reports
12. Reminders and lock

## High-Risk Areas

1. Offline sync correctness
2. Transfer balance integrity
3. Budget carry-over edge cases
4. OAuth flow complexity in Expo
5. Keeping spendable balance understandable as features expand

## Recommended Immediate Decisions

1. Ship email/password first and treat Google sign-in as conditional.
2. Use SQLite, not AsyncStorage, for finance records.
3. Keep transactions to income, expense, and transfer in MVP.
4. Defer receipt photos, location, debt, and AI until the core loop is stable.
