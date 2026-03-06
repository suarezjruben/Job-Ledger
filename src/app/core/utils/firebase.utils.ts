import { FirebaseOptions } from 'firebase/app';

const PLACEHOLDER_KEYS = new Set([
  'demo-api-key',
  'jobledger-demo',
  'jobledger-demo.firebaseapp.com',
  'jobledger-demo.firebasestorage.app'
]);

export function hasConfiguredFirebase(options: FirebaseOptions): boolean {
  const values = [options.apiKey, options.projectId, options.authDomain, options.storageBucket, options.appId];
  return values.every(
    (value) =>
      typeof value === 'string' &&
      value.length > 0 &&
      !PLACEHOLDER_KEYS.has(value) &&
      !value.startsWith('replace-with-')
  );
}
