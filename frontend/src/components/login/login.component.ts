import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  inject,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';

// #region External Libraries Declarations
declare var lucide: any;
// #endregion

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  imports: [CommonModule, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent implements AfterViewInit {
  // #region Injections
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private toastService = inject(ToastService);
  // #endregion

  // #region Form Configuration
  loginForm = this.fb.group({
    username: ['', Validators.required],
    password: ['', Validators.required]
  });
  // #endregion

  // #region State Signals
  isLoading = signal(false);
  passwordVisible = signal(false);
  currentYear = signal(new Date().getFullYear());
  // #endregion

  // #region Lifecycle Hooks
  /**
   * Inicializa os ícones após a visualização ser carregada.
   */
  ngAfterViewInit() {
    lucide.createIcons();
  }
  // #endregion

  // #region UI Interaction Methods
  /**
   * Alterna a visibilidade da senha no input.
   */
  togglePasswordVisibility() {
    this.passwordVisible.update(value => !value);
  }
  // #endregion

  // #region Form Submission
  /**
   * Processa o envio do formulário de login.
   */
  async onSubmit() {
    // Validação inicial
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);

    const { username, password } = this.loginForm.value;

    // Tentativa de login via serviço
    try {
      await this.authService.login(username!, password!);
    } catch (error: any) {
      // Feedback visual em caso de erro
      if (error.status === 0 || error.status === 504) {
        this.toastService.show('Não há conexão com o servidor.', 'error');
      } else if (error.status === 401 || error.status === 403) {
        this.toastService.show('Usuário ou senha inválidos. Tente novamente.', 'error');
      } else {
        this.toastService.show('Erro ao realizar login. Tente novamente mais tarde.', 'error');
      }
    }

    this.isLoading.set(false);
  }
  // #endregion
}
