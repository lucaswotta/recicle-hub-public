import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  OnInit,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';

// #region External Libraries Declarations
declare var lucide: any;
// #endregion

// #region Types
type ReportType = 'saldo' | 'resgates' | 'clientes' | 'transacoes' | 'reciclagem' | 'container' | 'ranking';
// #endregion

@Component({
  selector: 'app-reports',
  templateUrl: './reports.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule]
})
export class ReportsComponent implements OnInit, AfterViewInit {
  // #region Injections
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private toastService = inject(ToastService);
  private apiService = inject(ApiService);
  // #endregion

  // #region State Signals
  isLoading = signal(true);
  generatingReport = signal<string | null>(null);
  maxDate = signal(new Date().toISOString().split('T')[0]);
  // #endregion

  // #region Computed Signals
  isUserAdmin = computed(() => this.authService.currentUser()?.role === 'admin');
  // #endregion

  // #region Forms
  resgatesForm!: FormGroup;
  transacoesForm!: FormGroup;
  reciclagemForm!: FormGroup;
  containerForm!: FormGroup;
  rankingForm!: FormGroup;
  // #endregion

  constructor() {
    // Efeito para re-inicializar ícones quando o estado de carregamento muda
    effect(() => {
      const isLoading = this.isLoading();
      // const generating = this.generatingReport(); // Unused

      if (!isLoading) {
        setTimeout(() => {
          if (typeof lucide !== 'undefined') {
            lucide.createIcons();
          }
        }, 50);
      }
    });

    this.initForms();
  }

  // #region Lifecycle Hooks
  ngOnInit(): void {
    // Simula tempo mínimo de carregamento para evitar "flicker" (800ms)
    this.isLoading.set(true);
    setTimeout(() => {
      this.isLoading.set(false);
    }, 800);
  }

  ngAfterViewInit() {
    // Hook para inicializações pós-renderização se necessário
  }
  // #endregion

  // #region Initialization
  /**
   * Inicializa os formulários com o intervalo do mês atual.
   */
  initForms() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');

    const todayStr = `${year}-${month}-${day}`;
    const firstDayStr = `${year}-${month}-01`;

    const createDateForm = () => this.fb.group({
      startDate: [firstDayStr, Validators.required],
      endDate: [todayStr, Validators.required]
    });

    this.resgatesForm = createDateForm();
    this.transacoesForm = createDateForm();
    this.reciclagemForm = createDateForm();
    this.containerForm = createDateForm();
    this.rankingForm = createDateForm();
  }
  // #endregion

  // #region Report Generation
  /**
   * Gerencia a geração de relatórios.
   * Valida permissões, datas e chama o serviço de download.
   * Apenas usuários 'support' não têm permissão para gerar relatórios.
   */
  generateReport(type: ReportType) {
    const userRole = this.authService.currentUser()?.role;

    // Bloqueia apenas o perfil 'support' de gerar relatórios
    if (userRole === 'support') {
      this.toastService.show('Você não tem permissão para gerar relatórios.', 'error');
      return;
    }

    if (this.generatingReport()) return; // Previne múltiplos cliques

    // Validação de datas futuras para relatórios que usam período
    if (['resgates', 'transacoes', 'reciclagem', 'ranking'].includes(type)) {
      const formGroup = this.getFormByType(type);
      if (formGroup && this.hasFutureDates(formGroup)) {
        this.toastService.show('Não é possível gerar relatórios com datas futuras.', 'error');
        return;
      }
    }

    // Lógica específica por tipo de relatório
    let endpoint = '';
    let filename = '';
    let params: any = {};

    switch (type) {
      case 'saldo':
        endpoint = '/api/reports/saldo';
        filename = 'saldo_ativo';
        break;

      case 'clientes':
        endpoint = '/api/reports/clientes';
        filename = 'ficha_consolidada_clientes';
        break;

      case 'resgates':
        if (this.resgatesForm.invalid) {
          this.toastService.show('Por favor, selecione o período.', 'error');
          return;
        }
        params = this.resgatesForm.value;
        endpoint = `/api/reports/resgates?startDate=${params.startDate}&endDate=${params.endDate}`;
        filename = 'relatorio_resgates';
        break;

      case 'transacoes':
        if (this.transacoesForm.invalid) {
          this.toastService.show('Por favor, selecione o período.', 'error');
          return;
        }
        params = this.transacoesForm.value;
        endpoint = `/api/reports/transacoes?startDate=${params.startDate}&endDate=${params.endDate}`;
        filename = 'extrato_movimentacoes';
        break;

      case 'reciclagem':
        if (this.reciclagemForm.invalid) {
          this.toastService.show('Por favor, selecione o período.', 'error');
          return;
        }
        params = this.reciclagemForm.value;
        endpoint = `/api/reports/reciclagem?startDate=${params.startDate}&endDate=${params.endDate}`;
        filename = 'panorama_reciclagem';
        break;

      case 'ranking':
        if (this.rankingForm.invalid) {
          this.toastService.show('Por favor, selecione o período.', 'error');
          return;
        }
        params = this.rankingForm.value;
        endpoint = `/api/reports/ranking?startDate=${params.startDate}&endDate=${params.endDate}`;
        filename = 'ranking_recicladores';
        break;

      case 'container':
        // Relatório de container ainda não implementado no backend (Mock)
        this.mockReportGeneration(type);
        return;
    }

    // Executa o download se houver endpoint definido
    if (endpoint) {
      this.executeDownload(endpoint, filename, type);
    }
  }
  // #endregion

  // #region Helpers
  /**
   * Retorna o FormGroup correspondente ao tipo de relatório.
   */
  private getFormByType(type: string): FormGroup | null {
    switch (type) {
      case 'resgates': return this.resgatesForm;
      case 'transacoes': return this.transacoesForm;
      case 'reciclagem': return this.reciclagemForm;
      case 'ranking': return this.rankingForm;
      default: return null;
    }
  }

  /**
   * Verifica se o formulário contém datas futuras.
   */
  private hasFutureDates(form: FormGroup): boolean {
    const { startDate, endDate } = form.value;
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;

    return (start && start > today) || (end && end > today) || false;
  }

  /**
   * Executa a chamada de API para download do relatório.
   */
  private executeDownload(endpoint: string, filenamePrefix: string, type: string) {
    this.generatingReport.set(type);
    this.toastService.show('Gerando relatório...', 'info');
    this.apiService.download(endpoint).subscribe({
      next: (blob) => {
        this.downloadBlob(blob, filenamePrefix);
        this.toastService.show('Relatório gerado com sucesso!', 'success');
        this.generatingReport.set(null);
      },
      error: (err) => {
        console.error('Erro ao baixar relatório:', err);
        this.toastService.show('Erro ao gerar relatório.', 'error');
        this.generatingReport.set(null);
      }
    });
  }

  /**
   * Simula a geração de relatório (para funcionalidades não implementadas).
   */
  private mockReportGeneration(type: string) {
    this.generatingReport.set(type);
    setTimeout(() => {
      this.generatingReport.set(null);
      this.toastService.show(`Relatório de ${type} gerado com sucesso! (Simulação)`, 'success');
    }, 2000);
  }

  /**
   * Processa o Blob recebido e inicia o download no navegador.
   */
  private downloadBlob(blob: Blob, filenamePrefix: string) {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;

    const now = new Date();
    const year = now.getFullYear().toString().slice(-2);
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const hour = now.getHours().toString().padStart(2, '0');
    const minute = now.getMinutes().toString().padStart(2, '0');

    link.download = `${filenamePrefix}_${day}${month}${year}_${hour}${minute}.xlsx`;
    link.click();

    window.URL.revokeObjectURL(url);
  }
  // #endregion
}
