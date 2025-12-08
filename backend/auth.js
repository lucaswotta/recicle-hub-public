/**
 * @file auth.js
 * @description Central de Autenticação JWT (JSON Web Token).
 * Responsável por gerar tokens, validar sessões (Middleware) e gerir a renovação (Refresh).
 * @requires jsonwebtoken, express
 */

const jwt = require('jsonwebtoken');
const express = require('express');
const router = express.Router();

// ==============================================================================
// VERIFICAÇÃO DE AMBIENTE (FAIL-FAST)
// ==============================================================================

// Garante que o servidor não inicia se as chaves de segurança não existirem.
if (!process.env.ACCESS_TOKEN_SECRET || !process.env.REFRESH_TOKEN_SECRET) {
    throw new Error('CRITICAL: ACCESS_TOKEN_SECRET ou REFRESH_TOKEN_SECRET não definidos no .env');
}

const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET;
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET;

// ==============================================================================
// FUNÇÕES AUXILIARES (GERAÇÃO DE TOKENS)
// ==============================================================================

/**
 * Gera um Access Token de curta duração (15 minutos).
 * Este é o token que o Frontend envia em cada requisição para acessar dados.
 * @param {object} user - Objeto contendo { id, name, role }.
 */
const generateAccessToken = (user) => {
    return jwt.sign(
        { id: user.id, name: user.name, role: user.role },
        ACCESS_TOKEN_SECRET,
        { expiresIn: '15m' }
    );
};

/**
 * Gera um Refresh Token de longa duração (7 dias).
 * Usado apenas para obter novos Access Tokens sem o usuário digitar a senha novamente.
 * @param {object} user - Objeto contendo { id, name, role }.
 */
const generateRefreshToken = (user) => {
    return jwt.sign(
        { id: user.id, name: user.name, role: user.role },
        REFRESH_TOKEN_SECRET,
        { expiresIn: '7d' }
    );
};

const verifyAccessToken = (token) => {
    return jwt.verify(token, ACCESS_TOKEN_SECRET);
};

const verifyRefreshToken = (token) => {
    return jwt.verify(token, REFRESH_TOKEN_SECRET);
};

// ==============================================================================
// MIDDLEWARE DE PROTEÇÃO
// ==============================================================================

/**
 * Middleware interceptor para rotas protegidas.
 * 1. Verifica se o header Authorization existe.
 * 2. Valida a assinatura do token.
 * 3. Injeta o usuário decodificado no objeto 'req'.
 */
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    // Formato esperado: "Bearer <TOKEN>"
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Acesso negado. Token não fornecido.' });
    }

    try {
        const user = verifyAccessToken(token);
        req.user = user;

        // --- ADAPTER DE COMPATIBILIDADE ---
        // Alguns módulos legados ou logs podem procurar user_id nos headers.
        // Mantemos isso para garantir retrocompatibilidade.
        req.headers['x-user-id'] = user.id;
        req.headers['x-user-name'] = user.name;

        next();
    } catch (err) {
        // Token expirado ou manipulado
        return res.status(401).json({ error: 'Token inválido ou expirado.' });
    }
};

// ==============================================================================
// ROTAS DE SESSÃO
// ==============================================================================

/**
 * @route   POST /auth/refresh
 * @desc    Renova o Access Token usando um Refresh Token válido (Token Rotation).
 * @access  Public (Requer Cookie)
 */
router.post('/refresh', (req, res) => {
    // O Refresh Token deve vir apenas via Cookie HttpOnly (segurança contra XSS)
    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken) {
        return res.status(401).json({ error: 'Refresh token não encontrado. Faça login novamente.' });
    }

    try {
        const user = verifyRefreshToken(refreshToken);

        // --- ROTAÇÃO DE TOKEN (SEGURANÇA AVANÇADA) ---
        // Sempre que renovamos a sessão, invalidamos o refresh token antigo
        // e emitimos um par totalmente novo. Se o antigo for roubado, ele já não serve.
        const newAccessToken = generateAccessToken(user);
        const newRefreshToken = generateRefreshToken(user);

        // Atualiza o cookie com o novo Refresh Token
        res.cookie('refreshToken', newRefreshToken, {
            httpOnly: true,                             // JS do navegador não acessa
            secure: process.env.NODE_ENV === 'production', // Apenas HTTPS em prod
            sameSite: 'strict',                         // Proteção CSRF
            maxAge: 7 * 24 * 60 * 60 * 1000             // 7 dias
        });

        res.json({
            accessToken: newAccessToken,
            user: { id: user.id, name: user.name, role: user.role }
        });

    } catch (err) {
        console.error('Tentativa de refresh falhou:', err.message);
        return res.status(403).json({ error: 'Sessão expirada. Faça login novamente.' });
    }
});

/**
 * @route   POST /auth/logout
 * @desc    Encerra a sessão removendo o cookie do Refresh Token.
 * @access  Public
 */
router.post('/logout', (req, res) => {
    res.clearCookie('refreshToken');
    res.json({ success: true, message: 'Logout realizado com sucesso' });
});

// Exporta o router para as rotas e as funções para serem usadas no login (settings.js)
module.exports = {
    router,
    authenticateToken,
    generateAccessToken,
    generateRefreshToken,
    verifyAccessToken,
    verifyRefreshToken
};