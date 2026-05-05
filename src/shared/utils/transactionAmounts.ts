import { Transaction } from '@/shared/types/domain';

export function getTransferFee(transaction: Pick<Transaction, 'type' | 'transferFee'>) {
  if (transaction.type !== 'transfer') return 0;
  return Math.max(0, transaction.transferFee ?? 0);
}

export function getTransferReceivedAmount(
  transaction: Pick<Transaction, 'type' | 'amount' | 'transferFee'>
) {
  if (transaction.type !== 'transfer') return transaction.amount;
  return Math.max(0, Number((transaction.amount - getTransferFee(transaction)).toFixed(2)));
}
