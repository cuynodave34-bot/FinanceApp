function currencySymbol(currency: string): string {
  return currency === 'PHP' ? '₱' : currency;
}

function formatNumberWithCommas(amount: number): string {
  const parts = Math.abs(amount).toFixed(2).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.join('.');
}

export function formatMoney(amount: number, currency = 'PHP') {
  return `${currencySymbol(currency)} ${formatNumberWithCommas(amount)}`;
}

export function formatSignedMoney(amount: number, currency = 'PHP') {
  const sign = amount > 0 ? '+' : amount < 0 ? '-' : '';
  return `${sign}${currencySymbol(currency)} ${formatNumberWithCommas(amount)}`;
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

export function formatDateKey(value: string) {
  const date = new Date(`${value}T12:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    weekday: 'short',
  });
}

export function maskFinancialValue(value: string, hidden: boolean) {
  return hidden ? 'Hidden' : value;
}
