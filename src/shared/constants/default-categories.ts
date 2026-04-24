import { CategoryType } from '@/shared/types/domain';

export type CategorySeed = {
  name: string;
  type: CategoryType;
  children?: string[];
};

export const defaultCategorySeeds: CategorySeed[] = [
  {
    name: 'Food',
    type: 'expense',
    children: ['Lunch', 'Dinner', 'Snacks', 'Drinks'],
  },
  {
    name: 'Transport',
    type: 'expense',
    children: ['Jeep', 'Bus', 'Tricycle', 'Ride-hailing'],
  },
  {
    name: 'School',
    type: 'expense',
    children: ['Printing', 'Projects', 'Supplies'],
  },
  { name: 'Wants', type: 'expense' },
  { name: 'Emergency', type: 'expense' },
  { name: 'Random', type: 'expense' },
  { name: 'Load', type: 'expense' },
  { name: 'Online Shopping', type: 'expense' },
  { name: 'Gifts', type: 'expense' },
  { name: 'Allowance', type: 'income' },
  { name: 'Freelance', type: 'income' },
  { name: 'Other Income', type: 'income' },
];
