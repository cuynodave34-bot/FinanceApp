import { createTransaction } from '@/db/repositories/transactionsRepository';
import { listAccountsByUser } from '@/db/repositories/accountsRepository';
import { listCategoriesByUser } from '@/db/repositories/categoriesRepository';
import { TransactionType } from '@/shared/types/domain';
import { createId } from '@/shared/utils/id';
import { nowIso } from '@/shared/utils/time';

export type CsvImportResult = {
  imported: number;
  skipped: number;
  errors: string[];
};

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (insideQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          insideQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        insideQuotes = true;
      } else if (char === ',') {
        values.push(current);
        current = '';
      } else {
        current += char;
      }
    }
  }
  values.push(current);
  return values;
}

function parseCsv(text: string): string[][] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  return lines.slice(1).map(parseCsvLine).filter((row) => row.some((cell) => cell.trim() !== ''));
}

const VALID_TYPES: TransactionType[] = ['income', 'expense', 'transfer'];

export async function importTransactionsFromCsv(
  userId: string,
  csvText: string
): Promise<CsvImportResult> {
  const rows = parseCsv(csvText);
  const result: CsvImportResult = { imported: 0, skipped: 0, errors: [] };

  if (rows.length === 0) {
    result.errors.push('No data rows found in CSV.');
    return result;
  }

  const [accounts, categories] = await Promise.all([
    listAccountsByUser(userId),
    listCategoriesByUser(userId),
  ]);

  const accountMap = new Map(accounts.map((a) => [a.name.toLowerCase(), a.id]));
  const categoryMap = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]));

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const lineNumber = i + 2;

    const type = row[1]?.trim().toLowerCase();
    const amount = Number(row[2]?.trim());
    const accountName = row[3]?.trim() ?? '';
    const toAccountName = row[4]?.trim() ?? '';
    const categoryName = row[5]?.trim() ?? '';
    const notes = row[6]?.trim() ?? '';
    const locationName = row[7]?.trim() ?? '';
    const photoUrl = row[8]?.trim() ?? '';
    const date = row[9]?.trim() ?? nowIso();

    if (!type || !VALID_TYPES.includes(type as TransactionType)) {
      result.errors.push(`Row ${lineNumber}: invalid type "${type}". Must be income, expense, or transfer.`);
      result.skipped++;
      continue;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      result.errors.push(`Row ${lineNumber}: amount must be a positive number.`);
      result.skipped++;
      continue;
    }

    const accountId = accountMap.get(accountName.toLowerCase()) ?? null;
    const toAccountId = toAccountName ? (accountMap.get(toAccountName.toLowerCase()) ?? null) : null;
    const categoryId = categoryName ? (categoryMap.get(categoryName.toLowerCase()) ?? null) : null;

    try {
      await createTransaction({
        userId,
        type: type as TransactionType,
        amount,
        accountId,
        toAccountId: type === 'transfer' ? toAccountId : null,
        categoryId: type === 'transfer' ? null : categoryId,
        notes: notes || null,
        photoUrl: photoUrl || null,
        locationName: locationName || null,
        transactionAt: date,
        isLazyEntry: false,
        isImpulse: false,
      });
      result.imported++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(`Row ${lineNumber}: ${message}`);
      result.skipped++;
    }
  }

  return result;
}
