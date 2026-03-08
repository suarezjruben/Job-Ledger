import { Injectable, inject } from '@angular/core';
import { Firestore, collection, collectionData, doc, docData, orderBy, query } from '@angular/fire/firestore';
import {
  CollectionReference,
  DocumentReference,
  WithFieldValue,
  deleteDoc,
  serverTimestamp,
  setDoc,
  updateDoc
} from 'firebase/firestore';
import { Observable } from 'rxjs';
import { ClientRecord, InvoiceBusinessSnapshot, InvoiceRecord, JobLineItem, JobRecord } from '../models';
import { sumLineItems } from '../utils/money.utils';
import { stripUndefined } from '../utils/object.utils';
import { SessionService } from './session.service';

@Injectable({ providedIn: 'root' })
export class InvoicesRepository {
  private readonly firestore = inject(Firestore);
  private readonly session = inject(SessionService);

  observeInvoices(): Observable<InvoiceRecord[]> {
    const reference = query(this.invoicesCollection(this.session.requireUid()), orderBy('createdAt', 'desc'));
    return collectionData(reference, { idField: 'id' }) as Observable<InvoiceRecord[]>;
  }

  observeInvoice(invoiceId: string): Observable<InvoiceRecord | undefined> {
    return docData(this.invoiceRef(this.session.requireUid(), invoiceId), {
      idField: 'id'
    }) as Observable<InvoiceRecord | undefined>;
  }

  async createDraftFromJob(job: JobRecord, client: ClientRecord, invoiceNumber: string): Promise<string> {
    const uid = this.session.requireUid();
    const reference = doc(this.invoicesCollection(uid));
    const lineItems = this.cloneLineItems(job.lineItems);

    await setDoc(
      reference,
      stripUndefined({
        invoiceNumber,
        jobId: job.id,
        clientId: client.id,
        status: 'draft',
        lineItems,
        subtotal: sumLineItems(lineItems),
        clientSnapshot: {
          displayName: client.displayName,
          companyName: client.companyName,
          billingEmail: client.billingEmail,
          phone: client.phone,
          billingAddress: client.billingAddress
        },
        jobSnapshot: {
          title: job.title,
          address: job.address,
          startDate: job.startDate,
          endDate: job.endDate,
          description: job.description
        },
        issuedAt: null,
        paidAt: null,
        archivedAt: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }) as WithFieldValue<InvoiceRecord>
    );

    return reference.id;
  }

  async createReplacementDraft(sourceInvoice: InvoiceRecord, invoiceNumber: string): Promise<string> {
    const uid = this.session.requireUid();
    const reference = doc(this.invoicesCollection(uid));
    const lineItems = this.cloneLineItems(sourceInvoice.lineItems);

    await setDoc(
      reference,
      stripUndefined({
        invoiceNumber,
        jobId: sourceInvoice.jobId,
        clientId: sourceInvoice.clientId,
        status: 'draft',
        lineItems,
        subtotal: sumLineItems(lineItems),
        clientSnapshot: sourceInvoice.clientSnapshot,
        jobSnapshot: sourceInvoice.jobSnapshot,
        issuedAt: null,
        paidAt: null,
        archivedAt: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }) as WithFieldValue<InvoiceRecord>
    );

    return reference.id;
  }

  async updateDraft(invoiceId: string, lineItems: JobLineItem[]): Promise<void> {
    await updateDoc(this.invoiceRef(this.session.requireUid(), invoiceId), {
      lineItems: this.cloneLineItems(lineItems),
      subtotal: sumLineItems(lineItems),
      updatedAt: serverTimestamp()
    });
  }

  async finalizeInvoice(invoiceId: string, businessSnapshot: InvoiceBusinessSnapshot): Promise<void> {
    await updateDoc(this.invoiceRef(this.session.requireUid(), invoiceId), {
      status: 'issued',
      issuedAt: serverTimestamp(),
      businessSnapshot,
      updatedAt: serverTimestamp()
    });
  }

  async markPaid(invoiceId: string): Promise<void> {
    await updateDoc(this.invoiceRef(this.session.requireUid(), invoiceId), {
      status: 'paid',
      paidAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  }

  async voidInvoice(invoiceId: string): Promise<void> {
    await updateDoc(this.invoiceRef(this.session.requireUid(), invoiceId), {
      status: 'void',
      updatedAt: serverTimestamp()
    });
  }

  async archiveInvoice(invoiceId: string): Promise<void> {
    await updateDoc(this.invoiceRef(this.session.requireUid(), invoiceId), {
      archivedAt: serverTimestamp(),
      status: 'archived',
      updatedAt: serverTimestamp()
    });
  }

  async restoreInvoice(invoiceId: string): Promise<void> {
    await updateDoc(this.invoiceRef(this.session.requireUid(), invoiceId), {
      archivedAt: null,
      status: 'issued',
      updatedAt: serverTimestamp()
    });
  }

  async deleteInvoice(invoiceId: string): Promise<void> {
    await deleteDoc(this.invoiceRef(this.session.requireUid(), invoiceId));
  }

  private cloneLineItems(lineItems: JobLineItem[]): JobLineItem[] {
    return lineItems.map((lineItem) => ({ ...lineItem }));
  }

  private invoicesCollection(uid: string): CollectionReference<InvoiceRecord> {
    return collection(this.firestore, `users/${uid}/invoices`) as CollectionReference<InvoiceRecord>;
  }

  private invoiceRef(uid: string, invoiceId: string): DocumentReference<InvoiceRecord> {
    return doc(this.firestore, `users/${uid}/invoices/${invoiceId}`) as DocumentReference<InvoiceRecord>;
  }
}
