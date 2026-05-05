alter table public.transactions
  add column if not exists savings_goal_id text references public.savings_goals(id) on delete set null,
  add column if not exists from_savings_goal_id text references public.savings_goals(id) on delete set null;

alter table public.transactions
  drop constraint if exists transfer_requires_target;

alter table public.transactions
  add constraint transfer_requires_target check (
    (
      type = 'transfer'
      and (to_account_id is not null or savings_goal_id is not null)
      and (account_id is not null or from_savings_goal_id is not null)
    )
    or
    (
      type <> 'transfer'
      and to_account_id is null
      and savings_goal_id is null
      and from_savings_goal_id is null
    )
  );

notify pgrst, 'reload schema';
