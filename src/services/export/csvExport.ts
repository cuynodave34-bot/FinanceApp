import { TransactionFeedItem } from '@/db/repositories/transactionsRepository';

export function exportTransactionsToCsv(transactions: TransactionFeedItem[]): string {
  const headers = [
    'ID',
    'Type',
    'Amount',
    'Account',
    'To Account',
    'Category',
    'Notes',
    'Location',
    'Photo URL',
    'Date',
    'Lazy Entry',
    'Impulse',
  ];

  const escape = (value: string) => {
    const text = value ?? '';
    if (text.includes(',') || text.includes('"') || text.includes('\n')) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };

  const rows = transactions.map((tx) => [
    tx.id,
    tx.type,
    String(tx.amount),
    tx.accountName ?? '',
    tx.toAccountName ?? '',
    tx.categoryName ?? '',
    tx.notes ?? '',
    tx.locationName ?? '',
    tx.photoUrl ?? '',
    tx.transactionAt,
    tx.isLazyEntry ? 'Yes' : 'No',
    tx.isImpulse ? 'Yes' : 'No',
  ]);

  return [headers, ...rows].map((row) => row.map(escape).join(',')).join('\n');
}
