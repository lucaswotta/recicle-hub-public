# Recicle Hub (Public Demo)

![Status](https://img.shields.io/badge/Status-Public_Demo-success)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js)](https://nodejs.org/)
[![Angular](https://img.shields.io/badge/Angular-20.3-DD0031?logo=angular)](https://angular.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript)](https://www.typescriptlang.org/)

Esta é uma versão de **demonstração pública** do projeto *Recicle Hub*, originalmente desenvolvido para uso interno corporativo.

> [!NOTE]
> **Atenção:** Este repositório é uma demonstração. Todos os dados exibidos são **mockados** (fictícios) e gerados localmente para fins de portfólio. Funcionalidades de backend como conexão com banco de dados real e autenticação via servidor foram substituídas por simulações em memória.

## Sobre o Projeto Original

O *Recicle Hub* original é uma plataforma de gestão de reciclagem desenvolvida para o Grupo Barcelos, projetada para gerenciar clientes, resgates de pontos, e monitoramento de materiais reciclados.

**Stack do Projeto Original:**
- **Backend:** Node.js + Express + PostgreSQL + Oracle
- **Frontend:** Angular + TailwindCSS
- **Infraestrutura:** PM2, Nginx, Apache Reverse Proxy, SSH Tunnels

## Funcionalidades desta Demo

Nesta versão pública, você pode explorar a interface e a experiência do usuário (UX) completa:

- **Dashboard Interativo:** Gráficos e métricas geradas com dados mockados.
- **Gestão de Clientes:** Listagem e edição simulada de clientes.
- **Autenticação Simulada:** Login funcional com qualquer usuário mockado.
- **Relatórios:** Geração simulada de arquivos Excel.
- **Logs de Auditoria:** Visualização de ações fictícias do sistema.

## Como Executar

### Pré-requisitos
- Node.js 18+

### Passo a Passo

1. **Clone o repositório:**
   ```bash
   git clone https://github.com/seu-usuario/recicle-hub-public.git
   cd recicle-hub-public
   ```

2. **Instale e execute o Frontend:**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

3. **Acesse:**
   Abra seu navegador em [http://localhost:4200](http://localhost:4200).

### Login de Demonstração

Use as credenciais abaixo (ou qualquer outra, pois é mockado):

- **Usuário:** `admin`
- **Senha:** `123`

---

## Estrutura do Código

A estrutura foi mantida fiel ao projeto original para demonstrar a organização do código:

- `frontend/`: Aplicação Angular completa.
  - `src/mocks/`: **[NOVO]** Camada de dados mockados adicionada para esta demo.
  - `src/services/api.service.ts`: Adaptado para interceptar chamadas e retornar mocks.
- `backend/`: Código do backend original mantido para referência (sanitizado), mas **não é necessário** executá-lo para esta demo.

## Licença

Este projeto de demonstração é distribuído sob licença MIT.

---
*Desenvolvido por Lucas Ribeiro.*