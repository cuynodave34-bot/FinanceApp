export const homeDashboardPreview = {
  greeting: 'Track what matters today',
  syncStatus: 'Offline-ready foundation',
  totalBalance: '₱ 12,480.00',
  spendableBalance: '₱ 8,920.00',
  savingsBalance: '₱ 2,400.00',
  todaysBudget: '₱ 250.00',
  spentToday: '₱ 120.00',
  remainingToday: '₱ 130.00',
  accounts: [
    { id: 'cash', name: 'Cash', balance: '₱ 1,240.00', tone: 'sun' },
    { id: 'gcash', name: 'GCash', balance: '₱ 3,120.00', tone: 'mint' },
    { id: 'maya', name: 'Maya', balance: '₱ 2,560.00', tone: 'sand' },
    { id: 'bank', name: 'BPI', balance: '₱ 5,560.00', tone: 'ink' },
  ],
  quickActions: ['Add Expense', 'Add Income', 'Lazy Entry', 'Transfer'],
  recentTransactions: [
    { id: '1', label: 'Lunch', meta: 'Cash | Food', amount: '-₱ 95.00' },
    { id: '2', label: 'Allowance', meta: 'BPI | Income', amount: '+₱ 1,500.00' },
    { id: '3', label: 'Transfer to Cash', meta: 'GCash -> Cash', amount: '₱ 500.00' },
  ],
  incompleteEntries: [
    { id: 'lazy-1', amount: '₱ 100.00', createdAt: 'Today, 2:15 PM' },
    { id: 'lazy-2', amount: '₱ 48.00', createdAt: 'Yesterday, 6:40 PM' },
  ],
} as const;
