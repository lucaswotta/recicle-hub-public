import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { ToastService } from '../services/toast.service';
import { catchError, throwError } from 'rxjs';

/**
 * Interceptor global para tratamento de erros HTTP.
 * Exibe mensagens de erro apropriadas ao usuário via ToastService.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
    const toastService = inject(ToastService);

    return next(req).pipe(
        catchError((error: HttpErrorResponse) => {
            // Não exibir toast para erros já tratados especificamente nos componentes
            // (login, por exemplo, tem tratamento customizado)

            // Erros de servidor (500+)
            if (error.status >= 500) {
                toastService.show('Erro no servidor. Tente novamente mais tarde.', 'error');
            }
            // Erros de rede (sem conexão)
            else if (error.status === 0) {
                toastService.show('Sem conexão com o servidor. Verifique sua internet.', 'error');
            }
            // Timeout
            else if (error.status === 504) {
                toastService.show('Tempo de resposta excedido. Tente novamente.', 'error');
            }
            // Outros erros 4xx (exceto 401 e 403 que são tratados pelo auth.interceptor)
            else if (error.status >= 400 && error.status < 500 && error.status !== 401 && error.status !== 403) {
                // Tenta extrair mensagem do backend
                const message = error.error?.error || error.error?.message || 'Erro na requisição.';
                toastService.show(message, 'error');
            }

            return throwError(() => error);
        })
    );
};
