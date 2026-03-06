import { AppEnvironment } from './environment.model';

export const environment: AppEnvironment = {
  production: true,
  imageApiBaseUrl: '/api',
  firebase: {
    apiKey: "replace-with-firebase-web-api-key",
    authDomain: "job-ledger-2026.firebaseapp.com",
    projectId: "job-ledger-2026",
    storageBucket: "job-ledger-2026.firebasestorage.app",
    messagingSenderId: "117919508121",
    appId: "replace-with-firebase-web-app-id"
  }
};
