import { createTransaction } from '@/db/repositories/transactionsRepository';
import { listAccountsByUser } from '@/db/repositories/accountsRepository';
import { listCategoriesByUser } from '@/db/repositories/categoriesRepository';
import { TransactionType } from '@/shared/types/domain';
import { nowIso } from '@/shared/utils/time';
import { redactSensitiveText } from '@/shared/utils/redaction';
import { normalizeMoneyAmount } from '@/shared/validation/money';
import { normalizeTextInput } from '@/shared/validation/text';

export type CsvImportResult = {
  imported: number;
  skipped: number;
  errors: string[];
};

function pushCsvRow(rows: string[][], row: string[], current: string) {
  const nextRow = [...row, current];
  if (nextRow.some((cell) => cell.trim() !== '')) {
    rows.push(nextRow);
  }
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let current = '';
  let insideQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (insideQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
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
        row.push(current);
        current = '';
      } else if (char === '\n') {
        pushCsvRow(rows, row, current);
        row = [];
        current = '';
      } else if (char === '\r') {
        pushCsvRow(rows, row, current);
        row = [];
        current = '';
        if (text[i + 1] === '\n') {
          i++;
        }
      } else {
        current += char;
      }
    }
  }

  if (insideQuotes) {
    throw new Error('CSV is malformed. Check for an unclosed quoted field.');
  }

  pushCsvRow(rows, row, current);
  return rows;
}

const VALID_TYPES: TransactionType[] = ['income', 'expense', 'transfer'];
const EXPECTED_HEADERS = [
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
const MAX_CSV_BYTES = 1024 * 1024;
const MAX_CSV_ROWS = 2000;
const MAX_IMPORT_ERRORS = 50;
const MONEY_INPUT_PATTERN = /^\d+(?:\.\d{1,2})?$/;

function isValidDateInput(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}(?:[T ][^,\r\n]*)?$/.test(value)) {
    return false;
  }

  return !Number.isNaN(new Date(value).getTime());
}

export async function importTransactionsFromCsv(
  userId: string,
  csvText: string
): Promise<CsvImportResult> {
  const result: CsvImportResult = { imported: 0, skipped: 0, errors: [] };
  const csvSize = getApproximateUtf8ByteLength(csvText);

  if (csvSize > MAX_CSV_BYTES) {
    result.errors.push('CSV file is too large. Import files must be 1 MB or smaller.');
    return result;
  }

  let parsedRows: string[][];
  try {
    parsedRows = parseCsv(csvText);
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : 'CSV is malformed.');
    return result;
  }

  const [header, ...rows] = parsedRows;

  if (rows.length === 0) {
    result.errors.push('No data rows found in CSV.');
    return result;
  }

  if (rows.length > MAX_CSV_ROWS) {
    result.errors.push(`CSV has too many rows. Import ${MAX_CSV_ROWS} rows or fewer at a time.`);
    return result;
  }

  if (!headerMatchesExpectedFormat(header)) {
    result.errors.push('CSV header does not match the expected transaction export format.');
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

    let type: string;
    let amount: number;
    let accountName: string;
    let toAccountName: string;
    let categoryName: string;
    let notes: string;
    let locationName: string;
    let photoUrl: string;
    let date: string;

    try {
      if (row.length !== EXPECTED_HEADERS.length) {
        throw new Error(`Row must have exactly ${EXPECTED_HEADERS.length} columns.`);
      }

      type = row[1]?.trim().toLowerCase() ?? '';
      const amountText = row[2]?.trim() ?? '';
      if (!MONEY_INPUT_PATTERN.test(amountText)) {
        throw new Error('Amount must use a positive decimal number with up to 2 decimal places.');
      }
      amount = Number(amountText);
      accountName = normalizeCsvText(row[3], 'Account', 80) ?? '';
      toAccountName = normalizeCsvText(row[4], 'To account', 80) ?? '';
      categoryName = normalizeCsvText(row[5], 'Category', 80) ?? '';
      notes = normalizeCsvText(row[6], 'Notes', 1000) ?? '';
      locationName = normalizeCsvText(row[7], 'Location', 255) ?? '';
      photoUrl = normalizeCsvText(row[8], 'Photo URL', 2048) ?? '';
      date = row[9]?.trim() ?? nowIso();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addRowError(result, lineNumber, message);
      result.skipped++;
      continue;
    }

    if (!type || !VALID_TYPES.includes(type as TransactionType)) {
      addRowError(result, lineNumber, `invalid type "${type}". Must be income, expense, or transfer.`);
      result.skipped++;
      continue;
    }

    try {
      amount = normalizeMoneyAmount(amount, { fieldName: 'Amount' });
    } catch {
      addRowError(result, lineNumber, 'amount must be a positive number.');
      result.skipped++;
      continue;
    }

    if (!isValidDateInput(date)) {
      addRowError(result, lineNumber, 'date is invalid.');
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
      const message = redactSensitiveText(error, 180);
      addRowError(result, lineNumber, message);
      result.skipped++;
    }
  }

  if (result.errors.length >= MAX_IMPORT_ERRORS) {
    result.errors.push('Additional row errors were hidden to keep the import report readable.');
  }

  return result;
}

function headerMatchesExpectedFormat(header: string[] | undefined) {
  if (!header || header.length !== EXPECTED_HEADERS.length) return false;

  return EXPECTED_HEADERS.every(
    (expected, index) => header[index]?.trim().toLowerCase() === expected.toLowerCase()
  );
}

function addRowError(result: CsvImportResult, lineNumber: number, message: string) {
  if (result.errors.length < MAX_IMPORT_ERRORS) {
    result.errors.push(`Row ${lineNumber}: ${message}`);
  }
}

function normalizeCsvText(value: string | undefined, fieldName: string, maxLength: number) {
  return normalizeTextInput(value, { fieldName, maxLength });
}

function getApproximateUtf8ByteLength(value: string) {
  return encodeURIComponent(value).replace(/%[0-9A-F]{2}/g, 'x').length;
}
