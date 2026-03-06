import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Auth, user } from '@angular/fire/auth';
import {
  User,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut
} from 'firebase/auth';
import { toSignal } from '@angular/core/rxjs-interop';

@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);

  readonly user$ = user(this.auth);
  readonly currentUser = toSignal<User | null | undefined>(this.user$, {
    initialValue: undefined
  });

  async signIn(email: string, password: string): Promise<User> {
    const credential = await signInWithEmailAndPassword(this.auth, email, password);
    return credential.user;
  }

  async signUp(email: string, password: string): Promise<User> {
    const credential = await createUserWithEmailAndPassword(this.auth, email, password);
    return credential.user;
  }

  async signOut(): Promise<void> {
    await signOut(this.auth);
    await this.router.navigateByUrl('/login');
  }

  hasActiveSession(): boolean {
    return Boolean(this.auth.currentUser);
  }

  requireUid(): string {
    const uid = this.auth.currentUser?.uid;

    if (!uid) {
      throw new Error('You must be signed in to access this resource.');
    }

    return uid;
  }

  currentEmail(): string {
    return this.auth.currentUser?.email ?? '';
  }
}
