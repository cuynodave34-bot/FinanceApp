import { seedDefaultCategoriesIfNeeded } from '@/db/repositories/categoriesRepository';
import { seedDefaultRemindersIfNeeded } from '@/db/repositories/remindersRepository';

export async function bootstrapLocalUserData(userId: string) {
  await seedDefaultCategoriesIfNeeded(userId);
  await seedDefaultRemindersIfNeeded(userId);
}
