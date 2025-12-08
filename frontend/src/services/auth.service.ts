import { Injectable, signal, computed, inject } from '@angular/core';
import { User } from '../models/user.model';
import { Router } from '@angular/router';
import { ApiService } from './api.service';
import { firstValueFrom, Observable, tap, map } from 'rxjs';

interface LoginResponse extends User {
  accessToken: string;
}

interface RefreshResponse {
  accessToken: string;
  user: User;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private api: ApiService = inject(ApiService);
  private router: Router = inject(Router);

  // Signals para estado reativo
  private readonly _currentUser = signal<User | null>(null);
  private readonly _accessToken = signal<string | null>(null);

  // Sinais expostos publicamente (apenas leitura)
  readonly currentUser = this._currentUser.asReadonly();
  readonly accessToken = this._accessToken.asReadonly();
  readonly isLoggedIn = computed(() => !!this._currentUser());

  /**
   * Realiza o login do usuário chamando o endpoint de autenticação.
   * @param username Nome de usuário ou email.
   * @param password Senha do usuário.
   */
  async login(username: string, password?: string): Promise<void> {
    try {
      const response = await firstValueFrom(
        this.api.post<LoginResponse>('/api/settings/login', { username, password })
      );

      if (response) {
        this._currentUser.set({ id: response.id, name: response.name, role: response.role });
        this._accessToken.set(response.accessToken);
        this.api.setCurrentUser({ id: response.id, name: response.name });
        this.router.navigate(['/inicio']);
        return;
      }

      this.clearSession();
      throw new Error('Login failed');
    } catch (error) {
      console.error('Falha no login', error);
      this.clearSession();
      throw error;
    }
  }

  /**
   * Renova o token de acesso usando o cookie HTTP-only (Refresh Token).
   */
  refreshToken(): Observable<string> {
    return this.api.post<RefreshResponse>('/api/auth/refresh', {}).pipe(
      tap((response) => {
        this._currentUser.set(response.user);
        this._accessToken.set(response.accessToken);
        this.api.setCurrentUser({ id: response.user.id, name: response.user.name });
      }),
      map(response => response.accessToken)
    );
  }

  /**
   * Realiza o logout do usuário atual.
   */
  async logout(): Promise<void> {
    try {
      await firstValueFrom(this.api.post('/api/auth/logout', {}));
    } catch (err) {
      console.error('Erro no logout', err);
    } finally {
      this.clearSession();
      this.router.navigate(['/login']);
    }
  }

  /**
   * Limpa os dados da sessão local.
   */
  private clearSession(): void {
    this._currentUser.set(null);
    this._accessToken.set(null);
    this.api.setCurrentUser(null);
  }
}