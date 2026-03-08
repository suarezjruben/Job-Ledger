import { Injectable, inject } from '@angular/core';
import { Firestore, collection, collectionData, doc, docData, orderBy, query } from '@angular/fire/firestore';
import {
  CollectionReference,
  DocumentReference,
  WithFieldValue,
  serverTimestamp,
  setDoc,
  updateDoc
} from 'firebase/firestore';
import { Observable } from 'rxjs';
import { JobLineItem, JobRecord, JobStatus } from '../models';
import { stripUndefined } from '../utils/object.utils';
import { SessionService } from './session.service';

export interface JobUpsertInput {
  clientId: string;
  title: string;
  address?: JobRecord['address'];
  description?: string;
  notes?: string;
  status: JobStatus;
  startDate: string;
  endDate: string;
  lineItems: JobLineItem[];
}

@Injectable({ providedIn: 'root' })
export class JobsRepository {
  private readonly firestore = inject(Firestore);
  private readonly session = inject(SessionService);

  observeJobs(): Observable<JobRecord[]> {
    const reference = query(this.jobsCollection(this.session.requireUid()), orderBy('startDate'));
    return collectionData(reference, { idField: 'id' }) as Observable<JobRecord[]>;
  }

  observeJob(jobId: string): Observable<JobRecord | undefined> {
    return docData(this.jobRef(this.session.requireUid(), jobId), {
      idField: 'id'
    }) as Observable<JobRecord | undefined>;
  }

  async createJob(input: JobUpsertInput): Promise<string> {
    const uid = this.session.requireUid();
    const reference = doc(this.jobsCollection(uid));
    const now = serverTimestamp();

    await setDoc(
      reference,
      stripUndefined({
        ...input,
        invoiceId: null,
        attachmentCount: 0,
        archivedAt: null,
        createdAt: now,
        updatedAt: now
      }) as WithFieldValue<JobRecord>
    );

    return reference.id;
  }

  async updateJob(jobId: string, input: JobUpsertInput): Promise<void> {
    await updateDoc(
      this.jobRef(this.session.requireUid(), jobId),
      stripUndefined({
        ...input,
        updatedAt: serverTimestamp()
      }) as Partial<JobRecord>
    );
  }

  async archiveJob(jobId: string): Promise<void> {
    await updateDoc(this.jobRef(this.session.requireUid(), jobId), {
      archivedAt: serverTimestamp(),
      status: 'archived',
      updatedAt: serverTimestamp()
    });
  }

  async restoreJob(jobId: string): Promise<void> {
    await updateDoc(this.jobRef(this.session.requireUid(), jobId), {
      archivedAt: null,
      status: 'scheduled',
      updatedAt: serverTimestamp()
    });
  }

  async setJobInvoice(jobId: string, invoiceId: string, status: JobStatus = 'invoiced'): Promise<void> {
    await updateDoc(this.jobRef(this.session.requireUid(), jobId), {
      invoiceId,
      status,
      updatedAt: serverTimestamp()
    });
  }

  async clearJobInvoice(jobId: string, status: JobStatus = 'completed'): Promise<void> {
    await updateDoc(this.jobRef(this.session.requireUid(), jobId), {
      invoiceId: null,
      status,
      updatedAt: serverTimestamp()
    });
  }

  private jobsCollection(uid: string): CollectionReference<JobRecord> {
    return collection(this.firestore, `users/${uid}/jobs`) as CollectionReference<JobRecord>;
  }

  private jobRef(uid: string, jobId: string): DocumentReference<JobRecord> {
    return doc(this.firestore, `users/${uid}/jobs/${jobId}`) as DocumentReference<JobRecord>;
  }
}
