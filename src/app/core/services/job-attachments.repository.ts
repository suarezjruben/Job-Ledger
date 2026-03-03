import { Injectable, inject } from '@angular/core';
import { Firestore, collection, collectionData, doc, orderBy, query } from '@angular/fire/firestore';
import {
  CollectionReference,
  DocumentReference,
  WithFieldValue,
  deleteDoc,
  getDoc,
  increment,
  serverTimestamp,
  setDoc,
  updateDoc
} from 'firebase/firestore';
import { Storage } from '@angular/fire/storage';
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { Observable } from 'rxjs';
import { JobAttachmentRecord, JobRecord } from '../models';
import { stripUndefined } from '../utils/object.utils';
import { SessionService } from './session.service';

const ALLOWED_ATTACHMENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/pdf'
]);

@Injectable({ providedIn: 'root' })
export class JobAttachmentsRepository {
  private readonly firestore = inject(Firestore);
  private readonly storage = inject(Storage);
  private readonly session = inject(SessionService);

  observeAttachments(jobId: string): Observable<JobAttachmentRecord[]> {
    const reference = query(this.attachmentsCollection(this.session.requireUid(), jobId), orderBy('createdAt'));
    return collectionData(reference, { idField: 'id' }) as Observable<JobAttachmentRecord[]>;
  }

  async uploadAttachment(jobId: string, file: File): Promise<void> {
    this.assertValidFile(file);

    const uid = this.session.requireUid();
    const jobReference = this.jobRef(uid, jobId);
    const jobSnapshot = await getDoc(jobReference);
    const job = jobSnapshot.data() as JobRecord | undefined;

    if (!job) {
      throw new Error('Save the job before adding attachments.');
    }

    if ((job.attachmentCount ?? 0) >= 10) {
      throw new Error('A job can store up to 10 attachments in v1.');
    }

    const attachmentReference = doc(this.attachmentsCollection(uid, jobId));
    const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-').toLowerCase();
    const storagePath = `users/${uid}/jobs/${jobId}/attachments/${attachmentReference.id}-${safeFileName}`;

    await uploadBytes(ref(this.storage, storagePath), file, {
      contentType: file.type
    });

    await setDoc(
      attachmentReference,
      stripUndefined({
        jobId,
        kind: file.type === 'application/pdf' ? 'document' : 'photo',
        fileName: file.name,
        contentType: file.type,
        sizeBytes: file.size,
        storagePath,
        createdAt: serverTimestamp()
      }) as WithFieldValue<JobAttachmentRecord>
    );

    await updateDoc(jobReference, {
      attachmentCount: increment(1),
      updatedAt: serverTimestamp()
    });
  }

  async deleteAttachment(attachment: JobAttachmentRecord): Promise<void> {
    const uid = this.session.requireUid();

    await deleteObject(ref(this.storage, attachment.storagePath));
    await deleteDoc(this.attachmentRef(uid, attachment.jobId, attachment.id));
    await updateDoc(this.jobRef(uid, attachment.jobId), {
      attachmentCount: increment(-1),
      updatedAt: serverTimestamp()
    });
  }

  async getAttachmentDownloadUrl(attachment: JobAttachmentRecord): Promise<string> {
    return getDownloadURL(ref(this.storage, attachment.storagePath));
  }

  private assertValidFile(file: File): void {
    if (!ALLOWED_ATTACHMENT_TYPES.has(file.type)) {
      throw new Error('Only JPG, PNG, WEBP, HEIC, and PDF uploads are supported.');
    }

    if (file.size > 15 * 1024 * 1024) {
      throw new Error('Each attachment must be 15 MB or smaller.');
    }
  }

  private attachmentsCollection(uid: string, jobId: string): CollectionReference<JobAttachmentRecord> {
    return collection(
      this.firestore,
      `users/${uid}/jobs/${jobId}/attachments`
    ) as CollectionReference<JobAttachmentRecord>;
  }

  private attachmentRef(uid: string, jobId: string, attachmentId: string): DocumentReference<JobAttachmentRecord> {
    return doc(
      this.firestore,
      `users/${uid}/jobs/${jobId}/attachments/${attachmentId}`
    ) as DocumentReference<JobAttachmentRecord>;
  }

  private jobRef(uid: string, jobId: string): DocumentReference<JobRecord> {
    return doc(this.firestore, `users/${uid}/jobs/${jobId}`) as DocumentReference<JobRecord>;
  }
}
