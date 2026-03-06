'use strict';

const admin = require('firebase-admin');
const { onRequest } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const { FieldValue, getFirestore } = require('firebase-admin/firestore');
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectsCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const LIMITS = {
  maxImagesPerJob: 10,
  maxImagesPerUser: 100,
  maxStoragePerUserBytes: 100 * 1024 * 1024,
  maxUploadSizeBytes: 15 * 1024 * 1024,
  maxVariantBytes: {
    thumb: 200 * 1024,
    display: 2 * 1024 * 1024
  }
};

const URL_EXPIRATION_SECONDS = 300;
const ALLOWED_VARIANTS = new Set(['thumb', 'display']);
const ALLOWED_MIME_TYPES = new Set(['image/webp', 'image/jpeg']);

initializeFirebaseAdmin();

const firestore = getFirestore();
const auth = admin.auth();

exports.api = onRequest(
  {
    region: 'us-central1',
    timeoutSeconds: 60,
    memory: '256MiB'
  },
  async (req, res) => {
    setCorsHeaders(req, res);

    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    try {
      const normalizedPath = normalizePath(req.path);

      if (req.method !== 'POST') {
        throw new HttpError(405, 'Only POST is allowed for this endpoint.');
      }

      if (normalizedPath === '/images/sign-upload') {
        const payload = parseJsonBody(req);
        const response = await handleSignUpload(req, payload);
        res.status(200).json(response);
        return;
      }

      if (normalizedPath === '/images/sign-download') {
        const payload = parseJsonBody(req);
        const response = await handleSignDownload(req, payload);
        res.status(200).json(response);
        return;
      }

      if (normalizedPath === '/images/delete') {
        const payload = parseJsonBody(req);
        const response = await handleDeleteImage(req, payload);
        res.status(200).json(response);
        return;
      }

      throw new HttpError(404, 'Endpoint not found.');
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      const message =
        error instanceof HttpError
          ? error.message
          : 'Unexpected server error while processing image request.';

      if (!(error instanceof HttpError)) {
        logger.error('Unexpected image API error', error);
      }

      res.status(status).json({ error: message });
    }
  }
);

async function handleSignUpload(req, payload) {
  const uid = await requireUid(req);
  const jobId = requireId(payload.jobId, 'jobId');
  const imageId = requireId(payload.imageId, 'imageId');
  const variant = requireVariant(payload.variant);
  const contentType = requireContentType(payload.contentType);
  const bytes = requireBytes(payload.bytes, variant);

  await requireJobOwnership(uid, jobId);

  const imageRef = imageDocRef(uid, jobId, imageId);
  const imageSnapshot = await imageRef.get();
  const isNewImage = !imageSnapshot.exists;

  const userUsage = await getUserImageUsage(uid);
  const existingVariantBytes = imageSnapshot.exists
    ? Number(imageSnapshot.get(`${variant}Bytes`) || 0)
    : 0;

  if (isNewImage) {
    if (userUsage.imageCount >= LIMITS.maxImagesPerUser) {
      throw new HttpError(400, 'You can store up to 100 images total on the free tier.');
    }

    const jobImageCount = await getJobImageCount(uid, jobId);

    if (jobImageCount >= LIMITS.maxImagesPerJob) {
      throw new HttpError(400, 'A job can store up to 10 images on the free tier.');
    }
  }

  const projectedStorage = userUsage.totalBytes - existingVariantBytes + bytes;

  if (projectedStorage > LIMITS.maxStoragePerUserBytes) {
    throw new HttpError(400, 'Storage quota exceeded (max 0.1 GB per user on the free tier).');
  }

  const objectKey = buildObjectKey({ uid, jobId, imageId, variant, contentType });
  const uploadUrl = await createSignedUploadUrl(objectKey, contentType);

  return {
    uploadUrl,
    objectKey,
    expiresInSeconds: URL_EXPIRATION_SECONDS
  };
}

async function handleSignDownload(req, payload) {
  const uid = await requireUid(req);
  const jobId = requireId(payload.jobId, 'jobId');
  const imageId = requireId(payload.imageId, 'imageId');
  const variant = requireVariant(payload.variant);

  await requireJobOwnership(uid, jobId);

  const imageSnapshot = await imageDocRef(uid, jobId, imageId).get();

  if (!imageSnapshot.exists) {
    throw new HttpError(404, 'Image metadata was not found.');
  }

  const ownerUid = String(imageSnapshot.get('ownerUid') || '');

  if (ownerUid !== uid) {
    throw new HttpError(403, 'You are not allowed to access this image.');
  }

  const keyField = variant === 'thumb' ? 'thumbKey' : 'displayKey';
  const objectKey = String(imageSnapshot.get(keyField) || '');

  if (!objectKey) {
    throw new HttpError(409, `Image ${variant} variant is not available.`);
  }

  const downloadUrl = await createSignedDownloadUrl(objectKey);

  return {
    downloadUrl,
    expiresInSeconds: URL_EXPIRATION_SECONDS
  };
}

async function handleDeleteImage(req, payload) {
  const uid = await requireUid(req);
  const jobId = requireId(payload.jobId, 'jobId');
  const imageId = requireId(payload.imageId, 'imageId');

  const jobRef = await requireJobOwnership(uid, jobId);
  const imageRef = imageDocRef(uid, jobId, imageId);
  const imageSnapshot = await imageRef.get();

  if (!imageSnapshot.exists) {
    throw new HttpError(404, 'Image metadata was not found.');
  }

  const ownerUid = String(imageSnapshot.get('ownerUid') || '');

  if (ownerUid !== uid) {
    throw new HttpError(403, 'You are not allowed to delete this image.');
  }

  const deleteKeys = [String(imageSnapshot.get('thumbKey') || ''), String(imageSnapshot.get('displayKey') || '')]
    .filter(Boolean)
    .map((key) => ({ Key: key }));

  if (deleteKeys.length > 0) {
    const r2 = createR2Client();
    const { bucketName } = getR2Configuration();

    await r2.send(
      new DeleteObjectsCommand({
        Bucket: bucketName,
        Delete: {
          Objects: deleteKeys,
          Quiet: true
        }
      })
    );
  }

  await firestore.runTransaction(async (transaction) => {
    const [jobSnapshot, currentImageSnapshot] = await Promise.all([
      transaction.get(jobRef),
      transaction.get(imageRef)
    ]);

    if (!jobSnapshot.exists || !currentImageSnapshot.exists) {
      return;
    }

    transaction.delete(imageRef);
    const currentAttachmentCount = Number(jobSnapshot.get('attachmentCount') || 0);
    transaction.update(jobRef, {
      attachmentCount: Math.max(0, currentAttachmentCount - 1),
      updatedAt: FieldValue.serverTimestamp()
    });
  });

  return { deleted: true };
}

async function requireUid(req) {
  const authorization = req.get('authorization') || '';

  if (!authorization.startsWith('Bearer ')) {
    throw new HttpError(401, 'Missing Firebase Authorization header.');
  }

  const token = authorization.slice('Bearer '.length).trim();

  if (!token) {
    throw new HttpError(401, 'Missing Firebase ID token.');
  }

  try {
    const decoded = await auth.verifyIdToken(token);
    return decoded.uid;
  } catch {
    throw new HttpError(401, 'Invalid or expired Firebase ID token.');
  }
}

async function requireJobOwnership(uid, jobId) {
  const jobRef = firestore.doc(`users/${uid}/jobs/${jobId}`);
  const jobSnapshot = await jobRef.get();

  if (!jobSnapshot.exists) {
    throw new HttpError(404, 'Job not found or does not belong to the authenticated user.');
  }

  return jobRef;
}

function imageDocRef(uid, jobId, imageId) {
  return firestore.doc(`users/${uid}/jobs/${jobId}/images/${imageId}`);
}

async function getJobImageCount(uid, jobId) {
  const snapshot = await firestore.collection(`users/${uid}/jobs/${jobId}/images`).select().get();
  return snapshot.size;
}

async function getUserImageUsage(uid) {
  const snapshot = await firestore.collectionGroup('images').where('ownerUid', '==', uid).get();

  let totalBytes = 0;

  snapshot.forEach((doc) => {
    const value = Number(doc.get('totalBytes') || 0);

    if (Number.isFinite(value) && value > 0) {
      totalBytes += value;
    }
  });

  return {
    imageCount: snapshot.size,
    totalBytes
  };
}

async function createSignedUploadUrl(objectKey, contentType) {
  const r2 = createR2Client();
  const { bucketName } = getR2Configuration();

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: objectKey,
    ContentType: contentType
  });

  return getSignedUrl(r2, command, { expiresIn: URL_EXPIRATION_SECONDS });
}

async function createSignedDownloadUrl(objectKey) {
  const r2 = createR2Client();
  const { bucketName } = getR2Configuration();

  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: objectKey
  });

  return getSignedUrl(r2, command, { expiresIn: URL_EXPIRATION_SECONDS });
}

function buildObjectKey({ uid, jobId, imageId, variant, contentType }) {
  const extension = contentType === 'image/webp' ? 'webp' : 'jpg';
  return `users/${uid}/jobs/${jobId}/${variant}/${imageId}.${extension}`;
}

function createR2Client() {
  const { accountId, accessKeyId, secretAccessKey } = getR2Configuration();

  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey
    }
  });
}

function getR2Configuration() {
  const accountId = process.env.R2_ACCOUNT_ID || '';
  const accessKeyId = process.env.R2_ACCESS_KEY_ID || '';
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || '';
  const bucketName = process.env.R2_BUCKET_NAME || '';

  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
    throw new HttpError(
      500,
      'R2 credentials are missing. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET_NAME.'
    );
  }

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucketName
  };
}

function initializeFirebaseAdmin() {
  if (admin.apps.length > 0) {
    return;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (projectId && clientEmail && privateKey) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey: privateKey.replace(/\\n/g, '\n')
      })
    });
    return;
  }

  admin.initializeApp();
}

function normalizePath(rawPath) {
  const path = String(rawPath || '/');
  const normalizedPath = path.endsWith('/') && path.length > 1 ? path.slice(0, -1) : path;

  if (normalizedPath === '/api') {
    return '/';
  }

  if (normalizedPath.startsWith('/api/')) {
    return normalizedPath.slice(4);
  }

  return normalizedPath;
}

function parseJsonBody(req) {
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      throw new HttpError(400, 'Request body must be valid JSON.');
    }
  }

  if (!req.body || typeof req.body !== 'object') {
    throw new HttpError(400, 'Request body must be valid JSON.');
  }

  return req.body;
}

function requireId(value, fieldName) {
  if (typeof value !== 'string') {
    throw new HttpError(400, `${fieldName} is required.`);
  }

  const normalized = value.trim();

  if (!/^[a-zA-Z0-9_-]{3,128}$/.test(normalized)) {
    throw new HttpError(400, `${fieldName} must be 3-128 characters using letters, numbers, hyphen, or underscore.`);
  }

  return normalized;
}

function requireVariant(value) {
  if (typeof value !== 'string' || !ALLOWED_VARIANTS.has(value)) {
    throw new HttpError(400, 'variant must be "thumb" or "display".');
  }

  return value;
}

function requireContentType(value) {
  if (typeof value !== 'string' || !ALLOWED_MIME_TYPES.has(value)) {
    throw new HttpError(400, 'contentType must be image/webp or image/jpeg.');
  }

  return value;
}

function requireBytes(value, variant) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new HttpError(400, 'bytes must be a positive integer.');
  }

  if (value > LIMITS.maxUploadSizeBytes) {
    throw new HttpError(400, 'Compressed image upload exceeds 15 MB request limit.');
  }

  const variantLimit = LIMITS.maxVariantBytes[variant];

  if (value > variantLimit) {
    const label = variant === 'thumb' ? '200 KB' : '2 MB';
    throw new HttpError(400, `${variant} upload exceeds ${label}.`);
  }

  return value;
}

function setCorsHeaders(req, res) {
  const origin = req.get('origin') || '*';

  res.set('Access-Control-Allow-Origin', origin);
  res.set('Vary', 'Origin');
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
