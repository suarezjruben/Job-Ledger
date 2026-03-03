import { inject } from '@angular/core';
import { CanActivateChildFn, CanActivateFn, Router } from '@angular/router';
import { map, take } from 'rxjs/operators';
import { SessionService } from '../services/session.service';

function authCheck() {
  const session = inject(SessionService);
  const router = inject(Router);

  return session.user$.pipe(
    take(1),
    map((currentUser) => (currentUser ? true : router.createUrlTree(['/login'])))
  );
}

export const authGuard: CanActivateFn = () => authCheck();
export const authChildGuard: CanActivateChildFn = () => authCheck();
