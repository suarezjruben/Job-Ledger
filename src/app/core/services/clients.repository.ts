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
import { ClientRecord } from '../models';
import { stripUndefined } from '../utils/object.utils';
import { SessionService } from './session.service';

export interface ClientUpsertInput {
  displayName: string;
  companyName?: string;
  billingEmail?: string;
  phone?: string;
  billingAddress?: ClientRecord['billingAddress'];
  serviceAddress?: ClientRecord['serviceAddress'];
  notes?: string;
}

@Injectable({ providedIn: 'root' })
export class ClientsRepository {
  private readonly firestore = inject(Firestore);
  private readonly session = inject(SessionService);

  observeClients(): Observable<ClientRecord[]> {
    const reference = query(this.clientsCollection(this.session.requireUid()), orderBy('displayName'));
    return collectionData(reference, { idField: 'id' }) as Observable<ClientRecord[]>;
  }

  observeClient(clientId: string): Observable<ClientRecord | undefined> {
    return docData(this.clientRef(this.session.requireUid(), clientId), {
      idField: 'id'
    }) as Observable<ClientRecord | undefined>;
  }

  async createClient(input: ClientUpsertInput): Promise<string> {
    const uid = this.session.requireUid();
    const reference = doc(this.clientsCollection(uid));
    const now = serverTimestamp();

    await setDoc(
      reference,
      stripUndefined({
        ...input,
        archivedAt: null,
        createdAt: now,
        updatedAt: now
      }) as WithFieldValue<ClientRecord>
    );

    return reference.id;
  }

  async updateClient(clientId: string, input: ClientUpsertInput): Promise<void> {
    await updateDoc(
      this.clientRef(this.session.requireUid(), clientId),
      stripUndefined({
        ...input,
        updatedAt: serverTimestamp()
      }) as Partial<ClientRecord>
    );
  }

  async archiveClient(clientId: string): Promise<void> {
    await updateDoc(this.clientRef(this.session.requireUid(), clientId), {
      archivedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  }

  async restoreClient(clientId: string): Promise<void> {
    await updateDoc(this.clientRef(this.session.requireUid(), clientId), {
      archivedAt: null,
      updatedAt: serverTimestamp()
    });
  }

  async deleteClient(clientId: string): Promise<void> {
    await deleteDoc(this.clientRef(this.session.requireUid(), clientId));
  }

  private clientsCollection(uid: string): CollectionReference<ClientRecord> {
    return collection(this.firestore, `users/${uid}/clients`) as CollectionReference<ClientRecord>;
  }

  private clientRef(uid: string, clientId: string): DocumentReference<ClientRecord> {
    return doc(this.firestore, `users/${uid}/clients/${clientId}`) as DocumentReference<ClientRecord>;
  }
}
