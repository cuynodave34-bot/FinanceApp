export function formatMoney(amount: number, currency = 'PHP') {
  return `${currency} ${amount.toFixed(2)}`;
}

export function formatSignedMoney(amount: number, currency = 'PHP') {
  const sign = amount > 0 ? '+' : amount < 0 ? '-' : '';
  return `${sign}${currency} ${Math.abs(amount).toFixed(2)}`;
}

export function formatTransactionDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
