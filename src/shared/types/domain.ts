export type AccountType = 'cash' | 'bank' | 'e_wallet' | 'other';
export type CategoryType = 'income' | 'expense' | 'both';
export type TransactionType = 'income' | 'expense' | 'transfer';
export type PlanningType = 'planned' | 'unplanned' | 'impulse' | 'emergency' | 'unknown';
export type ReminderType = 'morning_checkin' | 'afternoon_log' | 'night_review';
export type PurchaseWaitingStatus =
  | 'waiting'
  | 'approved'
  | 'cancelled'
  | 'purchased'
  | 'moved_to_wishlist';
export type WishlistAffordabilityStatus =
  | 'affordable'
  | 'not_affordable'
  | 'not_recommended'
  | 'purchased';
export type AlertSeverity = 'info' | 'warning' | 'danger';

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
  transferFee?: number;
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
  isIncomplete?: boolean;
  needsReview?: boolean;
  reviewReason?: string | null;
  planningType?: PlanningType;
  isImpulse: boolean;
  moodTag?: string | null;
  reasonTag?: string | null;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TransactionTemplate = {
  id: string;
  userId: string;
  name: string;
  type: TransactionType;
  defaultAmount?: number | null;
  categoryId?: string | null;
  subcategoryId?: string | null;
  accountId?: string | null;
  toAccountId?: string | null;
  savingsGoalId?: string | null;
  fromSavingsGoalId?: string | null;
  notes?: string | null;
  isPlannedDefault: boolean;
  isImpulseDefault: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
};

export type FavoriteAction = {
  id: string;
  userId: string;
  actionType: string;
  label: string;
  icon?: string | null;
  position: number;
  metadata: Record<string, unknown>;
  isArchived: boolean;
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

export type PurchaseWaitingRoomItem = {
  id: string;
  userId: string;
  itemName: string;
  estimatedPrice: number;
  categoryId?: string | null;
  reason?: string | null;
  waitUntil?: string | null;
  status: PurchaseWaitingStatus;
  createdAt: string;
  updatedAt: string;
};

export type WishlistItem = {
  id: string;
  userId: string;
  itemName: string;
  estimatedPrice: number;
  categoryId?: string | null;
  priority?: string | null;
  status: WishlistAffordabilityStatus;
  notes?: string | null;
  targetDate?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type UserAlert = {
  id: string;
  userId: string;
  alertType: string;
  title: string;
  message: string;
  severity: AlertSeverity;
  isRead: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type BalanceAdjustment = {
  id: string;
  userId: string;
  accountId: string;
  oldBalance: number;
  newBalance: number;
  difference: number;
  reason?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ExportHistoryItem = {
  id: string;
  userId: string;
  exportType: string;
  fileFormat: string;
  createdAt: string;
  updatedAt: string;
};
