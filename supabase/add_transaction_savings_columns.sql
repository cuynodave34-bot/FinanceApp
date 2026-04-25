alter table public.transactions
  add column if not exists savings_goal_id text references public.savings_goals(id) on delete set null,
  add column if not exists from_savings_goal_id text references public.savings_goals(id) on delete set null;
