import { Injectable, signal, inject, computed } from '@angular/core';
import { Client } from '../models/client.model';
import { User, AuditLog } from '../models/user.model';
import { ApiService } from './api.service';
import { firstValueFrom, tap, catchError, of, Observable } from 'rxjs';

// Define a estrutura de dados do dashboard
interface DashboardData {
  stats: {
    totalClients: number;
    totalBalance: number;
    totalRecycled: number;
    newRegistrations: number;
  };
  recyclingData: { month: string, value: number }[];
  registrationsData: { date: string, value: number }[]; // Data como string do backend
  materialsData: { category: string, value: number }[];
  topClients: Client[];
}

@Injectable({
  providedIn: 'root',
})
export class DataService {
  private api: ApiService = inject(ApiService);

  // Sinais de estado para dados
  private readonly _clients = signal<Client[]>([]);
  private readonly _users = signal<User[]>([]);
  private readonly _auditLogs = signal<AuditLog[]>([]);
  private readonly _dashboardData = signal<DashboardData | null>(null);

  // Sinais de estado para carregamento
  clientsLoading = signal(false);
  usersLoading = signal(false);
  auditLogsLoading = signal(false);
  dashboardDataLoading = signal(false);
  dashboardDataError = signal(false);

  // Sinais públicos (apenas leitura) para consumo dos componentes
  clients = this._clients.asReadonly();
  users = this._users.asReadonly();
  auditLogs = this._auditLogs.asReadonly();

  // Sinais computados derivados dos dados do dashboard
  dashboardStats = computed(() => this._dashboardData()?.stats);
  recyclingData = computed(() => this._dashboardData()?.recyclingData || []);
  registrationsData = computed(() =>
    this._dashboardData()?.registrationsData.map(d => ({ ...d, date: new Date(d.date) })) || []
  );
  materialsData = computed(() => this._dashboardData()?.materialsData || []);
  topClients = computed(() => this._dashboardData()?.topClients || []);


  // --- MÉTODOS DE CARREGAMENTO DE DADOS ---

  /**
   * Carrega os dados do dashboard (Home).
   */
  async loadDashboardData(): Promise<void> {
    this.dashboardDataLoading.set(true);
    this.dashboardDataError.set(false);

    // Define um tempo mínimo de exibição do skeleton (800ms) para evitar "flicker"
    const minLoadingTime = new Promise(resolve => setTimeout(resolve, 800));

    try {
      const [data] = await Promise.all([
        firstValueFrom(this.api.get<DashboardData>('/api/home')),
        minLoadingTime
      ]);

      this._dashboardData.set(data);
      this.dashboardDataLoading.set(false);
    } catch (err) {
      console.error('Falha ao carregar dados do dashboard', err);
      this._dashboardData.set(null);
      this.dashboardDataError.set(true);
      this.dashboardDataLoading.set(false);
    }
  }

  /**
   * Carrega a lista de clientes.
   */
  /**
   * Carrega a lista de clientes.
   */
  async loadClients(): Promise<void> {
    this.clientsLoading.set(true);

    // Delay mínimo para evitar flicker do skeleton
    const minLoadingTime = new Promise(resolve => setTimeout(resolve, 800));

    try {
      const [data] = await Promise.all([
        firstValueFrom(this.api.get<Client[]>('/api/clients')),
        minLoadingTime
      ]);
      this._clients.set(data);
    } catch (err) {
      console.error('Falha ao carregar clientes', err);
      this._clients.set([]);
    } finally {
      this.clientsLoading.set(false);
    }
  }

  /**
   * Carrega a lista de usuários do sistema (admin/suporte).
   */
  async loadUsers(): Promise<void> {
    this.usersLoading.set(true);
    await firstValueFrom(
      this.api.get<User[]>('/api/settings/users').pipe(
        tap(data => this._users.set(data)),
        catchError(err => {
          console.error('Falha ao carregar usuários', err);
          this._users.set([]);
          return of([]);
        })
      )
    );
    this.usersLoading.set(false);
  }

  /**
   * Carrega os logs de auditoria.
   */
  auditLogsTotal = signal(0);

  /**
   * Carrega os logs de auditoria.
   */
  async loadAuditLogs(page: number = 1, limit: number = 50): Promise<void> {
    this.auditLogsLoading.set(true);
    await firstValueFrom(
      this.api.get<{ data: AuditLog[], meta: { total: number } }>(`/api/settings/audit-logs?page=${page}&limit=${limit}`).pipe(
        tap(response => {
          this._auditLogs.set(response.data.map(log => ({ ...log, timestamp: new Date(log.timestamp) })));
          this.auditLogsTotal.set(response.meta.total);
        }),
        catchError(err => {
          console.error('Falha ao carregar logs de auditoria', err);
          this._auditLogs.set([]);
          this.auditLogsTotal.set(0);
          return of({ data: [], meta: { total: 0 } });
        })
      )
    );
    this.auditLogsLoading.set(false);
  }

  // --- MÉTODOS DE MODIFICAÇÃO DE DADOS ---

  /**
   * Adiciona um novo usuário ao sistema.
   */
  async addUser(user: Omit<User, 'id'>): Promise<void> {
    await firstValueFrom(this.api.post('/api/settings/users', user));
    await this.loadUsers(); // Atualiza a lista
  }

  /**
   * Atualiza os dados de um usuário existente.
   */
  async updateUser(updatedUser: User): Promise<void> {
    await firstValueFrom(this.api.put(`/api/settings/users/${updatedUser.id}`, updatedUser));
    await this.loadUsers(); // Atualiza a lista
  }

  /**
   * Remove um usuário do sistema.
   */
  async deleteUser(id: number): Promise<void> {
    await firstValueFrom(this.api.delete(`/api/settings/users/${id}`));
    await this.loadUsers(); // Atualiza a lista
  }

  /**
   * Atualiza os dados de um cliente.
   */
  async updateClient(updatedClient: Client): Promise<void> {
    await firstValueFrom(this.api.put(`/api/clients/${updatedClient.id}`, updatedClient));
    await this.loadClients(); // Atualiza a lista
  }

  /**
   * Reseta a senha de um cliente para o padrão.
   */
  resetClientPassword(id: number): Observable<any> {
    return this.api.post(`/api/clients/${id}/reset-password`, {});
  }

  /**
   * Baixa o relatório completo do cliente (Excel).
   */
  downloadClientReport(id: number): Observable<Blob> {
    return this.api.download(`/api/clients/${id}/report`);
  }
}
