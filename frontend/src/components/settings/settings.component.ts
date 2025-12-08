import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  OnDestroy,
  OnInit,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { AuthService } from '../../services/auth.service';
import { DataService } from '../../services/data.service';
import { ToastService } from '../../services/toast.service';
import { User, UserRole } from '../../models/user.model';

// #region External Libraries Declarations
declare var lucide: any;
// #endregion

@Component({
  selector: 'app-settings',
  templateUrl: './settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule]
})
export class SettingsComponent implements OnInit, AfterViewInit, OnDestroy {
  // #region Injections
  private fb = inject(FormBuilder);
  private dataService = inject(DataService);
  private authService = inject(AuthService);
  private router = inject(Router);
  private toastService = inject(ToastService);
  // #endregion

  // #region State Signals
  users = this.dataService.users;
  minLoading = signal(true);
  currentUser = this.authService.currentUser;
  isEditing = signal(false);
  passwordVisible = signal(false);
  isDeleteConfirmationModalOpen = signal(false);
  userToDelete = signal<User | null>(null);

  auditLogs = this.dataService.auditLogs;
  auditLogItemsPerPage = signal(50);
  auditLogCurrentPage = signal(1);
  // #endregion

  // #region Computed Signals
  usersLoading = computed(() => this.dataService.usersLoading() || this.minLoading());
  isCurrentUserAdmin = computed(() => this.currentUser()?.role === 'admin');
  auditLogsLoading = computed(() => this.dataService.auditLogsLoading() || this.minLoading());
  totalAuditLogPages = computed(() => Math.ceil(this.dataService.auditLogsTotal() / this.auditLogItemsPerPage()));
  // #endregion

  // #region Forms
  userForm = this.fb.group({
    id: [null as number | null],
    name: ['', Validators.required],
    password: [''],
    role: ['support' as UserRole, Validators.required]
  });
  // #endregion

  constructor() {
    // Efeito para recriar ícones quando os dados mudam
    effect(() => {
      this.auditLogs(); // Dependência para re-renderizar
      this.users();
      this.isDeleteConfirmationModalOpen();

      // Recria ícones quando o loading termina
      if (!this.usersLoading() && !this.auditLogsLoading()) {
        setTimeout(() => {
          if (typeof lucide !== 'undefined') {
            lucide.createIcons();
          }
        }, 50);
      }
    });

    // Efeito para validação dinâmica de senha
    effect(() => {
      const passwordControl = this.userForm.get('password');
      if (!passwordControl) return;

      // Na edição, a senha é opcional (só preencher se quiser alterar)
      // Na criação, a senha é obrigatória
      if (this.isEditing()) {
        passwordControl.setValidators([Validators.minLength(6)]);
      } else {
        passwordControl.setValidators([Validators.required, Validators.minLength(6)]);
      }
      passwordControl.updateValueAndValidity({ emitEvent: false });
    });

    // Efeito para controle de permissão no formulário
    effect(() => {
      const roleControl = this.userForm.get('role');
      if (roleControl) {
        const currentUserId = this.currentUser()?.id;
        const formId = this.userForm.getRawValue().id;
        const isEditing = this.isEditing();

        // Admin não pode alterar seu próprio papel para evitar bloqueio acidental
        if (isEditing && formId === currentUserId) {
          roleControl.disable({ emitEvent: false });
        } else {
          roleControl.enable({ emitEvent: false });
        }
      }
    });
  }

  // #region Lifecycle Hooks
  ngOnInit() {
    // Carrega dados iniciais
    this.dataService.loadUsers();
    this.loadAuditLogs();

    // Simula tempo mínimo de carregamento para evitar "flicker" (800ms)
    setTimeout(() => {
      this.minLoading.set(false);
    }, 800);
  }

  ngAfterViewInit() {
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }

  ngOnDestroy() {
    // Limpeza se necessário
  }
  // #endregion

  // #region Data Loading
  loadAuditLogs() {
    this.dataService.loadAuditLogs(this.auditLogCurrentPage(), this.auditLogItemsPerPage());
  }
  // #endregion

  // #region Navigation
  goHome() {
    this.router.navigate(['/inicio']);
  }
  // #endregion

  // #region UI Interaction Methods
  togglePasswordVisibility() {
    this.passwordVisible.update(v => !v);
  }

  resetForm() {
    this.isEditing.set(false);
    this.userForm.reset({ id: null, name: '', password: '', role: 'support' });
    this.passwordVisible.set(false);
  }
  // #endregion

  // #region User Management
  /**
   * Processa o envio do formulário de usuário.
   */
  async onSubmit() {
    if (!this.isCurrentUserAdmin()) {
      this.toastService.show('Você não tem permissão para criar ou editar usuários.', 'error');
      return;
    }

    const formValue = this.userForm.getRawValue();

    // Validações manuais adicionais
    if (!this.isEditing()) {
      if (!formValue.password) {
        this.toastService.show('Senha é obrigatória para criar um novo usuário.', 'error');
        return;
      }
      if (formValue.password.length < 6) {
        this.toastService.show('A senha deve ter no mínimo 6 caracteres.', 'error');
        return;
      }
    }

    if (this.isEditing() && formValue.password && formValue.password.length < 6) {
      this.toastService.show('A senha deve ter no mínimo 6 caracteres.', 'error');
      return;
    }

    if (this.userForm.invalid) {
      this.userForm.markAllAsTouched();
      this.toastService.show('Por favor, preencha todos os campos obrigatórios.', 'error');
      return;
    }

    // Salvar ou Atualizar
    try {
      if (this.isEditing() && formValue.id) {
        const userToUpdate = { ...formValue };
        // Remove senha se estiver vazia (não alterar)
        if (!userToUpdate.password) {
          delete (userToUpdate as any).password;
        }
        await this.dataService.updateUser(userToUpdate as User);
        this.toastService.show('Usuário atualizado com sucesso!', 'success');
      } else {
        const { id, ...newUser } = formValue;
        await this.dataService.addUser(newUser as Omit<User, 'id'>);
        this.toastService.show('Usuário criado com sucesso!', 'success');
      }
      this.resetForm();
    } catch (error) {
      console.error('Erro ao salvar usuário:', error);
      this.toastService.show('Erro ao salvar usuário.', 'error');
    }
  }

  /**
   * Prepara o formulário para edição.
   */
  editUser(user: User) {
    if (!this.isCurrentUserAdmin()) {
      this.toastService.show('Você não tem permissão para editar usuários.', 'error');
      return;
    }
    // Admin não pode editar outro Admin (regra de negócio opcional, mantida do original)
    if (user.role === 'admin' && this.currentUser()?.id !== user.id) {
      // Permite editar a si mesmo, mas bloqueia papel (tratado no effect)
    }

    this.passwordVisible.set(false);
    this.userForm.reset({
      id: user.id,
      name: user.name,
      role: user.role,
      password: '',
    });
    this.isEditing.set(true);
  }

  openDeleteConfirmationModal(user: User) {
    if (!this.isCurrentUserAdmin()) {
      this.toastService.show('Você não tem permissão para excluir usuários.', 'error');
      return;
    }
    if (user.role === 'admin') {
      this.toastService.show('Não é possível excluir um administrador.', 'error');
      return;
    }

    this.userToDelete.set(user);
    this.isDeleteConfirmationModalOpen.set(true);
  }

  closeDeleteConfirmationModal() {
    this.isDeleteConfirmationModalOpen.set(false);
    this.userToDelete.set(null);
  }

  async confirmDelete() {
    if (!this.isCurrentUserAdmin()) return;
    const user = this.userToDelete();

    if (user) {
      try {
        await this.dataService.deleteUser(user.id);
        this.toastService.show('Usuário excluído com sucesso!', 'success');

        // Se estava editando o usuário excluído, limpa o form
        if (this.isEditing() && this.userForm.value.id === user.id) {
          this.resetForm();
        }
      } catch (error) {
        console.error('Erro ao excluir usuário:', error);
        this.toastService.show('Erro ao excluir usuário.', 'error');
      }
    }
    this.closeDeleteConfirmationModal();
  }
  // #endregion

  // #region Pagination
  goToAuditLogPage(page: number): void {
    if (page >= 1 && page <= this.totalAuditLogPages()) {
      this.auditLogCurrentPage.set(page);
      this.loadAuditLogs();
    }
  }

  nextAuditLogPage(): void {
    this.goToAuditLogPage(this.auditLogCurrentPage() + 1);
  }

  prevAuditLogPage(): void {
    this.goToAuditLogPage(this.auditLogCurrentPage() - 1);
  }

  changeAuditLogItemsPerPage(event: Event): void {
    const target = event.target as HTMLSelectElement;
    const limit = parseInt(target.value, 10);
    this.auditLogItemsPerPage.set(limit);
    this.auditLogCurrentPage.set(1); // Reset para primeira página
    this.loadAuditLogs();
  }
  // #endregion
}
