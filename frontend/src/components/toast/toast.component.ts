import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';

import { ToastService, ToastType } from '../../services/toast.service';

// #region External Libraries Declarations
declare var lucide: any;
// #endregion

@Component({
  selector: 'app-toast',
  templateUrl: './toast.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule]
})
export class ToastComponent {
  // #region Injections
  toastService = inject(ToastService);
  // #endregion

  // #region State Signals
  toast = this.toastService.toast;
  // #endregion

  constructor() {
    // Efeito para recriar ícones quando um novo toast é exibido
    effect(() => {
      if (this.toast()) {
        setTimeout(() => lucide.createIcons(), 0);
      }
    });
  }

  // #region Helpers
  /**
   * Retorna o nome do ícone baseado no tipo de toast.
   */
  getIcon(type: ToastType): string {
    switch (type) {
      case 'success':
        return 'check-circle';
      case 'error':
        return 'alert-circle';
      default:
        return 'info';
    }
  }

  /**
   * Retorna as classes CSS baseadas no tipo de toast.
   */
  getClasses(type: ToastType): string {
    switch (type) {
      case 'success':
        return 'bg-emerald-500 border-emerald-600';
      case 'error':
        return 'bg-red-500 border-red-600';
      default:
        return 'bg-sky-500 border-sky-600';
    }
  }
  // #endregion
}
