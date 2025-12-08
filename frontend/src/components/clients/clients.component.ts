import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  HostListener,
  inject,
  OnDestroy,
  OnInit,
  signal,
  ViewChild
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

import { DataService } from '../../services/data.service';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';
import { Client } from '../../models/client.model';

// Declaração para biblioteca de ícones Lucide
declare var lucide: any;

@Component({
  selector: 'app-clients',
  templateUrl: './clients.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule]
})
export class ClientsComponent implements OnInit, OnDestroy, AfterViewInit {
  // #region View Children
  @ViewChild('tableContainer') tableContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('filterContainer') filterContainer!: ElementRef<HTMLDivElement>;
  // #endregion

  // #region Injections
  private dataService = inject(DataService);
  private authService = inject(AuthService);
  private fb = inject(FormBuilder);
  private toastService = inject(ToastService);
  // #endregion

  // #region State Signals
  clients = this.dataService.clients;
  loading = this.dataService.clientsLoading;
  // #endregion

  // #region Pagination & Filter Signals
  itemsPerPage = signal(10);
  currentPage = signal(1);
  searchTerm = signal('');
  typeFilter = signal<'all' | 'PF' | 'PJ'>('all');
  statusFilter = signal<'all' | 'Ativo' | 'Inativo'>('all');
  showFilters = signal(false);
  // #endregion

  // #region Modal & Selection State
  isEditModalOpen = signal(false);
  isResetConfirmationModalOpen = signal(false);
  selectedClient = signal<Client | null>(null);
  editClientForm!: FormGroup;
  // #endregion

  // #region Balance Visibility State
  visibleBalanceClientIds = signal<Set<number>>(new Set());
  isModalBalanceVisible = signal(false);
  // #endregion

  // #region Reset Password State
  resetConfirmCountdown = signal(0);
  private countdownInterval: any;
  // #endregion

  // #region Utils
  private resizeObserver!: ResizeObserver;
  // #endregion

  // #region Computed Signals
  isCurrentUserAdmin = computed(() => this.authService.currentUser()?.role === 'admin');
  isCurrentUserSupport = computed(() => this.authService.currentUser()?.role === 'support');
  isCurrentUserViewer = computed(() => this.authService.currentUser()?.role === 'viewer');

  /**
   * Filtra a lista de clientes com base nos critérios de busca, tipo e status.
   */
  filteredClients = computed(() => {
    const term = this.searchTerm().toLowerCase();
    const type = this.typeFilter();
    const status = this.statusFilter();
    let clients = this.clients();

    // Filtro por termo (Nome, Email ou Documento)
    if (term) {
      clients = clients.filter(client =>
        client.name.toLowerCase().includes(term) ||
        client.email.toLowerCase().includes(term) ||
        client.document.toLowerCase().includes(term)
      );
    }

    // Filtro por Tipo
    if (type !== 'all') {
      clients = clients.filter(client => client.type === type);
    }

    // Filtro por Status
    if (status !== 'all') {
      clients = clients.filter(client => client.status === status);
    }

    return clients;
  });

  /**
   * Calcula o número total de páginas baseado nos clientes filtrados.
   */
  totalPages = computed(() => Math.ceil(this.filteredClients().length / this.itemsPerPage()));

  /**
   * Retorna a fatia de clientes correspondente à página atual.
   */
  paginatedClients = computed(() => {
    const startIndex = (this.currentPage() - 1) * this.itemsPerPage();
    const endIndex = startIndex + this.itemsPerPage();
    return this.filteredClients().slice(startIndex, endIndex);
  });
  // #endregion

  constructor() {
    // Efeito para atualizar ícones e recalcular paginação quando os dados mudam
    effect(() => {
      this.paginatedClients();
      setTimeout(() => lucide.createIcons(), 0);
    });
  }

  // #region Lifecycle Hooks
  ngOnInit() {
    this.dataService.loadClients();
    this.initForm();
  }

  ngAfterViewInit() {
    // Observa redimensionamento para ajuste responsivo da paginação
    setTimeout(() => {
      if (this.tableContainer?.nativeElement) {
        this.adjustItemsPerPage();
        this.resizeObserver = new ResizeObserver(() => {
          this.adjustItemsPerPage();
        });
        this.resizeObserver.observe(this.tableContainer.nativeElement);
      }
    });
  }

  ngOnDestroy() {
    if (this.countdownInterval) clearInterval(this.countdownInterval);
    if (this.resizeObserver) this.resizeObserver.disconnect();
  }
  // #endregion

  // #region Event Listeners
  /**
   * Fecha o menu de filtros ao clicar fora dele.
   */
  @HostListener('document:click', ['$event'])
  onClick(event: MouseEvent) {
    if (this.showFilters() && this.filterContainer && !this.filterContainer.nativeElement.contains(event.target as Node)) {
      this.showFilters.set(false);
    }
  }
  // #endregion

  // #region Initialization Methods
  private initForm() {
    this.editClientForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      telefone: ['', [Validators.pattern(/^\+55 \(\d{2}\) \d{5}-\d{4}$/)]],
    });
  }
  // #endregion

  // #region Search & Filter Methods
  onSearch(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.searchTerm.set(target.value);
    this.currentPage.set(1);
  }

  clearSearch(): void {
    this.searchTerm.set('');
    this.currentPage.set(1);
  }

  toggleFilters(): void {
    this.showFilters.update(v => !v);
    setTimeout(() => lucide.createIcons(), 0);
  }
  // #endregion

  // #region Pagination Methods
  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages()) {
      this.currentPage.set(page);
    }
  }

  nextPage(): void {
    this.goToPage(this.currentPage() + 1);
  }

  prevPage(): void {
    this.goToPage(this.currentPage() - 1);
  }

  private adjustItemsPerPage() {
    if (!this.tableContainer?.nativeElement) return;

    requestAnimationFrame(() => {
      const container = this.tableContainer.nativeElement;
      if (!container) return;

      if (this.loading() || this.paginatedClients().length === 0) return;

      const containerHeight = container.offsetHeight;
      const header = container.querySelector('thead');
      if (!header) return;

      const headerHeight = header.offsetHeight;
      const firstRow = container.querySelector('tbody tr');
      if (!firstRow) return;

      const rowHeight = (firstRow as HTMLElement).offsetHeight;
      if (rowHeight === 0) return;

      const availableHeight = containerHeight - headerHeight;
      const potentialItems = Math.floor(availableHeight / rowHeight);
      const newItemsPerPage = Math.max(5, potentialItems);

      if (this.itemsPerPage() !== newItemsPerPage) {
        this.itemsPerPage.set(newItemsPerPage);
      }

      if (this.currentPage() > this.totalPages()) {
        this.currentPage.set(1);
      }
    });
  }
  // #endregion

  // #region Balance Visibility Methods
  toggleTableBalance(clientId: number) {
    if (this.isCurrentUserSupport() || this.isCurrentUserViewer()) {
      this.toastService.show('Você não tem permissão para visualizar o saldo.', 'error');
      return;
    }

    this.visibleBalanceClientIds.update(currentSet => {
      const newSet = new Set(currentSet);
      if (newSet.has(clientId)) {
        newSet.delete(clientId);
      } else {
        newSet.add(clientId);
      }
      return newSet;
    });
    setTimeout(() => lucide.createIcons(), 0);
  }

  toggleModalBalance() {
    if (this.isCurrentUserSupport()) {
      this.toastService.show('Você não tem permissão para visualizar o saldo.', 'error');
      return;
    }
    this.isModalBalanceVisible.update(v => !v);
    setTimeout(() => lucide.createIcons(), 0);
  }

  isBalanceVisible(clientId: number): boolean {
    return this.visibleBalanceClientIds().has(clientId);
  }
  // #endregion

  // #region Client Actions (Edit/Save)
  openEditModal(client: Client) {
    this.selectedClient.set(client);
    this.editClientForm.patchValue({
      email: client.email,
      telefone: this.formatPhone(client.phone || ''),
    });
    this.isEditModalOpen.set(true);
    setTimeout(() => lucide.createIcons(), 0);
  }

  closeEditModal() {
    this.isEditModalOpen.set(false);
    this.isResetConfirmationModalOpen.set(false);
    this.selectedClient.set(null);
    this.editClientForm.reset();
    if (this.countdownInterval) clearInterval(this.countdownInterval);
  }

  async saveClient() {
    if (this.editClientForm.invalid) {
      if (this.editClientForm.get('email')?.invalid) this.toastService.show('Email inválido', 'error');
      if (this.editClientForm.get('telefone')?.invalid) this.toastService.show('Telefone incompleto ou inválido', 'error');
      return;
    }

    if (!this.selectedClient()) return;

    const formValue = this.editClientForm.value;
    const newEmail = formValue.email.toLowerCase().trim();
    const currentClientId = this.selectedClient()!.id;

    // Verifica duplicidade de email
    const emailExists = this.clients().some(client =>
      client.id !== currentClientId &&
      client.email.toLowerCase().trim() === newEmail
    );

    if (emailExists) {
      this.toastService.show('Este e-mail já está em uso por outro cliente.', 'error');
      return;
    }

    const updatedClient: Client = {
      ...this.selectedClient()!,
      email: formValue.email,
      phone: this.unformatPhone(formValue.telefone)
    };

    await this.dataService.updateClient(updatedClient);
    this.toastService.show('Cliente atualizado com sucesso!', 'success');
    this.closeEditModal();
  }
  // #endregion

  // #region Password Reset Methods
  openResetConfirmationModal() {
    if (!this.isCurrentUserAdmin()) {
      this.toastService.show('Você não tem permissão para reinicializar senhas.', 'error');
      return;
    }
    this.isResetConfirmationModalOpen.set(true);
    setTimeout(() => lucide.createIcons(), 0);

    this.resetConfirmCountdown.set(30);
    if (this.countdownInterval) clearInterval(this.countdownInterval);

    this.countdownInterval = setInterval(() => {
      this.resetConfirmCountdown.update(v => v - 1);
      if (this.resetConfirmCountdown() <= 0) clearInterval(this.countdownInterval);
    }, 1000);
  }

  closeResetConfirmationModal() {
    this.isResetConfirmationModalOpen.set(false);
    if (this.countdownInterval) clearInterval(this.countdownInterval);
  }

  confirmPasswordReset() {
    const client = this.selectedClient();
    if (client) {
      this.dataService.resetClientPassword(client.id).subscribe({
        next: () => {
          this.toastService.show('Senha reinicializada para Recicle@2026', 'success');
          this.closeResetConfirmationModal();
        },
        error: (err) => {
          console.error('Erro ao reinicializar senha:', err);
          this.toastService.show('Erro ao reinicializar senha', 'error');
          this.closeResetConfirmationModal();
        }
      });
    }
  }
  // #endregion

  // #region Report Methods
  downloadReport() {
    const client = this.selectedClient();
    if (!client) return;

    if (this.isCurrentUserSupport() || this.isCurrentUserViewer()) {
      this.toastService.show('Você não tem permissão para gerar este relatório.', 'error');
      return;
    }

    this.toastService.show('Gerando relatório...', 'info');

    this.dataService.downloadClientReport(client.id).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Relatorio_${client.name.replace(/\s+/g, '_')}.xlsx`;
        link.click();
        window.URL.revokeObjectURL(url);
        this.toastService.show('Relatório gerado com sucesso!', 'success');
      },
      error: (err) => {
        console.error('Erro ao gerar relatório:', err);
        this.toastService.show('Erro ao gerar relatório.', 'error');
      }
    });
  }
  // #endregion

  // #region Helper Methods
  getStatusClass(status: 'Ativo' | 'Inativo'): string {
    switch (status) {
      case 'Ativo':
        return 'bg-emerald-100 text-emerald-900';
      case 'Inativo':
        return 'bg-red-100 text-red-900';
      default:
        return 'bg-slate-100 text-slate-800';
    }
  }

  formatPhone(phone: string): string {
    if (!phone) return '';
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 13) {
      return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
    }
    return phone;
  }

  onPhoneKeydown(event: KeyboardEvent): void {
    const input = event.target as HTMLInputElement;
    if ((event.key === 'Backspace' || event.key === 'Delete')) {
      const value = input.value;
      if (value.length <= 4) return;
      if (input.selectionStart && input.selectionStart <= 4 && input.selectionEnd === input.selectionStart) {
        event.preventDefault();
      }
    }
  }

  formatPhoneInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    let value = input.value.replace(/\D/g, '');

    if (!value) {
      this.editClientForm.patchValue({ telefone: '' }, { emitEvent: false });
      return;
    }

    if (!value.startsWith('55')) value = '55' + value;
    if (value.length > 13) value = value.substring(0, 13);

    let formatted = '';
    if (value.length <= 2) formatted = `+${value}`;
    else if (value.length <= 4) formatted = `+${value.substring(0, 2)} (${value.substring(2)}`;
    else if (value.length <= 9) formatted = `+${value.substring(0, 2)} (${value.substring(2, 4)}) ${value.substring(4)}`;
    else formatted = `+${value.substring(0, 2)} (${value.substring(2, 4)}) ${value.substring(4, 9)}-${value.substring(9)}`;

    this.editClientForm.patchValue({ telefone: formatted }, { emitEvent: false });
  }

  unformatPhone(phone: string): string {
    return phone.replace(/\D/g, '');
  }
  // #endregion
}
