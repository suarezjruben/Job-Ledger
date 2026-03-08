import { Timestamp } from 'firebase/firestore';

export const JOB_STATUSES = [
  'scheduled',
  'in_progress',
  'completed',
  'invoiced',
  'canceled',
  'archived'
] as const;

export const INVOICE_STATUSES = ['draft', 'issued', 'paid', 'void', 'archived'] as const;
export const LINE_ITEM_KINDS = ['labor', 'material', 'custom'] as const;
export const JOB_IMAGE_VARIANTS = ['thumb', 'display'] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];
export type LineItemKind = (typeof LINE_ITEM_KINDS)[number];
export type JobImageVariant = (typeof JOB_IMAGE_VARIANTS)[number];

export interface PostalAddress {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
}

export interface ClientRecord {
  id: string;
  displayName: string;
  companyName?: string;
  billingEmail?: string;
  phone?: string;
  billingAddress?: PostalAddress;
  serviceAddress?: PostalAddress;
  notes?: string;
  archivedAt: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface JobLineItem {
  id: string;
  kind: LineItemKind;
  kindLabel?: string;
  description: string;
  quantity: number;
  unitLabel: string;
  unitPrice: number;
  total: number;
}

export interface JobRecord {
  id: string;
  clientId: string;
  title: string;
  address?: PostalAddress;
  description?: string;
  notes?: string;
  status: JobStatus;
  startDate: string;
  endDate: string;
  lineItems: JobLineItem[];
  invoiceId: string | null;
  attachmentCount: number;
  archivedAt: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface JobImageRecord {
  id: string;
  ownerUid: string;
  displayKey: string;
  thumbKey: string;
  displayContentType: string;
  thumbContentType: string;
  displayBytes: number;
  thumbBytes: number;
  totalBytes: number;
  width: number;
  height: number;
  createdAt: Timestamp;
}

export interface InvoiceClientSnapshot {
  displayName: string;
  companyName?: string;
  billingEmail?: string;
  phone?: string;
  billingAddress?: PostalAddress;
}

export interface InvoiceJobSnapshot {
  title: string;
  address?: PostalAddress;
  startDate: string;
  endDate: string;
  description?: string;
}

export interface InvoiceBusinessSnapshot {
  businessName: string;
  contactEmail: string;
  phone?: string;
  mailingAddress?: PostalAddress;
}

export interface InvoiceRecord {
  id: string;
  invoiceNumber: string;
  jobId: string;
  clientId: string;
  status: InvoiceStatus;
  lineItems: JobLineItem[];
  subtotal: number;
  clientSnapshot: InvoiceClientSnapshot;
  jobSnapshot: InvoiceJobSnapshot;
  businessSnapshot?: InvoiceBusinessSnapshot;
  pdfStoragePath?: string | null;
  issuedAt: Timestamp | null;
  paidAt: Timestamp | null;
  archivedAt: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface BusinessProfile extends InvoiceBusinessSnapshot {
  invoicePrefix: string;
  nextInvoiceSequence: number;
}

export interface HistoryEntry {
  id: string;
  kind: 'job' | 'invoice';
  title: string;
  subtitle: string;
  status: string;
  clientId: string;
  primaryDate: string;
  secondaryDate?: string;
  amount?: number;
  route: string;
  queryParams?: Record<string, string>;
  archived: boolean;
}
