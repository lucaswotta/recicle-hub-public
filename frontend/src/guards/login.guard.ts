import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const loginGuard: CanActivateFn = () => {
  const authService: AuthService = inject(AuthService);
  // FIX: Explicitly type `Router` to resolve type inference issues with `inject`.
  const router: Router = inject(Router);

  if (!authService.isLoggedIn()) {
    return true;
  }

  // Redirect to the home page if already logged in
  return router.parseUrl('/inicio');
};
