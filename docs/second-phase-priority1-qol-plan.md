# Phase 2 Priority 1 Quality-of-Life Plan

## Current Implementation Check

| Feature | Current status | Assessment |
| --- | --- | --- |
| Duplicate transaction warning | done | Shared recent-duplicate detection is wired into Add Transaction and Quick Add. |
| Undo system | done | Transaction create, update, and delete actions write local undo records; Activity exposes an undo button for the latest undoable transaction action. |
| Soft delete / trash | done | Transactions move to trash with restore and permanent-delete actions. Other syncable entities already have soft-delete/archive foundations. |
| Lazy entry inbox | done | Home and Activity now use `needs_review`, `is_incomplete`, and `is_lazy_entry` as the review surface, with reason text when available. |
| Transaction templates | done | Local/Supabase schema, repository, manager screen, "save as template", and Add Transaction prefill are implemented. |
| Favorite quick actions | done | Home quick actions are persisted, reorderable/removable, and manageable from a dedicated screen. |

## Logic Notes

- Lazy entries currently make sense as amount-first transactions: they can affect an account immediately when one is selected, or stay accountless until completion.
- Soft delete currently makes sense because `deleted_at` is already respected by transaction queries, account balance calculations, and sync delete pushes.
- Balance reconciliation already exists as a home prompt with `balance_adjustments`; the phase SQL adds a generated `difference` column for copy-paste database parity.
- Quick Add now has a useful default-source behavior from recent matching transactions. This remains client-side because it depends on local habits.

## Recommended Build Order

1. Duplicate transaction warning - done
   - Use local SQLite data before save.
   - Match by amount, type, category, account or savings source, and recent creation time.
   - Give actions: cancel, edit existing, add anyway.

2. Undo for transaction create/update/delete - done
   - Uses local `activity_log` rows with an expiry window.
   - Activity screen exposes the latest undoable action.

3. Trash screen for soft-deleted transactions - done
   - Keep normal queries filtering `deleted_at is null`.
   - Add repository functions to list, restore, and permanently delete trashed rows.
   - Defer account/category trash until transaction trash behavior is proven.

4. Lazy entry inbox upgrade - done
   - Add `needs_review`, `review_reason`, and `is_incomplete`.
   - Continue treating `is_lazy_entry` as incomplete for backward compatibility.
   - Show concrete reasons such as missing category, missing account, or old lazy entry.

5. Transaction templates - done
   - Add table, repository, and template manager screen.
   - Add "save as template" from an existing transaction.
   - Let templates prefill Add Transaction instead of bypassing validation.

6. Favorite quick actions - done
   - Add table and repository.
   - Replace static home actions with user-managed ordered actions.
   - Allow metadata to open Add Transaction, Quick Add, Lazy Entry, Transfer, or a template.

## SQL File

The copy-paste SQL for this phase is separate:

`supabase/phase2_priority1_quality_of_life.sql`
