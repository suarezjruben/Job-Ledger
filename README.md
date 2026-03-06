# Job Ledger

Angular + Firebase app for job tracking, invoices, and private job photo storage.

## Private Image Storage (R2)

Job photos are stored as private Cloudflare R2 objects with short-lived signed URLs.

- Originals are not stored.
- Client generates optimized variants before upload:
  - `thumb`: max width `480px`, quality `0.70`, limit `<= 200KB`
  - `display`: max width `1600px`, quality `0.78`, limit `<= 2MB`
- Image bytes never pass through backend servers.
- Firestore stores metadata only in `users/{uid}/jobs/{jobId}/images/{imageId}`.

## Required Credentials

### Cloudflare R2

1. Create bucket:
   - Cloudflare Dashboard -> `R2 Object Storage` -> `Create bucket`
   - Example: `job-ledger-images`
2. Create API token:
   - `R2` -> `Manage R2 API Tokens`
   - Permissions: `Object Read & Write`
3. Save these values:
   - `R2_ACCOUNT_ID`
   - `R2_ACCESS_KEY_ID`
   - `R2_SECRET_ACCESS_KEY`
   - `R2_BUCKET_NAME`

### Firebase Service Account

1. Firebase Console -> `Project settings` -> `Service accounts`
2. Generate a new private key JSON.
3. Save these values if you need explicit service-account auth in functions:
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_CLIENT_EMAIL`
   - `FIREBASE_PRIVATE_KEY`

## Local Setup

Install app dependencies:

```bash
npm install
```

Install functions dependencies:

```bash
npm install --prefix functions
```

Create `functions/.env` (do not commit). You can copy `functions/.env.example`:

```bash
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=...
# Optional (functions can use default runtime credentials in Firebase):
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

Run Angular locally:

```bash
npm start
```

Note: development config calls `https://us-central1-job-ledger-2026.cloudfunctions.net/api` by default.

## Deploy

Deploy both hosting and functions:

```bash
firebase deploy --only hosting,functions
```

## Image API Endpoints

All endpoints require Firebase ID token in `Authorization: Bearer <token>`.

- `POST /api/images/sign-upload`
- `POST /api/images/sign-download`
- `POST /api/images/delete`

## Firestore Index Notes

`firestore.indexes.json` must stay valid JSON, so it cannot contain inline comments.

- Use `indexes` for composite query shapes such as `status + startDate`.
- Use `fieldOverrides` for single-field index configuration.
- The image upload API uses a collection-group query on `images.ownerUid`, so that single-field collection-group index is defined under `fieldOverrides`.

Deploy Firestore index changes from the repo root with:

```bash
npx firebase-tools deploy --only firestore:indexes --project job-ledger-2026
```

Notes:
- This command deploys both composite indexes and `fieldOverrides` from `firestore.indexes.json`.
- New indexes can take a short time to finish initializing after deploy, so queries may keep returning `FAILED_PRECONDITION` until the index is ready.

## Development Scripts

```bash
npm start
npm run build
npm test
```
