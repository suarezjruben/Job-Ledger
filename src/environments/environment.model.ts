import { FirebaseOptions } from 'firebase/app';

export interface AppEnvironment {
  production: boolean;
  firebase: FirebaseOptions;
}
