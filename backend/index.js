/**
 * @file index.js
 * @description Ponto de entrada (Entry Point) da API.
 * Responsável por configurar middlewares globais, segurança, CORS e inicializar o servidor.
 * @requires express, helmet, cors, db
 */

require('dotenv-safe').config(); // Garante que todas as vars do .env.example existem no .env
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const db = require('./db');

// --- IMPORTAÇÃO DE ROTAS ---
const homeRoutes = require('./routes/home');
const clientsRoutes = require('./routes/clients');
const settingsRoutes = require('./routes/settings');
const reportsRoutes = require('./routes/reports');
const { router: authRoutes } = require('./auth');

// ==============================================================================
// CONFIGURAÇÕES GLOBAIS
// ==============================================================================

const app = express();
const PORT = process.env.API_PORT || 3000;

// Lista de origens permitidas (Frontend Local e Produção)
const ALLOWED_ORIGINS = [
    'http://localhost:4200',
    'http://localhost:3000'
];

// ==============================================================================
// MIDDLEWARES DE SEGURANÇA E UTILITÁRIOS
// ==============================================================================

// 1. Helmet: Define cabeçalhos HTTP seguros (ex: Content-Security-Policy)
// Protege contra XSS e outras injeções.
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"], // Permite imagens locais, base64 e HTTPS externo
            objectSrc: ["'none'"],
            upgradeInsecureRequests: [],
        }
    }
}));

// 2. Rate Limit Global: Protege contra DDoS e força bruta genérica
// Limite: 300 requisições por IP a cada 15 minutos.
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: true, // Retorna info nos headers `RateLimit-*`
    legacyHeaders: false,
    message: { error: 'Muitas requisições originadas deste IP, tente novamente mais tarde.' }
});
app.use(globalLimiter);

// 3. CORS: Controla quem pode acessar a API
app.use(cors({
    origin: (origin, callback) => {
        // !origin permite requisições sem origem (ex: Apps Mobile, Curl, Postman)
        if (!origin || ALLOWED_ORIGINS.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Bloqueado pela política de CORS'));
        }
    },
    credentials: true // Permite envio de Cookies (essencial para o Refresh Token)
}));

// 4. Parsers: Entendem JSON e Cookies
app.use(express.json());
app.use(cookieParser());

// ==============================================================================
// REGISTRO DE ROTAS
// ==============================================================================

app.use('/api/home', homeRoutes);
app.use('/api/clients', clientsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/auth', authRoutes);

// Rota de Health Check (Monitoramento)
app.get('/api/status', async (req, res) => {
    try {
        const result = await db.query('SELECT version()');
        res.json({
            status: 'online',
            service: 'Recicle Hub API',
            database: 'Connected',
            db_version: result.rows[0].version,
            timestamp: new Date()
        });
    } catch (error) {
        const msg = process.env.NODE_ENV === 'production' ? 'Erro interno' : error.message;
        res.status(500).json({ status: 'offline', error: msg });
    }
});

// ==============================================================================
// TRATAMENTO GLOBAL DE ERROS
// ==============================================================================

// Middleware "Catch-All" para erros não tratados nas rotas
app.use((err, req, res, next) => {
    console.error('🔥 Erro não tratado:', err);

    // Se for erro de CORS, retorna 403, senão 500
    if (err.message === 'Bloqueado pela política de CORS') {
        return res.status(403).json({ error: err.message });
    }

    res.status(500).json({
        error: 'Erro interno do servidor',
        details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// ==============================================================================
// INICIALIZAÇÃO
// ==============================================================================

/**
 * Utilitário para imprimir rotas no console (DX - Developer Experience).
 * Ajuda a verificar se todas as rotas foram carregadas corretamente.
 */
function printAvailableRoutes() {
    console.log('\n🗺️  Mapeamento de Rotas:');

    const routers = [
        { prefix: '/api/home', router: homeRoutes },
        { prefix: '/api/clients', router: clientsRoutes },
        { prefix: '/api/settings', router: settingsRoutes },
        { prefix: '/api/reports', router: reportsRoutes },
        { prefix: '/api/auth', router: authRoutes }
    ];

    routers.forEach(({ prefix, router }) => {
        if (router && router.stack) {
            router.stack.forEach(layer => {
                if (layer.route) {
                    const methods = Object.keys(layer.route.methods).map(m => m.toUpperCase()).join(', ');
                    console.log(`   ${methods.padEnd(7)} ${prefix}${layer.route.path}`);
                }
            });
        }
    });
    console.log('   GET      /api/status');
    console.log('');
}

async function startServer() {
    try {
        // 1. Conecta ao Banco (Túnel SSH + Postgres)
        await db.connect();

        // 2. Inicia servidor HTTP
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`\n🚀 Servidor Recicle Hub rodando em: http://localhost:${PORT}`);
            if (process.env.NODE_ENV !== 'production') {
                printAvailableRoutes();
            }
        });

    } catch (error) {
        console.error('💀 Falha fatal na inicialização:', error);
        process.exit(1); // Encerra processo com código de erro
    }
}

startServer();