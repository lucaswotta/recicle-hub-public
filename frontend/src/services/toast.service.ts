import { Injectable, signal } from '@angular/core';

export type ToastType = 'success' | 'error' | 'info';

export interface Toast {
  message: string;
  type: ToastType;
}

@Injectable({
  providedIn: 'root'
})
export class ToastService {
  toast = signal<Toast | null>(null);
  private timer: any;

  /**
   * Exibe uma notificação toast.
   * @param message Mensagem a ser exibida.
   * @param type Tipo da notificação ('success', 'error', 'info').
   * @param duration Duração em milissegundos. Se 0, a notificação persiste até ser fechada manualmente.
   */
  show(message: string, type: ToastType = 'info', duration: number = 3000) {
    this.toast.set({ message, type });

    if (this.timer) {
      clearTimeout(this.timer);
    }

    // Uma duração de 0 torna o toast persistente até ser ocultado manualmente.
    if (duration > 0) {
      this.timer = setTimeout(() => {
        this.hide();
      }, duration);
    }
  }

  /**
   * Oculta a notificação atual.
   */
  hide() {
    this.toast.set(null);
    if (this.timer) {
      clearTimeout(this.timer);
    }
  }
}