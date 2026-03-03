import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map, take } from 'rxjs/operators';
import { SessionService } from '../services/session.service';

export const loginGuard: CanActivateFn = () => {
  const session = inject(SessionService);
  const router = inject(Router);

  return session.user$.pipe(
    take(1),
    map((currentUser) => (currentUser ? router.createUrlTree(['/calendar']) : true))
  );
};
