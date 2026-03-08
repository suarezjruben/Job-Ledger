import { JobLineItem } from '../models';

export function toCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(normalizeAmount(amount));
}

export function normalizeAmount(value: number | string): number {
  const amount = typeof value === 'string' ? Number(value) : value;

  if (!Number.isFinite(amount)) {
    return 0;
  }

  return Math.round(amount * 100) / 100;
}

export function calculateLineTotal(quantity: number, unitPrice: number): number {
  return normalizeAmount(quantity * unitPrice);
}

export function sumLineItems(lineItems: JobLineItem[]): number {
  return normalizeAmount(lineItems.reduce((total, lineItem) => total + lineItem.total, 0));
}

export function buildInvoiceNumber(prefix: string, sequence: number, year = new Date().getFullYear()): string {
  return `${prefix}-${year}-${String(sequence).padStart(4, '0')}`;
}
