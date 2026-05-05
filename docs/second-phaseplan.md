# Finance App Next Features

## Purpose of This File

This file describes additional features to add to the finance app after the core implementation.

The app already includes the main finance tracking system, including:

* Account and wallet balances
* Income tracking
* Expense tracking
* Transfers between accounts
* Spendable balance
* Daily budgeting
* Savings tracking
* Reports
* Offline support
* Supabase backend
* React Native / Expo mobile app foundation
* Security features
* AI insights foundation

The goal of the next update is to make the app more useful for real daily behavior, especially for users who are students, forgetful, lazy with tracking, or prone to impulse spending.

---

# Main Product Direction

The next version should focus on four major goals:

1. Make logging transactions faster and easier
2. Help users avoid unsafe or impulse spending
3. Make reports more understandable and actionable
4. Make the app feel trustworthy and reliable

The app should not only store financial data. It should help the user understand money behavior and make better spending decisions.

---

# Recommended Next Version

## Version Name

**Version 2: Habit and Control Update**

## Version Goal

Improve the app so users can track money with less effort, avoid impulse spending, understand where money goes, and trust that their balances are accurate.

## Top Priority Features

1. Transaction templates
2. Favorite quick actions
3. Lazy entry inbox
4. Balance reconciliation
5. Survive until date calculator
6. Purchase waiting room
7. Wishlist with affordability status
8. Planned vs unplanned expenses
9. Weekly AI reflection
10. Duplicate transaction warning
11. Undo system
12. Soft delete / trash
13. Risk alerts
14. Privacy mode
15. Backup and export reminders

---

# Priority Group 1: Make Logging Easier

These features directly solve the problem of forgetting or being too lazy to log transactions.

---

## 1. Transaction Templates

### Feature Summary

Allow users to save reusable transaction templates for common expenses, income, or transfers.

### User Problem

Users often repeat the same transactions. Re-entering the same details every time creates friction.

### Example Templates

* Lunch at school
* Jeep fare
* Coffee
* Snack
* Allowance received
* GCash cash-in
* Printing expense
* School supplies

### Expected Behavior

A user can tap a saved template and the app automatically fills common transaction fields.

### Template Fields

A template may include:

* Template name
* Transaction type
* Default amount
* Category
* Subcategory
* Account/wallet
* Notes
* Planned/unplanned default value
* Impulse flag default value

### Example Flow

1. User taps `Lunch`
2. App opens quick transaction form
3. Amount, category, account, and notes are prefilled
4. User confirms or edits
5. Transaction is saved

### Implementation Notes

Create a `transaction_templates` table.

Suggested fields:

```sql
id
user_id
name
type
default_amount
category_id
subcategory_id
account_id
notes
is_planned_default
is_impulse_default
created_at
updated_at
```

---

## 2. Favorite Quick Actions

### Feature Summary

Allow users to pin their most-used finance actions on the home screen.

### User Problem

The user wants fewer taps and less thinking when adding transactions.

### Example Favorite Actions

* Add food expense
* Add transport expense
* Add allowance
* Add lazy entry
* Transfer money
* Mark no-spend day
* Add school expense

### Expected Behavior

The home screen should show customizable quick action buttons.

### Implementation Notes

Create a `favorite_actions` table.

Suggested fields:

```sql
id
user_id
action_type
label
icon
position
metadata
created_at
updated_at
```

The `metadata` field can store JSON for action-specific details.

Example metadata:

```json
{
  "category_id": "food-category-id",
  "account_id": "cash-account-id",
  "default_amount": 100
}
```

---

## 3. Lazy Entry Inbox

### Feature Summary

Create a dedicated section for incomplete transactions that need review.

### User Problem

The app already supports lazy entries. However, users need a clear place to review and complete them.

### Inbox Items May Include

* Missing category
* Missing account/wallet
* Missing note
* Missing date/time confirmation
* Offline transaction not yet synced
* Suspicious or incomplete entry

### Expected Behavior

The home screen or transaction screen should show a `Needs Review` section.

Example:

```text
Needs Review
- ₱100 expense missing category
- ₱50 expense missing account
- ₱200 lazy entry from yesterday
```

### Actions

Each item should allow:

* Complete details
* Mark as correct
* Delete
* Remind later

### Implementation Notes

Use the existing transaction fields if available:

```sql
is_lazy_entry
is_incomplete
needs_review
review_reason
```

If these fields do not exist, add them to the `transactions` table.

---

## 4. Duplicate Transaction Warning

### Feature Summary

Warn users if they may be entering the same transaction twice.

### User Problem

Users can accidentally log the same expense more than once, especially with quick add or lazy mode.

### Detection Logic

When creating a transaction, check for similar recent transactions using:

* Same amount
* Same category
* Same account
* Same transaction type
* Created within a short time window

### Example Warning

```text
You already logged ₱85 for Food from Cash 2 minutes ago. Add again?
```

### Actions

* Add anyway
* Cancel
* Edit existing transaction

### Implementation Notes

This can be handled client-side before saving.

Suggested time window:

* 2 to 10 minutes for quick duplicate detection
* Same day for broader duplicate review

---

## 5. Undo System

### Feature Summary

Allow users to undo recent actions.

### User Problem

Finance apps need to feel safe. Users may accidentally add, edit, delete, or transfer money.

### Supported Undo Actions

* Undo add transaction
* Undo edit transaction
* Undo delete transaction
* Undo transfer
* Undo balance adjustment

### Example UI

After saving:

```text
Transaction added. Undo?
```

### Implementation Notes

For simple implementation, use a temporary undo snackbar before finalizing destructive changes.

For stronger implementation, create an `activity_log` table.

Suggested fields:

```sql
id
user_id
action_type
entity_type
entity_id
previous_data
new_data
can_undo
created_at
expires_at
```

---

## 6. Soft Delete / Trash

### Feature Summary

Do not permanently delete transactions immediately. Move them to trash first.

### User Problem

Users may delete financial records by mistake.

### Expected Behavior

When deleting a transaction:

* Mark it as deleted
* Hide it from normal views
* Keep it in trash
* Allow restore
* Allow permanent delete later

### Implementation Notes

Add fields to relevant tables:

```sql
is_deleted
deleted_at
deleted_by
```

Apply this to:

* transactions
* accounts
* categories
* budgets
* savings goals

---

# Priority Group 2: Make Spending Safer

These features help users avoid impulse spending and understand whether they can afford something.

---

## 7. Survive Until Date Calculator

### Feature Summary

Calculate how much the user can safely spend per day until a selected date.

### User Problem

Students often need their money to last until the next allowance, payday, or important date.

### Example Use Case

```text
I have ₱900 left and need it to last until Friday.
```

The app should calculate:

```text
You can spend around ₱180 per day until Friday.
```

### Required Inputs

* Target date
* Current spendable balance
* Upcoming expenses
* Savings locks
* Optional planned income

### Formula

```text
Available Until Date = Spendable Balance - Upcoming Expenses Before Target Date
Daily Limit = Available Until Date / Number of Days Until Target Date
```

### Expected Output

* Recommended daily spending limit
* Warning if money is too low
* Number of days remaining
* Optional adjustment based on current daily budget

### Example Output

```text
You have ₱900 spendable and 5 days remaining.
Recommended daily limit: ₱180.
```

---

## 8. Purchase Waiting Room

### Feature Summary

Create a waiting area for non-essential purchases before the user buys them.

### User Problem

The user struggles with impulse spending.

### Expected Behavior

When the user wants to buy something non-essential, they can add it to the waiting room instead of buying immediately.

### Example

```text
Item: Headphones
Price: ₱600
Wait time: 24 hours
Status: Waiting
```

After the wait time, the app asks:

```text
Do you still want this?
```

### Actions

* Buy now
* Cancel
* Move to wishlist
* Extend waiting time

### Implementation Notes

Create a `purchase_waiting_room` table.

Suggested fields:

```sql
id
user_id
item_name
estimated_price
category_id
reason
wait_until
status
created_at
updated_at
```

Possible statuses:

```text
waiting
approved
cancelled
purchased
moved_to_wishlist
```

---

## 9. Wishlist With Affordability Status

### Feature Summary

Allow users to list items they want to buy and show whether each item is financially safe.

### User Problem

Users may want many things but need help deciding when a purchase is safe.

### Example Wishlist

| Item      |  Price | Status       |
| --------- | -----: | ------------ |
| New bag   | ₱1,200 | Not safe yet |
| Earphones |   ₱500 | Affordable   |
| Shoes     | ₱2,000 | Save first   |

### Affordability Logic

The app should compare item price against:

* Spendable balance
* Daily budget
* Upcoming expenses
* Savings goals
* Survive-until-date calculation

### Status Examples

* Affordable
* Not safe yet
* Save first
* Will reduce daily budget
* Dangerous purchase

### Implementation Notes

Create a `wishlist_items` table.

Suggested fields:

```sql
id
user_id
item_name
estimated_price
category_id
priority
status
notes
target_date
created_at
updated_at
```

---

## 10. Do I Have Enough Calculator

### Feature Summary

Allow the user to check if they can afford a purchase before buying.

### User Question

```text
Can I afford ₱750 today?
```

### Expected Behavior

The app should check:

* Spendable balance
* Upcoming expenses
* Daily budget
* Savings goals
* Remaining days before next target date

### Example Output

```text
You can afford this, but your daily budget will drop to ₱95 for the next 4 days.
```

Or:

```text
Not recommended. This will put you below your safe-to-spend balance.
```

### Implementation Notes

This can reuse logic from:

* Spendable balance
* Daily budget
* Survive until date calculator
* Upcoming expenses

---

## 11. Upcoming Expenses Calendar

### Feature Summary

Allow users to record future expenses separately from completed transactions.

### User Problem

Spendable balance is more accurate if the app knows about future expenses.

### Examples

* School project payment
* Tuition deadline
* Birthday gift
* Subscription renewal
* Transport for event
* Planned food budget

### Expected Behavior

Upcoming expenses should appear in:

* Calendar view
* Home screen reminders
* Spendable balance calculation
* Reports once paid

### Implementation Notes

Create an `upcoming_expenses` table.

Suggested fields:

```sql
id
user_id
title
amount
category_id
account_id
due_date
is_paid
paid_transaction_id
notes
created_at
updated_at
```

---

## 12. Safe To Spend Today Widget

### Feature Summary

Show a clear number for how much the user can safely spend today.

### User Problem

Total balance can be misleading. Users need a practical daily number.

### Example

```text
Safe to spend today: ₱180
```

### Calculation Should Consider

* Total balance
* Savings
* Upcoming expenses
* Daily budget
* Overspending from previous days
* Carry-over from previous days

### UI Placement

Place this on the home screen near:

* Total balance
* Spendable balance
* Today’s budget

---

## 13. Risk Alerts

### Feature Summary

Warn users before financial problems happen.

### Example Alerts

```text
Your spendable balance is low.
```

```text
You are spending faster than usual.
```

```text
You may run out of budget before the weekend.
```

```text
Your cash balance has not been confirmed in 10 days.
```

### Alert Types

* Low spendable balance
* Overspending trend
* Upcoming expense risk
* Budget limit warning
* Missing transaction warning
* Sync issue warning
* Balance confirmation warning

### Implementation Notes

Create a reusable alert engine.

Possible table:

```sql
user_alerts
```

Suggested fields:

```sql
id
user_id
alert_type
title
message
severity
is_read
metadata
created_at
```

---

# Priority Group 3: Improve Reports and Insights

These features make the data easier to understand.

---

## 14. Where Did My Money Go Report

### Feature Summary

Create a plain-language report that explains spending behavior.

### User Problem

Charts are useful, but users often want a simple explanation.

### Example Output

```text
This week, most of your money went to food and snacks.
Your biggest spending day was Wednesday.
You spent ₱220 more than last week.
```

### Report Should Include

* Top spending categories
* Biggest spending day
* Biggest transaction
* Comparison to previous week or month
* Unusual spending
* Possible impulse spending

### Implementation Notes

This can be generated with normal app logic first. AI can later improve the wording.

---

## 15. Spending Heatmap

### Feature Summary

Show which days the user spends the most.

### User Problem

Users need to see spending patterns quickly.

### Example

* Monday: low spending
* Tuesday: medium spending
* Friday: high spending
* Sunday: no spending

### Possible Views

* Weekly heatmap
* Monthly calendar heatmap
* Category-specific heatmap

### Implementation Notes

Use transaction totals grouped by date.

Possible intensity levels:

```text
none
low
medium
high
very_high
```

---

## 16. Planned vs Unplanned Expenses

### Feature Summary

Let users mark whether an expense was planned, unplanned, impulse, or emergency.

### User Problem

Categories alone do not explain spending behavior.

### Expense Planning Types

* Planned
* Unplanned
* Impulse
* Emergency

### Example

```text
₱120 snacks → Impulse
₱50 printing → Planned
₱300 medicine → Emergency
```

### Reports Enabled

* Impulse spending report
* Planned vs unplanned ratio
* Emergency spending summary
* AI behavior insights

### Implementation Notes

Add fields to `transactions`:

```sql
planning_type
is_impulse
```

Possible values for `planning_type`:

```text
planned
unplanned
impulse
emergency
unknown
```

---

## 17. Weekly AI Reflection

### Feature Summary

Use Groq API to generate a student-friendly weekly finance reflection.

### User Problem

Users may not understand their financial patterns from raw reports alone.

### Example AI Reflection

```text
This week, you spent most on food and snacks. Your spending increased on Thursday and Friday. You stayed within budget for 4 out of 7 days. Next week, try lowering snack spending by ₱30 per day.
```

### Data Sent to AI

Only send summarized data when possible.

Do not send unnecessary sensitive raw transactions.

Suggested summary data:

```json
{
  "week_start": "2026-04-20",
  "week_end": "2026-04-26",
  "total_income": 1500,
  "total_expenses": 1200,
  "top_categories": [
    { "name": "Food", "amount": 500 },
    { "name": "Transport", "amount": 250 }
  ],
  "daily_spending": [
    { "date": "2026-04-20", "amount": 100 },
    { "date": "2026-04-21", "amount": 200 }
  ],
  "budget_success_days": 4,
  "overspending_days": 2,
  "impulse_total": 300
}
```

### AI Should Provide

* Short summary
* Spending pattern
* Budget warning
* Practical recommendation
* Encouraging tone

---

## 18. Money Health Score

### Feature Summary

Create a simple score that summarizes financial behavior.

### User Problem

Users need a quick way to understand how they are doing.

### Example

```text
Money Health: 78/100
Good job staying under budget for 4 days.
```

### Possible Factors

* Stayed under budget
* Logged transactions consistently
* Savings increased
* Impulse spending decreased
* No overdue planned expenses
* Spendable balance remained positive

### Important UX Rule

The score should feel encouraging, not judgmental.

---

## 19. No-Spend Day Tracker

### Feature Summary

Track days where the user did not spend money.

### User Problem

No-spend days can motivate users to control spending.

### Example

```text
You had 3 no-spend days this week.
```

### Features

* Count no-spend days
* Show streak
* Show calendar markers
* Include in weekly report

---

## 20. Forgot To Log Detection

### Feature Summary

Detect suspicious gaps where the user may have forgotten to log expenses.

### User Problem

The user is forgetful and may not open the app consistently.

### Example Warning

```text
You usually spend on weekdays, but Monday has no transactions. Did you forget to log something?
```

### Detection Logic

Check for:

* No transactions on usually active days
* Long gaps without entries
* No spending but account balance changed after reconciliation
* Missing daily check-in

---

# Priority Group 4: Increase Trust and Reliability

These features make the finance app safer to use long term.

---

## 21. Balance Reconciliation

### Feature Summary

Allow users to correct account balances when the real balance does not match the app balance.

### User Problem

Forgotten transactions cause app balances to drift away from reality.

### Example

```text
App says Cash = ₱850
Real cash = ₱790
Difference = -₱60
Add correction entry?
```

### Expected Behavior

When the user adjusts a balance:

* App calculates the difference
* App creates a balance adjustment record
* Account balance updates
* Reports can optionally exclude or include adjustments

### Implementation Notes

Use or create a `balance_adjustments` table.

Suggested fields:

```sql
id
user_id
account_id
old_balance
new_balance
difference
reason
created_at
```

---

## 22. Sync History

### Feature Summary

Show the user what offline changes were synced.

### User Problem

Offline-first apps need transparency so users trust their data.

### Example

```text
5 offline changes synced successfully.
Last synced: Today, 8:42 PM
```

### Sync History Should Include

* Last sync time
* Number of pending changes
* Successful syncs
* Failed syncs
* Conflict warnings

### Implementation Notes

Can be based on the existing sync queue.

---

## 23. Backup and Export Reminders

### Feature Summary

Remind users to export or back up financial data.

### User Problem

Financial records are important. Users need peace of mind.

### Example Reminder

```text
You have not exported a backup this month.
```

### Export Formats

* CSV
* Excel-compatible file
* JSON backup
* PDF summary later

### Implementation Notes

Create a backup/export reminder preference.

Suggested table:

```sql
export_history
```

Suggested fields:

```sql
id
user_id
export_type
file_format
created_at
```

---

## 24. Privacy Mode

### Feature Summary

Add stronger privacy controls beyond the eye icon.

### User Problem

Users may open the finance app in public.

### Expected Behavior

When privacy mode is on, all sensitive amounts should be hidden.

Example:

```text
Total Balance: •••••
Spendable: •••••
Cash: •••••
```

### Privacy Mode Should Hide

* Total balance
* Account balances
* Transaction amounts
* Report totals
* Savings amounts
* Budget amounts

---

## 25. App Lock Timeout Settings

### Feature Summary

Allow users to control when the app locks.

### Options

* Lock every time app opens
* Lock after 1 minute
* Lock after 5 minutes
* Lock only when app fully closes

### Implementation Notes

The current preferred behavior is to lock every time the app opens. Other options can be added later.

---

# Student-Specific Feature Ideas

These features make the app more unique for students.

---

## 26. Allowance Tracker

Track allowance separately from other income.

### Features

* Record allowance received
* Show allowance history
* Show how long allowance lasted
* Compare allowance to spending

---

## 27. Class-Day vs Weekend Budget

Students may spend differently on school days and weekends.

### Features

* Different daily budget for class days
* Different daily budget for weekends
* Reports comparing class-day spending vs weekend spending

---

## 28. School Expense Tracker

Track school-specific expenses.

### Examples

* Printing
* Projects
* Supplies
* Uniform
* Books
* Fees
* Contributions

---

## 29. Commute Budget

Track transportation spending.

### Features

* Daily commute budget
* Transport category report
* Frequent route cost templates

---

## 30. Survive Until Next Allowance Mode

### Feature Summary

A student-focused version of the survive-until-date calculator.

### Example

```text
You have ₱900 left and 5 days until allowance.
Recommended daily limit: ₱180.
```

### Expected Behavior

User enters:

* Current allowance amount or remaining money
* Next allowance date
* Upcoming expenses

App calculates:

* Daily safe limit
* Risk level
* Suggested spending reduction

---

# AI Feature Expansion

These features use the Groq API or another AI provider.

---

## 31. AI Chat Assistant

### Feature Summary

Add a chat assistant inside the app that can answer finance questions using the user's summarized app data.

### Example Questions

```text
Can I afford ₱300 food today?
```

```text
Why did I overspend this week?
```

```text
How can I save ₱1,000 this month?
```

```text
What category am I spending too much on?
```

### Important Rule

The AI should use actual app data summaries, not guesses.

---

## 32. AI Budget Recommendation

### Feature Summary

AI suggests a realistic budget based on previous spending.

### Example

```text
Based on your last 2 weeks, a realistic food budget is ₱120 per day.
```

### AI Input Data

* Average daily spending
* Category totals
* Budget success rate
* Impulse spending
* Upcoming expenses

---

## 33. AI Impulse Spending Insight

### Feature Summary

AI identifies possible impulse spending patterns.

### Example

```text
You tend to mark snack purchases as impulse spending during afternoons.
```

### Useful Data

* Transactions marked impulse
* Time of day
* Category
* Notes
* Location if available
* Budget status at purchase time

---

# UX and Accessibility Improvements

These features improve usability and daily app comfort.

---

## 34. Onboarding Setup Wizard

### Feature Summary

Guide new users through first-time setup.

### Steps

1. Add wallets/accounts
2. Add current balances
3. Set daily budget
4. Add savings amount
5. Choose reminders
6. Enable security lock
7. Start tracking

---

## 35. First-Week Learning Mode

### Feature Summary

Let the app observe the user's spending for one week before making strict budget recommendations.

### Example

```text
Track normally for one week. After that, I’ll suggest a realistic daily budget.
```

### Purpose

This helps users who do not know their actual spending patterns yet.

---

## 36. Custom Dashboard Cards

### Feature Summary

Allow users to choose what appears on the home screen.

### Possible Cards

* Total balance
* Spendable balance
* Safe to spend today
* Today’s budget
* Savings progress
* Recent transactions
* Biggest spending category
* AI insight
* No-spend streak
* Needs review inbox

---

## 37. Account Icons and Colors

### Feature Summary

Let users visually customize accounts and wallets.

### Examples

* Cash: wallet icon
* GCash: blue wallet
* Maya: green wallet
* Bank: card/building icon

### Purpose

This makes balances easier to recognize quickly.

---

## 38. Mood or Reason Tags

### Feature Summary

Allow users to tag why they spent money.

### Example Tags

* Hungry
* Stressed
* Bored
* Peer pressure
* School need
* Planned
* Emergency
* Reward

### Purpose

This helps explain impulse spending and can improve AI insights.

---

# Suggested Database Additions

Below are possible new tables and fields for the next version.

---

## New Table: transaction_templates

```sql
create table transaction_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type text not null,
  default_amount numeric,
  category_id uuid,
  subcategory_id uuid,
  account_id uuid,
  notes text,
  is_planned_default boolean default false,
  is_impulse_default boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

---

## New Table: favorite_actions

```sql
create table favorite_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action_type text not null,
  label text not null,
  icon text,
  position integer default 0,
  metadata jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

---

## New Table: purchase_waiting_room

```sql
create table purchase_waiting_room (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_name text not null,
  estimated_price numeric not null,
  category_id uuid,
  reason text,
  wait_until timestamptz,
  status text default 'waiting',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

---

## New Table: wishlist_items

```sql
create table wishlist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_name text not null,
  estimated_price numeric not null,
  category_id uuid,
  priority text,
  status text,
  notes text,
  target_date date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

---

## New Table: upcoming_expenses

```sql
create table upcoming_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  amount numeric not null,
  category_id uuid,
  account_id uuid,
  due_date date not null,
  is_paid boolean default false,
  paid_transaction_id uuid,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

---

## New Table: user_alerts

```sql
create table user_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  alert_type text not null,
  title text not null,
  message text not null,
  severity text default 'info',
  is_read boolean default false,
  metadata jsonb,
  created_at timestamptz default now()
);
```

---

## New Table: balance_adjustments

```sql
create table balance_adjustments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null,
  old_balance numeric not null,
  new_balance numeric not null,
  difference numeric not null,
  reason text,
  created_at timestamptz default now()
);
```

---

## New Table: export_history

```sql
create table export_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  export_type text not null,
  file_format text not null,
  created_at timestamptz default now()
);
```

---

# Suggested Existing Table Updates

## Update transactions table

Add these fields if they do not exist yet:

```sql
alter table transactions add column if not exists is_incomplete boolean default false;
alter table transactions add column if not exists needs_review boolean default false;
alter table transactions add column if not exists review_reason text;
alter table transactions add column if not exists planning_type text default 'unknown';
alter table transactions add column if not exists is_impulse boolean default false;
alter table transactions add column if not exists is_deleted boolean default false;
alter table transactions add column if not exists deleted_at timestamptz;
alter table transactions add column if not exists mood_tag text;
alter table transactions add column if not exists reason_tag text;
```

## Update accounts table

```sql
alter table accounts add column if not exists icon text;
alter table accounts add column if not exists color text;
alter table accounts add column if not exists is_deleted boolean default false;
alter table accounts add column if not exists deleted_at timestamptz;
alter table accounts add column if not exists last_confirmed_at timestamptz;
```

## Update categories table

```sql
alter table categories add column if not exists is_deleted boolean default false;
alter table categories add column if not exists deleted_at timestamptz;
```

---

# Suggested UI Screens To Add

## 1. Needs Review Screen

Purpose:

* Show lazy and incomplete entries
* Let user quickly complete missing details

## 2. Templates Screen

Purpose:

* Create and manage reusable transaction templates

## 3. Wishlist Screen

Purpose:

* Track wanted purchases
* Show affordability status

## 4. Purchase Waiting Room Screen

Purpose:

* Delay impulse purchases
* Help user reconsider before spending

## 5. Upcoming Expenses Screen

Purpose:

* Track future financial obligations

## 6. Survive Until Date Screen

Purpose:

* Calculate safe daily spending until a selected date

## 7. Balance Reconciliation Screen

Purpose:

* Correct account balances when real balance differs from app balance

## 8. Alerts Screen

Purpose:

* Show risk alerts, sync alerts, budget alerts, and reminders

## 9. AI Reflection Screen

Purpose:

* Show weekly/monthly AI-generated financial reflection

## 10. Trash Screen

Purpose:

* Restore or permanently delete soft-deleted records

---

# Suggested Implementation Order

Build in this order:

1. Duplicate transaction warning
2. Undo system
3. Soft delete / trash
4. Lazy entry inbox
5. Transaction templates
6. Favorite quick actions
7. Balance reconciliation
8. Upcoming expenses
9. Safe to spend today widget
10. Survive until date calculator
11. Purchase waiting room
12. Wishlist affordability status
13. Planned vs unplanned expenses
14. Risk alerts
15. Where did my money go report
16. Spending heatmap
17. Weekly AI reflection
18. Money health score
19. Backup/export reminders
20. Custom dashboard cards

---

# Highest Impact Features

If only a few features can be added next, prioritize these:

## Must Add Next

1. Lazy entry inbox
2. Transaction templates
3. Favorite quick actions
4. Balance reconciliation
5. Survive until date calculator
6. Purchase waiting room
7. Duplicate transaction warning
8. Undo system
9. Planned vs unplanned expenses
10. Weekly AI reflection

These features directly support the user’s main problems:

* Laziness
* Forgetfulness
* Impulse spending
* Not knowing safe-to-spend money
* Needing trust in wallet/account balances

---

# Final Product Direction

The app should evolve from a finance tracker into a personal money assistant.

The user should be able to open the app and quickly answer:

```text
How much money do I have?
How much can I safely spend today?
Where did my money go?
Can I afford this?
What should I avoid spending on?
Did I forget to log anything?
Will my money last until my next allowance?
```

The next version should make the app faster, smarter, safer, and more behavior-aware.

---

# Implementation Audit: Priority Group 2 - Make Spending Safer

Status: Implemented locally, then revised after follow-up review.

SQL copy/paste file:

```text
supabase/phase2_priority2_spending_safety.sql
```

## Implemented Features

1. Survive Until Date Calculator
   * Added calculator logic for target date, spendable balance, Calendar planning totals, optional planned income, days remaining, available money, and daily limit.
   * Added the calculator to the Spending Safety page with a date picker for target-date selection.

2. Purchase Waiting Room
   * Added local and sync-ready storage for waiting room purchases.
   * Added create, buy-now, cancel, move-to-wishlist, and extend-wait actions.
   * Moved review and creation UI to its own Waiting Room page instead of clamping it into Spending Safety.
   * Active review now hides cancelled, approved, purchased, and moved-to-wishlist items.
   * Buy now creates a real expense transaction and removes the item from active review.
   * Wait time is user-entered and schedules a local notification when the platform supports notifications.

3. Wishlist With Affordability Status
   * Added wishlist storage and affordability statuses.
   * Wishlist items use Groq AI, with local fallback, to classify purchases as Affordable, Not Affordable, or Not Recommended.
   * Added a Bought action that immediately creates an expense transaction and removes the item from active wishlist review.
   * Moved review and creation UI to its own Wishlist page instead of clamping it into Spending Safety.

4. Do I Have Enough Calculator
   * Added purchase affordability logic that shows remaining protected money and adjusted daily limit.
   * Added the calculator to the Spending Safety page.

5. Safe To Spend Today Widget
   * Added safe-to-spend-today logic that considers spendable balance, Calendar plans, today's budget, and today's spending.
   * Added the value to Home and the Spending Safety page.

6. Risk Alerts
   * Added a reusable risk alert generator for low spendable balance, Calendar plan pressure, tight daily limit, and overspending trend.
   * Added persisted user alerts with save-current and mark-read actions.

7. Expense Logging Toggles
   * Add Transaction, including Lazy Mode expense entry, and Quick Add now let expense entries save as a normal transaction, Wishlist item, or Waiting Room item.
   * Wishlist and Waiting Room captures do not change balances because no purchase has happened yet.

Removed from this implementation:

* The separate Upcoming Expenses table, repository, sync metadata, Calendar markers, and UI were removed after review.
* Calendar remains the single planning surface for advance expenses/planning.

## Code Audit

Persistence:

* Local SQLite schema updated in `src/db/sqlite/schema.ts`.
* Local migrations updated in `src/db/sqlite/migrations.ts`.
* Runtime schema guard added through `ensurePriorityTwoDatabaseSchema`.
* Sync metadata updated in `src/sync/engine.ts`.
* New repositories:
  * `src/db/repositories/purchaseWaitingRoomRepository.ts`
  * `src/db/repositories/wishlistItemsRepository.ts`
  * `src/db/repositories/userAlertsRepository.ts`

Business logic:

* `src/services/spendingSafety/calculateSpendingSafety.ts`
* `src/services/spendingSafety/generateRiskAlerts.ts`
* Unit tests added in `src/services/spendingSafety/calculateSpendingSafety.test.ts`

UI:

* New Spending Safety route: `src/app/safety.tsx`
* New Wishlist route: `src/app/wishlist.tsx`
* New Waiting Room route: `src/app/waiting-room.tsx`
* New screen: `src/features/spendingSafety/screens/SpendingSafetyScreen.tsx`
* New screen: `src/features/spendingSafety/screens/WishlistScreen.tsx`
* New screen: `src/features/spendingSafety/screens/WaitingRoomScreen.tsx`
* New AI helper: `src/services/spendingSafety/generateWishlistAffordability.ts`
* New local notification helper: `src/services/spendingSafety/scheduleWaitingRoomNotification.ts`
* Home now links to Spending Safety and shows Safe Today.
* More/Profile now links to Spending Safety, Wishlist, and Purchase Waiting Room.
* Add Transaction and Quick Add include expense destination toggles.
* Penny AI chat context now includes Spending Safety, Wishlist, and Waiting Room data and behavior.

## Verification Completed

```text
npm run typecheck
npx jest --runInBand
```

Result:

```text
TypeScript passed.
10 test suites passed.
66 tests passed.
```

## Manual Review Checklist

Review these pages and actions:

1. Home
   * Confirm the Spending Safety card appears below the AI card.
   * Confirm Safe Today changes when today's budget, future Calendar plans, or today's expenses change.
   * Confirm hidden-balance mode masks Safe Today.

2. More / Profile
   * Open Spending Safety from the Manage section.
   * Open Wishlist from the Manage section.
   * Open Purchase Waiting Room from the Manage section.

3. Spending Safety
   * Change the target date and optional planned income.
   * Confirm daily limit, available-until-date, Calendar plans, and days left update.
   * Enter a purchase amount in Do I Have Enough and confirm status/message changes for small and large purchases.
   * Open Calendar Planning from this page.
   * Open Wishlist from this page.
   * Open Waiting Room from this page.
   * Save current risk alerts and mark saved alerts as read.

4. Add Transaction
   * For an expense, select Transaction and confirm it saves normally.
   * Select Wishlist and confirm it creates a Wishlist item instead of changing balances.
   * Select Waiting Room and confirm it creates a Waiting Room item instead of changing balances.
   * Turn on Lazy Mode for an expense and confirm Wishlist and Waiting Room remain available.
   * Confirm income, transfer, edit, and lazy-entry flows still save normally.

5. Quick Add
   * Select a shortcut and save as Transaction.
   * Select Wishlist and confirm account selection is not required and the item appears on Wishlist.
   * Select Waiting Room and confirm account selection is not required and the item appears on Waiting Room.

6. Wishlist
   * Add a wishlist item directly on the Wishlist page.
   * Confirm the chip says Affordable, Not Affordable, or Not Recommended.
   * Use Bought and confirm it creates a transaction and removes the item from the active list.
   * Use Ask AI and confirm the message explains the updated chip.

7. Waiting Room
   * Add a waiting room purchase with a custom hour value.
   * Confirm local notification permission/scheduling behavior on a real device.
   * Test Buy now, Cancel, Extend, and Move to wishlist, and confirm bought/cancelled/moved items leave the active list.
   * Confirm Buy now creates an expense transaction from the selected source.

8. Penny AI Chat
   * Ask about Wishlist, Waiting Room, Safe Today, or whether a wishlist item is affordable.
   * Confirm Penny knows Wishlist/Waiting Room cannot change balances until bought/logged.

9. Calendar
   * Set future day budgets/plans and confirm Spending Safety uses them as Calendar planning totals.

10. Sync / Supabase
   * Copy and run `supabase/phase2_priority2_spending_safety.sql` in Supabase SQL editor.
   * Create one waiting room item, wishlist item, and saved alert.
   * Trigger sync and confirm no sync errors for the new tables.

Known issues found in this audit:

```text
None from typecheck and automated tests.
Manual device/browser review is still recommended for layout and sync behavior.
```
