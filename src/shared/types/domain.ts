export type AccountType = 'cash' | 'bank' | 'e_wallet' | 'other';
export type CategoryType = 'income' | 'expense' | 'both';
export type TransactionType = 'income' | 'expense' | 'transfer';

export type Account = {
  id: string;
  userId: string;
  name: string;
  type: AccountType;
  initialBalance: number;
  currency: string;
  isArchived: boolean;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Category = {
  id: string;
  userId: string;
  name: string;
  type: CategoryType;
  parentCategoryId?: string | null;
  icon?: string | null;
  color?: string | null;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Transaction = {
  id: string;
  userId: string;
  type: TransactionType;
  amount: number;
  accountId?: string | null;
  toAccountId?: string | null;
  categoryId?: string | null;
  notes?: string | null;
  transactionAt: string;
  isLazyEntry: boolean;
  isImpulse: boolean;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Budget = {
  id: string;
  userId: string;
  budgetDate: string;
  budgetAmount: number;
  carriedOverAmount: number;
  overspentAmount: number;
  notes?: string | null;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};
