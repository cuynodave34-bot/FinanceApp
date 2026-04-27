export type AccountType = 'cash' | 'bank' | 'e_wallet' | 'other';
export type CategoryType = 'income' | 'expense' | 'both';
export type TransactionType = 'income' | 'expense' | 'transfer';
export type ReminderType = 'morning_checkin' | 'afternoon_log' | 'night_review';

export type Account = {
  id: string;
  userId: string;
  name: string;
  type: AccountType;
  initialBalance: number;
  currency: string;
  isSpendable: boolean;
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
  savingsGoalId?: string | null;
  fromSavingsGoalId?: string | null;
  categoryId?: string | null;
  notes?: string | null;
  transactionAt: string;
  photoUrl?: string | null;
  locationName?: string | null;
  latitude?: number | null;
  longitude?: number | null;
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

export type Reminder = {
  id: string;
  userId: string;
  type: ReminderType;
  reminderTime: string;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type InterestPeriod = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'semi_annual' | 'annual';

export type Savings = {
  id: string;
  userId: string;
  name: string;
  currentAmount: number;
  interestRate: number;
  interestPeriod: InterestPeriod;
  minimumBalanceForInterest: number;
  withholdingTaxRate: number;
  maintainingBalance: number;
  isSpendable: boolean;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DebtType = 'lent' | 'borrowed';
export type DebtStatus = 'pending' | 'paid';

export type Debt = {
  id: string;
  userId: string;
  name: string;
  debtType: DebtType;
  totalAmount: number;
  paidAmount: number;
  status: DebtStatus;
  linkedTransactionId?: string | null;
  accountId?: string | null;
  dueDate?: string | null;
  notes?: string | null;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};
