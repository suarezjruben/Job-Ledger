import { AppEnvironment } from './environment.model';

export const environment: AppEnvironment = {
  production: false,
  imageApiBaseUrl: 'https://us-central1-job-ledger-2026.cloudfunctions.net/api',
  firebase: {
    apiKey: "replace-with-firebase-web-api-key",
    authDomain: "job-ledger-2026.firebaseapp.com",
    projectId: "job-ledger-2026",
    storageBucket: "job-ledger-2026.firebasestorage.app",
    messagingSenderId: "117919508121",
    appId: "replace-with-firebase-web-app-id"
  }
};
