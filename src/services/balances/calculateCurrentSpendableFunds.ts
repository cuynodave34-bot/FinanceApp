import { Account, Savings, Transaction } from '@/shared/types/domain';

type CurrentSpendableFundsInput = {
  accounts: Account[];
  savings: Savings[];
  transactions: Transaction[];
};

export function calculateCurrentSpendableFunds({
  accounts,
  savings,
  transactions,
}: CurrentSpendableFundsInput) {
  const accountBalances = new Map(
    accounts
      .filter((account) => !account.isArchived)
      .map((account) => [account.id, account.initialBalance])
  );

  for (const transaction of transactions) {
    if (transaction.deletedAt) continue;

    if (transaction.type === 'income' && transaction.accountId) {
      accountBalances.set(
        transaction.accountId,
        (accountBalances.get(transaction.accountId) ?? 0) + transaction.amount
      );
    }

    if (transaction.type === 'expense' && transaction.accountId) {
      accountBalances.set(
        transaction.accountId,
        (accountBalances.get(transaction.accountId) ?? 0) - transaction.amount
      );
    }

    if (transaction.type === 'transfer') {
      if (transaction.accountId) {
        accountBalances.set(
          transaction.accountId,
          (accountBalances.get(transaction.accountId) ?? 0) - transaction.amount
        );
      }
      if (transaction.toAccountId) {
        accountBalances.set(
          transaction.toAccountId,
          (accountBalances.get(transaction.toAccountId) ?? 0) + transaction.amount
        );
      }
    }
  }

  const spendableAccountsTotal = accounts
    .filter((account) => !account.isArchived && account.isSpendable)
    .reduce((sum, account) => sum + (accountBalances.get(account.id) ?? account.initialBalance), 0);
  const spendableSavingsTotal = savings
    .filter((goal) => goal.isSpendable)
    .reduce((sum, goal) => sum + goal.currentAmount, 0);

  return Number((spendableAccountsTotal + spendableSavingsTotal).toFixed(2));
}
