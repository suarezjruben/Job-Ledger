import { Injectable, inject } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import { Firestore, collection, collectionData, doc, orderBy, query } from '@angular/fire/firestore';
import {
  CollectionReference,
  DocumentReference,
  WithFieldValue,
  getDoc,
  increment,
  serverTimestamp,
  setDoc,
  updateDoc
} from 'firebase/firestore';
import imageCompression from 'browser-image-compression';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { JobImageRecord, JobImageVariant, JobRecord } from '../models';
import { stripUndefined } from '../utils/object.utils';
import { SessionService } from './session.service';

const MAX_SOURCE_BYTES = 15 * 1024 * 1024;
const MAX_THUMB_BYTES = 200 * 1024;
const MAX_DISPLAY_BYTES = 2 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/webp']);

type UploadVariant = 'thumb' | 'display';

interface PreparedVariant {
  blob: Blob;
  contentType: 'image/webp' | 'image/jpeg';
  bytes: number;
  width: number;
  height: number;
}

interface SignUploadResponse {
  uploadUrl: string;
  objectKey: string;
}

interface SignDownloadResponse {
  downloadUrl: string;
}

@Injectable({ providedIn: 'root' })
export class JobImagesRepository {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(Auth);
  private readonly session = inject(SessionService);

  observeImages(jobId: string): Observable<JobImageRecord[]> {
    const reference = query(this.imagesCollection(this.session.requireUid(), jobId), orderBy('createdAt', 'desc'));
    return collectionData(reference, { idField: 'id' }) as Observable<JobImageRecord[]>;
  }

  async uploadImage(jobId: string, sourceFile: File): Promise<void> {
    this.assertValidSourceFile(sourceFile);

    const uid = this.session.requireUid();
    const jobReference = this.jobRef(uid, jobId);
    const jobSnapshot = await getDoc(jobReference);
    const job = jobSnapshot.data() as JobRecord | undefined;

    if (!job) {
      throw new Error('Save the job before adding photos.');
    }

    const imageId = crypto.randomUUID();

    const [thumb, display] = await Promise.all([
      this.prepareVariant(sourceFile, {
        maxWidth: 480,
        quality: 0.7,
        maxBytes: MAX_THUMB_BYTES,
        variant: 'thumb'
      }),
      this.prepareVariant(sourceFile, {
        maxWidth: 1600,
        quality: 0.78,
        maxBytes: MAX_DISPLAY_BYTES,
        variant: 'display'
      })
    ]);

    const [thumbKey, displayKey] = await Promise.all([
      this.uploadVariant(jobId, imageId, 'thumb', thumb),
      this.uploadVariant(jobId, imageId, 'display', display)
    ]);

    const imageReference = this.imageRef(uid, jobId, imageId);

    await setDoc(
      imageReference,
      stripUndefined({
        ownerUid: uid,
        displayKey,
        thumbKey,
        displayContentType: display.contentType,
        thumbContentType: thumb.contentType,
        displayBytes: display.bytes,
        thumbBytes: thumb.bytes,
        totalBytes: display.bytes + thumb.bytes,
        width: display.width,
        height: display.height,
        createdAt: serverTimestamp()
      }) as WithFieldValue<JobImageRecord>
    );

    await updateDoc(jobReference, {
      attachmentCount: increment(1),
      updatedAt: serverTimestamp()
    });
  }

  async getImageDownloadUrl(jobId: string, imageId: string, variant: JobImageVariant): Promise<string> {
    const response = await this.postToImageApi<SignDownloadResponse>('/images/sign-download', {
      jobId,
      imageId,
      variant
    });

    return response.downloadUrl;
  }

  async deleteImage(jobId: string, imageId: string): Promise<void> {
    await this.postToImageApi('/images/delete', {
      jobId,
      imageId
    });
  }

  private async uploadVariant(
    jobId: string,
    imageId: string,
    variant: UploadVariant,
    preparedVariant: PreparedVariant
  ): Promise<string> {
    const signUploadResponse = await this.postToImageApi<SignUploadResponse>('/images/sign-upload', {
      jobId,
      imageId,
      variant,
      contentType: preparedVariant.contentType,
      bytes: preparedVariant.bytes
    });

    const uploadResponse = await fetch(signUploadResponse.uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': preparedVariant.contentType
      },
      body: preparedVariant.blob
    });

    if (!uploadResponse.ok) {
      throw new Error(`Unable to upload the ${variant} image variant to secure storage.`);
    }

    return signUploadResponse.objectKey;
  }

  private async postToImageApi<TResponse = unknown>(path: string, payload: unknown): Promise<TResponse> {
    const currentUser = this.auth.currentUser;

    if (!currentUser) {
      throw new Error('You must be signed in to manage job images.');
    }

    const idToken = await currentUser.getIdToken();
    const apiBase = environment.imageApiBaseUrl.replace(/\/$/, '');
    const response = await fetch(`${apiBase}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const responseBody = (await response.json().catch(() => ({}))) as { error?: string } & TResponse;

    if (!response.ok) {
      throw new Error(responseBody.error || 'Image API request failed.');
    }

    return responseBody;
  }

  private async prepareVariant(
    sourceFile: File,
    options: { maxWidth: number; quality: number; maxBytes: number; variant: UploadVariant }
  ): Promise<PreparedVariant> {
    try {
      const preferred = await this.compressImage(sourceFile, {
        maxWidth: options.maxWidth,
        quality: options.quality,
        maxBytes: options.maxBytes,
        fileType: 'image/webp',
        variant: options.variant
      });

      if (preferred.contentType === 'image/webp') {
        return preferred;
      }
    } catch {
      // Fallback to JPEG if WEBP conversion fails in this browser/runtime.
    }

    return this.compressImage(sourceFile, {
      maxWidth: options.maxWidth,
      quality: options.quality,
      maxBytes: options.maxBytes,
      fileType: 'image/jpeg',
      variant: options.variant
    });
  }

  private async compressImage(
    sourceFile: File,
    options: {
      maxWidth: number;
      quality: number;
      maxBytes: number;
      fileType: 'image/webp' | 'image/jpeg';
      variant: UploadVariant;
    }
  ): Promise<PreparedVariant> {
    const compressed = await imageCompression(sourceFile, {
      maxSizeMB: options.maxBytes / (1024 * 1024),
      maxWidthOrHeight: options.maxWidth,
      useWebWorker: true,
      initialQuality: options.quality,
      fileType: options.fileType,
      preserveExif: false
    });

    if (!ALLOWED_IMAGE_TYPES.has(compressed.type)) {
      throw new Error('Compressed output must be WEBP or JPEG.');
    }
    const contentType = compressed.type as 'image/webp' | 'image/jpeg';

    if (compressed.size <= 0) {
      throw new Error('Compressed image output is empty.');
    }

    if (compressed.size > options.maxBytes) {
      const sizeLabel = options.variant === 'thumb' ? '200 KB' : '2 MB';
      throw new Error(`${options.variant} output exceeds ${sizeLabel}.`);
    }

    const dimensions = await this.readImageDimensions(compressed);

    return {
      blob: compressed,
      contentType,
      bytes: compressed.size,
      width: dimensions.width,
      height: dimensions.height
    };
  }

  private readImageDimensions(blob: Blob): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(blob);
      const image = new Image();

      image.onload = () => {
        URL.revokeObjectURL(objectUrl);
        resolve({ width: image.naturalWidth, height: image.naturalHeight });
      };

      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Unable to read compressed image dimensions.'));
      };

      image.src = objectUrl;
    });
  }

  private assertValidSourceFile(file: File): void {
    if (!file.type.startsWith('image/')) {
      throw new Error('Only image files are supported for job photos.');
    }

    if (file.size > MAX_SOURCE_BYTES) {
      throw new Error('Each source photo must be 15 MB or smaller before compression.');
    }
  }

  private imagesCollection(uid: string, jobId: string): CollectionReference<JobImageRecord> {
    return collection(this.firestore, `users/${uid}/jobs/${jobId}/images`) as CollectionReference<JobImageRecord>;
  }

  private imageRef(uid: string, jobId: string, imageId: string): DocumentReference<JobImageRecord> {
    return doc(this.firestore, `users/${uid}/jobs/${jobId}/images/${imageId}`) as DocumentReference<JobImageRecord>;
  }

  private jobRef(uid: string, jobId: string): DocumentReference<JobRecord> {
    return doc(this.firestore, `users/${uid}/jobs/${jobId}`) as DocumentReference<JobRecord>;
  }
}
