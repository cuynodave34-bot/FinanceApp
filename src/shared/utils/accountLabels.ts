import { Account, AccountType } from '@/shared/types/domain';

const accountTypeLabels: Record<AccountType, string> = {
  cash: 'Personal Cash',
  bank: 'Bank Account',
  e_wallet: 'E-Wallet',
  other: 'Other Account',
};

export function formatAccountTypeLabel(type: AccountType) {
  return accountTypeLabels[type];
}

export function formatAccountLabel(account: Account) {
  return account.name.trim() || formatAccountTypeLabel(account.type);
}

export function formatTransactionAccountLabel(accountName?: string | null) {
  return accountName?.trim() || 'Cash';
}
