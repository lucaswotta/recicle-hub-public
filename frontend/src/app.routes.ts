import { Routes } from '@angular/router';
import { HomeComponent } from './components/home/home.component';
import { ClientsComponent } from './components/clients/clients.component';
import { ReportsComponent } from './components/reports/reports.component';
import { SettingsComponent } from './components/settings/settings.component';
import { LoginComponent } from './components/login/login.component';
import { authGuard } from './guards/auth.guard';
import { loginGuard } from './guards/login.guard';

export const APP_ROUTES: Routes = [
  { path: 'login', component: LoginComponent, title: 'Login', canActivate: [loginGuard] },
  { path: '', redirectTo: 'inicio', pathMatch: 'full' },
  { path: 'inicio', component: HomeComponent, title: 'Início', canActivate: [authGuard] },
  { path: 'clientes', component: ClientsComponent, title: 'Clientes', canActivate: [authGuard] },
  { path: 'relatorios', component: ReportsComponent, title: 'Relatórios', canActivate: [authGuard] },
  { path: 'configuracoes', component: SettingsComponent, title: 'Configurações', canActivate: [authGuard] },
  { path: '**', redirectTo: 'inicio' } // Wildcard route for a 404 page
];