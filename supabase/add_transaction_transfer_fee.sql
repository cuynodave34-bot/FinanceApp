alter table public.transactions
  add column if not exists transfer_fee numeric(14,2) not null default 0 check (transfer_fee >= 0);

create or replace view public.account_balances as
select
  a.id,
  a.user_id,
  a.name,
  a.type,
  a.currency,
  a.initial_balance
    + coalesce(sum(
      case
        when t.deleted_at is not null then 0
        when t.type = 'income' and t.account_id = a.id then t.amount
        when t.type = 'expense' and t.account_id = a.id then -t.amount
        when t.type = 'transfer' and t.to_account_id = a.id then greatest(t.amount - coalesce(t.transfer_fee, 0), 0)
        when t.type = 'transfer' and t.account_id = a.id then -t.amount
        else 0
      end
    ), 0) as current_balance
from public.accounts a
left join public.transactions t
  on t.user_id = a.user_id
 and (t.account_id = a.id or t.to_account_id = a.id)
group by a.id, a.user_id, a.name, a.type, a.currency, a.initial_balance;
