import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { delay } from 'rxjs/operators';
import { environment } from '../environments/environment';
import { MOCK_USERS, MOCK_CLIENTS, MOCK_DASHBOARD, MOCK_AUDIT_LOGS } from '../mocks/data';

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  private http: HttpClient = inject(HttpClient);
  private apiUrl = environment.apiUrl;
  private isMock = (environment as any).mock || false;

  private currentUser: { id: number; name: string } | null = null;

  setCurrentUser(user: { id: number; name: string } | null) {
    this.currentUser = user;
  }

  private getHeaders(): { [header: string]: string } {
    const headers: { [header: string]: string } = {};
    if (this.currentUser) {
      headers['X-User-Id'] = this.currentUser.id.toString();
      headers['X-User-Name'] = this.currentUser.name;
    }
    return headers;
  }

  // --- MOCK LOGIC ---
  private mockDelay<T>(data: T): Observable<T> {
    return of(data).pipe(delay(Math.random() * 500 + 300)); // 300-800ms latência
  }

  private handleMockRequest<T>(method: string, endpoint: string, body?: any): Observable<T> {
    console.log(`[MOCK] ${method} ${endpoint}`, body || '');

    // Auth
    if (endpoint.includes('/api/settings/login')) {
      // Mock login success for any user
      const user = MOCK_USERS.find(u => u.username === body.username) || MOCK_USERS[0];
      return this.mockDelay({ ...user, accessToken: 'mock-token-123' } as any);
    }
    if (endpoint.includes('/api/auth/logout')) return this.mockDelay({} as any);
    if (endpoint.includes('/api/auth/refresh')) return this.mockDelay({ user: MOCK_USERS[0], accessToken: 'mock-refreshed-123' } as any);

    // Dashboard
    if (endpoint.includes('/api/home')) return this.mockDelay(MOCK_DASHBOARD as any);

    // Clients
    if (endpoint.includes('/api/clients')) {
      if (method === 'GET') return this.mockDelay(MOCK_CLIENTS as any);
      if (method === 'PUT') {
        // Update mock client temporarily in memory (won't persist reload)
        const id = parseInt(endpoint.split('/').pop() || '0');
        const index = MOCK_CLIENTS.findIndex(c => c.id === id);
        if (index !== -1) MOCK_CLIENTS[index] = { ...MOCK_CLIENTS[index], ...body };
        return this.mockDelay(body);
      }
    }

    // Users
    if (endpoint.includes('/api/settings/users')) {
      if (method === 'GET') return this.mockDelay(MOCK_USERS as any);
      if (method === 'POST') {
        const newUser = { ...body, id: Math.floor(Math.random() * 1000) };
        MOCK_USERS.push(newUser);
        return this.mockDelay(newUser);
      }
      if (method === 'PUT') return this.mockDelay(body);
      if (method === 'DELETE') {
        const id = parseInt(endpoint.split('/').pop() || '0');
        const idx = MOCK_USERS.findIndex(u => u.id === id);
        if (idx !== -1) MOCK_USERS.splice(idx, 1);
        return this.mockDelay({} as any);
      }
    }

    // Audit Logs
    if (endpoint.includes('/api/settings/audit-logs')) {
      return this.mockDelay({ data: MOCK_AUDIT_LOGS, meta: { total: MOCK_AUDIT_LOGS.length } } as any);
    }

    // Reports dummy download
    if (endpoint.includes('/report') || endpoint.includes('/api/reports')) {
      return this.mockDelay(new Blob(['Relatorio Mockado - Dados estaticos'], { type: 'text/plain' }) as any);
    }

    // Default fallback
    console.warn(`[MOCK] No handler for ${endpoint}, returning null`);
    return this.mockDelay(null as any);
  }

  get<T>(endpoint: string): Observable<T> {
    if (this.isMock) return this.handleMockRequest<T>('GET', endpoint);
    return this.http.get<T>(`${this.apiUrl}${endpoint}`, { headers: this.getHeaders(), withCredentials: true });
  }

  post<T>(endpoint: string, body: any): Observable<T> {
    if (this.isMock) return this.handleMockRequest<T>('POST', endpoint, body);
    return this.http.post<T>(`${this.apiUrl}${endpoint}`, body, { headers: this.getHeaders(), withCredentials: true });
  }

  put<T>(endpoint: string, body: any): Observable<T> {
    if (this.isMock) return this.handleMockRequest<T>('PUT', endpoint, body);
    return this.http.put<T>(`${this.apiUrl}${endpoint}`, body, { headers: this.getHeaders(), withCredentials: true });
  }

  delete<T>(endpoint: string): Observable<T> {
    if (this.isMock) return this.handleMockRequest<T>('DELETE', endpoint);
    return this.http.delete<T>(`${this.apiUrl}${endpoint}`, { headers: this.getHeaders(), withCredentials: true });
  }

  download(endpoint: string): Observable<Blob> {
    if (this.isMock) return this.handleMockRequest<Blob>('GET', endpoint);
    return this.http.get(`${this.apiUrl}${endpoint}`, {
      responseType: 'blob',
      headers: this.getHeaders(),
      withCredentials: true
    });
  }
}
