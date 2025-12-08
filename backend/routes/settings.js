/**
 * @file settings.js
 * @description Rotas de Gerenciamento de Usuários, Autenticação e Auditoria.
 * * MUDANÇA IMPORTANTE:
 * Persistência migrada de PostgreSQL (hub_user/hub_log) para Oracle (VITRUVIO.RECICLEHUB_APP_*).
 * Usa sintaxe de Alias ("campo") para garantir compatibilidade JSON com frontend.
 */

const express = require('express');
const router = express.Router();
const db = require('../db'); // Acesso ao wrapper híbrido
const bcrypt = require('bcryptjs');
const { logAction } = require('../db');
const { generateAccessToken, generateRefreshToken, authenticateToken } = require('../auth');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');

// ==============================================================================
// UTILITÁRIOS
// ==============================================================================

const sanitizeError = (err) => {
    // Em produção, esconde detalhes técnicos do erro Oracle/PG
    return process.env.NODE_ENV === 'production' ? 'Erro interno do servidor' : err.message;
};

// Limitador de brute-force para login (5 tentativas / 15min)
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { error: 'Muitas tentativas de login. Tente novamente em 15 minutos.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// ==============================================================================
// SCHEMAS DE VALIDAÇÃO (ZOD)
// ==============================================================================

const loginSchema = z.object({
    username: z.string().min(1, 'Usuário é obrigatório'),
    password: z.string().min(1, 'Senha é obrigatória')
});

const userSchema = z.object({
    name: z.string().min(3, 'Nome deve ter no mínimo 3 caracteres'),
    password: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
    role: z.enum(['admin', 'support', 'viewer'], { errorMap: () => ({ message: 'Role inválida' }) })
});

const updateUserSchema = z.object({
    name: z.string().min(3).optional(),
    password: z.string().min(6).optional(),
    role: z.enum(['admin', 'support', 'viewer']).optional()
});

// ==============================================================================
// ROTAS DE AUTENTICAÇÃO (MIGRADO PARA ORACLE)
// ==============================================================================

/**
 * @route   POST /api/settings/login
 * @desc    Autentica usuário consultando VITRUVIO.RECICLEHUB_APP_USER
 */
router.post('/login', loginLimiter, async (req, res) => {
    // 1. Validação de Entrada
    const validation = loginSchema.safeParse(req.body);
    if (!validation.success) {
        return res.status(400).json({ error: validation.error.errors[0].message });
    }

    const { username, password } = validation.data;

    try {
        // 2. Busca no Oracle (Usando aspas nos Alias para lowercase no JSON)
        const querySQL = `
            SELECT 
                USER_ID as "user_id", 
                USERNAME as "username", 
                PASSWORD_HASH as "password_hash", 
                ROLE as "role"
            FROM VITRUVIO.RECICLEHUB_APP_USER 
            WHERE USERNAME = :username
        `;

        const result = await db.oracleQuery(querySQL, { username });
        const user = result.rows[0];

        // 3. Verificação de Usuário
        if (!user) {
            return res.status(401).json({ error: 'Credenciais inválidas' });
        }

        // 4. Verificação de Senha (Bcrypt)
        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) {
            return res.status(401).json({ error: 'Credenciais inválidas' });
        }

        // 5. Geração de Tokens JWT
        const payload = { id: user.user_id, name: user.username, role: user.role };
        const accessToken = generateAccessToken(payload);
        const refreshToken = generateRefreshToken(payload);

        // 6. Auditoria (Log no Oracle)
        logAction(user.user_id, user.username, 'LOGIN', 'Usuário realizou login no sistema');

        // 7. Configuração do Cookie
        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 dias
        });

        // 8. Resposta
        res.json({
            id: user.user_id,
            name: user.username,
            role: user.role,
            accessToken: accessToken
        });

    } catch (err) {
        console.error('❌ Erro crítico no login:', err);
        res.status(500).json({ error: sanitizeError(err) });
    }
});

// ==============================================================================
// MIDDLEWARES DE PROTEÇÃO
// ==============================================================================

// Aplica verificação de token para todas as rotas abaixo
router.use(authenticateToken);

const requireAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Acesso negado. Apenas administradores podem realizar esta ação.' });
    }
    next();
};

// ==============================================================================
// GERENCIAMENTO DE USUÁRIOS (CRUD ORACLE)
// ==============================================================================

/**
 * @route   GET /api/settings/users
 * @desc    Lista usuários cadastrados no Oracle
 */
router.get('/users', async (req, res) => {
    try {
        const querySQL = `
            SELECT 
                USER_ID as "id", 
                USERNAME as "name", 
                ROLE as "role", 
                CREATED_AT as "createdAt"
            FROM VITRUVIO.RECICLEHUB_APP_USER
            ORDER BY CREATED_AT DESC
        `;

        const result = await db.oracleQuery(querySQL);

        // Oracle retorna .rows como array de objetos graças ao alias
        res.json(result.rows);
    } catch (err) {
        console.error('Erro ao buscar usuários:', err);
        res.status(500).json({ error: sanitizeError(err) });
    }
});

/**
 * @route   POST /api/settings/users
 * @desc    Cria novo usuário no Oracle
 */
router.post('/users', requireAdmin, async (req, res) => {
    const validation = userSchema.safeParse(req.body);
    if (!validation.success) return res.status(400).json({ error: validation.error.errors[0].message });

    const { name, password, role } = validation.data;
    const creatorId = req.user.id;
    const creatorName = req.user.name || 'Sistema';

    try {
        const passwordHash = await bcrypt.hash(password, 10);

        const insertSQL = `
            INSERT INTO VITRUVIO.RECICLEHUB_APP_USER 
            (USERNAME, PASSWORD_HASH, ROLE, CREATED_AT)
            VALUES 
            (:name, :passwordHash, :role, CURRENT_TIMESTAMP)
        `;

        await db.oracleQuery(insertSQL, {
            name: name,
            passwordHash: passwordHash,
            role: role
        });

        await logAction(creatorId, creatorName, 'CREATE_USER', `Criou o usuário: ${name} (${role})`);
        res.json({ success: true });

    } catch (err) {
        console.error('Erro ao criar usuário:', err);
        // Tratamento específico de erro Oracle para duplicidade (Unique Constraint)
        // ORA-00001: unique constraint (VITRUVIO.UNQ_RH_APP_USER_NAME) violated
        if (err.message && err.message.includes('ORA-00001')) {
            return res.status(409).json({ error: 'Nome de usuário já existe.' });
        }
        res.status(500).json({ error: sanitizeError(err) });
    }
});

/**
 * @route   PUT /api/settings/users/:id
 * @desc    Atualiza usuário existente no Oracle
 */
router.put('/users/:id', requireAdmin, async (req, res) => {
    const { id } = req.params;
    const validation = updateUserSchema.safeParse(req.body);
    if (!validation.success) return res.status(400).json({ error: validation.error.errors[0].message });

    const { name, password, role } = validation.data;
    const editorId = req.user.id;
    const editorName = req.user.name || 'Sistema';

    try {
        let updateSQL = '';
        let params = {};

        if (password) {
            // Atualiza com senha
            const passwordHash = await bcrypt.hash(password, 10);
            updateSQL = `
                UPDATE VITRUVIO.RECICLEHUB_APP_USER 
                SET USERNAME = :name, ROLE = :role, PASSWORD_HASH = :passwordHash
                WHERE USER_ID = :id
            `;
            params = { name, role, passwordHash, id: parseInt(id) };

            await logAction(editorId, editorName, 'UPDATE_USER', `Atualizou usuário ${name} (alterou senha)`);
        } else {
            // Atualiza sem senha
            updateSQL = `
                UPDATE VITRUVIO.RECICLEHUB_APP_USER 
                SET USERNAME = :name, ROLE = :role
                WHERE USER_ID = :id
            `;
            params = { name, role, id: parseInt(id) };

            await logAction(editorId, editorName, 'UPDATE_USER', `Atualizou usuário ${name}`);
        }

        await db.oracleQuery(updateSQL, params);
        res.json({ success: true });

    } catch (err) {
        console.error('Erro ao atualizar usuário:', err);
        if (err.message && err.message.includes('ORA-00001')) {
            return res.status(409).json({ error: 'Nome de usuário já em uso.' });
        }
        res.status(500).json({ error: sanitizeError(err) });
    }
});

/**
 * @route   DELETE /api/settings/users/:id
 * @desc    Remove usuário (Loga ação e limpa FKs no Oracle)
 */
router.delete('/users/:id', requireAdmin, async (req, res) => {
    const { id } = req.params;
    const deleterId = req.user.id;
    const deleterName = req.user.name || 'Sistema';

    // Evita suicídio digital
    if (parseInt(id) === parseInt(deleterId)) {
        return res.status(400).json({ error: 'Você não pode excluir a si mesmo.' });
    }

    try {
        // 1. Busca nome para o Log
        const userQuery = await db.oracleQuery(
            `SELECT USERNAME as "username" FROM VITRUVIO.RECICLEHUB_APP_USER WHERE USER_ID = :id`,
            { id: parseInt(id) }
        );

        if (userQuery.rows.length === 0) return res.status(404).json({ error: 'Usuário não encontrado.' });
        const userName = userQuery.rows[0].username;

        // 2. Desvincula logs antigos desse usuário (Seta USER_ID NULL)
        // Isso evita erro de FK ao deletar o pai
        await db.oracleQuery(
            `UPDATE VITRUVIO.RECICLEHUB_APP_LOG SET USER_ID = NULL WHERE USER_ID = :id`,
            { id: parseInt(id) }
        );

        // 3. Deleta o usuário
        await db.oracleQuery(
            `DELETE FROM VITRUVIO.RECICLEHUB_APP_USER WHERE USER_ID = :id`,
            { id: parseInt(id) }
        );

        await logAction(deleterId, deleterName, 'DELETE_USER', `Excluiu o usuário: ${userName}`);
        res.json({ success: true });

    } catch (err) {
        console.error('Erro ao excluir usuário:', err);
        res.status(500).json({ error: sanitizeError(err) });
    }
});

// ==============================================================================
// AUDITORIA (LOGS - MIGRADO PARA ORACLE)
// ==============================================================================

/**
 * @route   GET /api/settings/audit-logs
 * @desc    Consulta paginada de logs
 */
router.get('/audit-logs', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const offset = (page - 1) * limit;

        // 1. Contagem Total (Oracle Count)
        const countRes = await db.oracleQuery(`SELECT COUNT(*) as "total" FROM VITRUVIO.RECICLEHUB_APP_LOG`);
        const total = countRes.rows[0].total;

        // 2. Query Principal (Sintaxe Oracle 12c+ OFFSET/FETCH)
        // LEFT JOIN para pegar a role atual caso o usuário exista
        const logSQL = `
            SELECT 
                l.LOG_ID as "id", 
                l.CREATED_AT as "timestamp", 
                l.USER_NAME as "userName", 
                l.ACTION as "action", 
                l.DETAILS as "details", 
                u.ROLE as "userRole"
            FROM VITRUVIO.RECICLEHUB_APP_LOG l
            LEFT JOIN VITRUVIO.RECICLEHUB_APP_USER u ON l.USER_ID = u.USER_ID
            ORDER BY l.CREATED_AT DESC 
            OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
        `;

        const result = await db.oracleQuery(logSQL, { offset, limit });

        const logs = result.rows.map(row => ({
            id: row.id,
            timestamp: row.timestamp,
            userName: row.userName || 'Usuário Excluído',
            userRole: row.userRole || 'N/A',
            action: row.action,
            details: row.details
        }));

        res.json({
            data: logs,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        });

    } catch (err) {
        console.error('Erro ao buscar logs de auditoria:', err);
        res.status(500).json({ error: sanitizeError(err) });
    }
});

module.exports = router;