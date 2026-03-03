import { JobLineItem } from '../models';

export function toCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(cents / 100);
}

export function normalizeCents(value: number | string): number {
  const amount = typeof value === 'string' ? Number(value) : value;

  if (!Number.isFinite(amount)) {
    return 0;
  }

  return Math.round(amount);
}

export function calculateLineTotal(quantity: number, unitPriceCents: number): number {
  return Math.round(quantity * unitPriceCents);
}

export function sumLineItems(lineItems: JobLineItem[]): number {
  return lineItems.reduce((total, lineItem) => total + lineItem.totalCents, 0);
}

export function buildInvoiceNumber(prefix: string, sequence: number, year = new Date().getFullYear()): string {
  return `${prefix}-${year}-${String(sequence).padStart(4, '0')}`;
}
