import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
  Signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { AuthService } from '../../services/auth.service';
import { User } from '../../models/user.model';

// #region External Libraries Declarations
declare var lucide: any;
// #endregion

@Component({
  selector: 'app-sidebar',
  templateUrl: './sidebar.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, CommonModule]
})
export class SidebarComponent implements AfterViewInit {
  // #region Injections
  private authService = inject(AuthService);
  // #endregion

  // #region State Signals
  currentUser: Signal<User | null> = this.authService.currentUser;
  isLogoutModalOpen = signal(false);
  // #endregion

  // #region Menu Configuration
  menuItems = signal([
    { path: '/inicio', icon: 'home', label: 'Início' },
    { path: '/clientes', icon: 'users', label: 'Clientes' },
    { path: '/relatorios', icon: 'bar-chart-3', label: 'Relatórios' },
    { path: '/configuracoes', icon: 'settings', label: 'Configurações' },
  ]);
  // #endregion

  constructor() {
    // Efeito para recriar ícones quando o usuário muda (login/logout)
    effect(() => {
      this.currentUser(); // Dependência para disparar o efeito
      setTimeout(() => {
        if (typeof lucide !== 'undefined') {
          lucide.createIcons();
        }
      }, 0);
    });
  }

  // #region Lifecycle Hooks
  ngAfterViewInit() {
    // Inicializa ícones após a view ser carregada
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }
  // #endregion

  // #region UI Interaction Methods
  /**
   * Abre o modal de confirmação de logout.
   */
  openLogoutModal(): void {
    this.isLogoutModalOpen.set(true);
    // Garante que os ícones do modal sejam renderizados
    setTimeout(() => {
      if (typeof lucide !== 'undefined') {
        lucide.createIcons();
      }
    }, 0);
  }

  /**
   * Fecha o modal de confirmação de logout.
   */
  closeLogoutModal(): void {
    this.isLogoutModalOpen.set(false);
  }

  /**
   * Executa o logout do usuário.
   */
  logout(): void {
    this.authService.logout();
  }
  // #endregion
}
