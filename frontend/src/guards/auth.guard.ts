import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { map, catchError, of, Observable } from 'rxjs';

export const authGuard: CanActivateFn = (): boolean | UrlTree | Observable<boolean | UrlTree> => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // 1. Cenário Ideal: Usuário já está logado na memória (navegação normal)
  if (authService.isLoggedIn()) {
    return true;
  }

  // 2. Cenário F5/Reload: Memória limpa, mas pode ter Cookie HttpOnly
  // Tenta renovar o token antes de decidir bloquear a rota.
  return authService.refreshToken().pipe(
    // Sucesso: O backend aceitou o cookie e devolveu um token novo.
    // O authService atualizou os signals internamente no 'tap'.
    map(() => true),

    // Erro: Não havia cookie, ou ele estava expirado/inválido.
    catchError(() => {
      // Agora sim, redireciona para o login
      return of(router.createUrlTree(['/login']));
    })
  );
};