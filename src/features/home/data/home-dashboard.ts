export const homeDashboardPreview = {
  greeting: 'Track what matters today',
  syncStatus: 'Offline-ready foundation',
  totalBalance: 'PHP 12,480.00',
  spendableBalance: 'PHP 8,920.00',
  savingsBalance: 'PHP 2,400.00',
  todaysBudget: 'PHP 250.00',
  spentToday: 'PHP 120.00',
  remainingToday: 'PHP 130.00',
  accounts: [
    { id: 'cash', name: 'Cash', balance: 'PHP 1,240.00', tone: 'sun' },
    { id: 'gcash', name: 'GCash', balance: 'PHP 3,120.00', tone: 'mint' },
    { id: 'maya', name: 'Maya', balance: 'PHP 2,560.00', tone: 'sand' },
    { id: 'bank', name: 'BPI', balance: 'PHP 5,560.00', tone: 'ink' },
  ],
  quickActions: ['Add Expense', 'Add Income', 'Lazy Entry', 'Transfer'],
  recentTransactions: [
    { id: '1', label: 'Lunch', meta: 'Cash | Food', amount: '-PHP 95.00' },
    { id: '2', label: 'Allowance', meta: 'BPI | Income', amount: '+PHP 1,500.00' },
    { id: '3', label: 'Transfer to Cash', meta: 'GCash -> Cash', amount: 'PHP 500.00' },
  ],
  incompleteEntries: [
    { id: 'lazy-1', amount: 'PHP 100.00', createdAt: 'Today, 2:15 PM' },
    { id: 'lazy-2', amount: 'PHP 48.00', createdAt: 'Yesterday, 6:40 PM' },
  ],
} as const;
