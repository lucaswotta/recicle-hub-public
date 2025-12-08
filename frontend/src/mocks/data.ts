import { Client } from '../models/client.model';
import { User, AuditLog } from '../models/user.model';

// --- MOCK USERS ---
// Using strict types that match the interfaces, plus casting for extra props if needed internally
export const MOCK_USERS: (User & { username: string })[] = [
    { id: 1, name: 'Administrador', role: 'admin', username: 'admin' },
    { id: 2, name: 'Suporte', role: 'support', username: 'suporte' },
    { id: 3, name: 'Gestor', role: 'admin', username: 'gestor' },
];

// --- MOCK CLIENTS ---
const NAMES = [
    'João Silva', 'Maria Oliveira', 'Pedro Santos', 'Ana Souza', 'Carlos Lima',
    'Fernanda Costa', 'Lucas Pereira', 'Juliana Alves', 'Marcos Rocha', 'Camila Dias',
    'Rafael Fernandes', 'Bruna Martins', 'Gustavo Ribeiro', 'Larissa Gomes', 'Felipe Araujo',
    'Mariana Barbosa', 'Thiago Lopes', 'Amanda Cardoso', 'Rodrigo Nogueira', 'Beatriz Silva',
    'Gabriel Oliveira', 'Daniela Santos', 'Bruno Souza', 'Jessica Lima', 'Leonardo Costa',
    'Renata Pereira', 'Eduardo Alves', 'Vanessa Rocha', 'Andre Dias', 'Letícia Fernandes',
    'Ricardo Martins', 'Patrícia Ribeiro', 'Marcelo Gomes', 'Tatiane Araujo', 'Vinicius Barbosa',
    'Carolina Lopes', 'Leandro Cardoso', 'Priscila Nogueira', 'Fabio Silva', 'Raquel Oliveira',
    'Roberto Santos', 'Monica Souza', 'Alexandre Lima', 'Eliane Costa', 'Sergio Pereira',
    'Cristiane Alves', 'Joaquim Rocha', 'Alice Dias', 'Vitor Fernandes', 'Helena Martins'
];

export const MOCK_CLIENTS: Client[] = NAMES.map((name, index) => ({
    id: index + 100,
    type: Math.random() > 0.3 ? 'PF' : 'PJ',
    name: name,
    email: name.toLowerCase().replace(' ', '.') + '@email.com',
    document: `000.000.00${index}-00`,
    phone: `(11) 9${Math.floor(Math.random() * 10000)}-${Math.floor(Math.random() * 10000)}`,
    address: {
        street: 'Rua das Flores',
        number: `${Math.floor(Math.random() * 1000)}`,
        district: 'Centro',
        city: 'São Paulo',
        state: 'SP',
        zipCode: '01001-000'
    },
    balance: parseFloat((Math.random() * 500).toFixed(2)),
    recycledKg: parseFloat((Math.random() * 2000).toFixed(2)),
    status: Math.random() > 0.1 ? 'Ativo' : 'Inativo',
    create_date: new Date(2023, Math.floor(Math.random() * 12), Math.floor(Math.random() * 28)),
    birth_date: new Date(1990, 0, 1)
}));

// --- MOCK AUDIT LOGS ---
const ACTIONS = ['LOGIN', 'LOGOUT', 'CREATE_CLIENT', 'UPDATE_CLIENT', 'DELETE_CLIENT', 'GENERATE_REPORT'];
export const MOCK_AUDIT_LOGS: AuditLog[] = Array.from({ length: 30 }).map((_, index) => {
    const user = MOCK_USERS[Math.floor(Math.random() * MOCK_USERS.length)];
    return {
        id: index + 1,
        action: ACTIONS[Math.floor(Math.random() * ACTIONS.length)],
        userName: user.name,
        userRole: user.role,
        details: 'Ação realizada no sistema',
        timestamp: new Date(Date.now() - Math.floor(Math.random() * 1000000000))
    };
}).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

// --- MOCK DASHBOARD ---
const totalClients = MOCK_CLIENTS.length;
const totalBalance = MOCK_CLIENTS.reduce((acc, c) => acc + c.balance, 0);
const totalRecycled = MOCK_CLIENTS.reduce((acc, c) => acc + c.recycledKg, 0);
const newRegistrations = MOCK_CLIENTS.filter(c => {
    const date = c.create_date || new Date();
    const now = new Date();
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
}).length;

export const MOCK_DASHBOARD = {
    stats: {
        totalClients,
        totalBalance,
        totalRecycled,
        newRegistrations
    },
    recyclingData: [
        { month: 'Jan', value: 1200 },
        { month: 'Fev', value: 1900 },
        { month: 'Mar', value: 1500 },
        { month: 'Abr', value: 2200 },
        { month: 'Mai', value: 1800 },
        { month: 'Jun', value: 2500 }
    ],
    registrationsData: [
        { date: '2023-01-15', value: 5 },
        { date: '2023-02-20', value: 8 },
        { date: '2023-03-10', value: 3 },
        { date: '2023-04-05', value: 12 },
        { date: '2023-05-18', value: 7 },
        { date: '2023-06-22', value: 10 }
    ],
    materialsData: [
        { category: 'Plástico', value: 45 },
        { category: 'Papel', value: 30 },
        { category: 'Vidro', value: 15 },
        { category: 'Metal', value: 10 }
    ],
    topClients: MOCK_CLIENTS
        .sort((a, b) => b.recycledKg! - a.recycledKg!)
        .slice(0, 5)
};
