import { Injectable, inject } from '@angular/core';
import { Firestore, doc, docData } from '@angular/fire/firestore';
import {
  DocumentReference,
  WithFieldValue,
  getDoc,
  runTransaction,
  setDoc
} from 'firebase/firestore';
import { Observable, map } from 'rxjs';
import { BusinessProfile } from '../models';
import { stripUndefined, valueOrUndefined } from '../utils/object.utils';
import { buildInvoiceNumber } from '../utils/money.utils';
import { SessionService } from './session.service';

@Injectable({ providedIn: 'root' })
export class BusinessProfileRepository {
  private readonly firestore = inject(Firestore);
  private readonly session = inject(SessionService);

  observeProfile(): Observable<BusinessProfile | null> {
    const reference = this.profileRef(this.session.requireUid());
    return (docData(reference) as Observable<BusinessProfile | undefined>).pipe(
      map((profile) => profile ?? null)
    );
  }

  async getProfile(uid = this.session.requireUid()): Promise<BusinessProfile | null> {
    const snapshot = await getDoc(this.profileRef(uid));
    return (snapshot.data() as BusinessProfile | undefined) ?? null;
  }

  async ensureDefaultProfileForUid(uid: string, email: string): Promise<void> {
    const reference = this.profileRef(uid);
    const snapshot = await getDoc(reference);

    if (snapshot.exists()) {
      return;
    }

    await setDoc(
      reference,
      stripUndefined({
        businessName:
          valueOrUndefined(email.split('@')[0]?.replace(/[._-]+/g, ' ')) ?? 'JobLedger Contractor',
        contactEmail: email,
        invoicePrefix: 'INV',
        nextInvoiceSequence: 1
      }) as WithFieldValue<BusinessProfile>
    );
  }

  async saveProfile(profile: BusinessProfile): Promise<void> {
    const reference = this.profileRef(this.session.requireUid());
    await setDoc(
      reference,
      stripUndefined({
        businessName: profile.businessName.trim(),
        contactEmail: profile.contactEmail.trim(),
        phone: valueOrUndefined(profile.phone),
        mailingAddress: profile.mailingAddress,
        invoicePrefix: profile.invoicePrefix.trim().toUpperCase() || 'INV',
        nextInvoiceSequence: Math.max(1, Number(profile.nextInvoiceSequence) || 1)
      }) as WithFieldValue<BusinessProfile>,
      { merge: true }
    );
  }

  async reserveInvoiceNumber(): Promise<string> {
    const uid = this.session.requireUid();
    const reference = this.profileRef(uid);
    const fallbackEmail = this.session.currentEmail();

    return runTransaction(this.firestore, async (transaction) => {
      const snapshot = await transaction.get(reference);
      const current = (snapshot.data() as BusinessProfile | undefined) ?? {
        businessName: fallbackEmail.split('@')[0] || 'JobLedger Contractor',
        contactEmail: fallbackEmail,
        invoicePrefix: 'INV',
        nextInvoiceSequence: 1
      };

      const nextSequence = Math.max(1, current.nextInvoiceSequence || 1);
      const invoiceNumber = buildInvoiceNumber(current.invoicePrefix || 'INV', nextSequence);

      transaction.set(
        reference,
        stripUndefined({
          ...current,
          businessName: current.businessName || 'JobLedger Contractor',
          contactEmail: current.contactEmail || fallbackEmail,
          invoicePrefix: (current.invoicePrefix || 'INV').toUpperCase(),
          nextInvoiceSequence: nextSequence + 1
        }) as WithFieldValue<BusinessProfile>,
        { merge: true }
      );

      return invoiceNumber;
    });
  }

  private profileRef(uid: string): DocumentReference<BusinessProfile> {
    return doc(this.firestore, `users/${uid}/profile/business`) as DocumentReference<BusinessProfile>;
  }
}
