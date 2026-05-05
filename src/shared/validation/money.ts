export const MAX_MONEY_AMOUNT = 999999999999.99;

type NormalizeMoneyOptions = {
  fieldName?: string;
  allowZero?: boolean;
  allowNegative?: boolean;
  max?: number;
};

export function normalizeMoneyAmount(
  value: number,
  {
    fieldName = 'Amount',
    allowZero = false,
    allowNegative = false,
    max = MAX_MONEY_AMOUNT,
  }: NormalizeMoneyOptions = {}
) {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    throw new Error(`${fieldName} must be a valid number.`);
  }

  if (!allowNegative && amount < 0) {
    throw new Error(`${fieldName} cannot be negative.`);
  }

  if (!allowZero && amount === 0) {
    throw new Error(`${fieldName} must be greater than zero.`);
  }

  if (Math.abs(amount) > max) {
    throw new Error(`${fieldName} is too large.`);
  }

  return Number(amount.toFixed(2));
}

