/**
 * @file home.js
 * @description Dashboard principal. Agrega estatísticas, gráficos e rankings.
 * @requires express, pg (db)
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('../auth');

// ==============================================================================
// QUERIES E CONSTANTES SQL
// ==============================================================================

/**
 * Query Monolítica (Single Round-Trip).
 * ESTRATÉGIA:
 * Utiliza CTEs (Common Table Expressions) - as cláusulas 'WITH' - para calcular
 * cada widget do dashboard isoladamente. No final, o PostgreSQL empacota tudo
 * num único objeto JSON. Isso é muito mais rápido do que fazer 5 queries separadas.
 */
const DASHBOARD_QUERY = `
  WITH 
    -- 1. Cards de Estatísticas Gerais (Topo da tela)
    stats AS (
      SELECT 
        (SELECT COUNT(*) FROM app_user) as total_clients,
        (SELECT COALESCE(SUM(balance), 0) FROM app_user_curr_balance) as total_balance,
        (SELECT COALESCE(SUM(recicled_weight), 0) FROM app_user_curr_balance) as total_recycled,
        (SELECT COUNT(*) FROM app_user 
         WHERE (create_date AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date = 
               (NOW() AT TIME ZONE 'America/Sao_Paulo')::date) as new_registrations
    ),
    -- 2. Gráfico: Reciclagem nos últimos 5 meses
    recycling_monthly AS (
      SELECT date_trunc('month', mov_date) as m_date, SUM(weight_value) as value 
      FROM account_movement 
      WHERE mov_date >= date_trunc('month', CURRENT_DATE) - INTERVAL '5 months'
      GROUP BY 1 
      ORDER BY 1 ASC
    ),
    -- 3. Gráfico: Cadastros nos últimos 5 meses
    registrations_monthly AS (
      SELECT date_trunc('month', create_date) as m_date, COUNT(*) as value 
      FROM app_user 
      WHERE create_date >= date_trunc('month', CURRENT_DATE) - INTERVAL '5 months'
      GROUP BY 1 
      ORDER BY 1 ASC
    ),
    -- 4. Gráfico de Pizza: Materiais mais reciclados
    materials AS (
      SELECT description as category, SUM(weight_value) as value
      FROM account_movement
      WHERE weight_value > 0
      GROUP BY 1 
      ORDER BY 2 DESC
    ),
    -- 5. Ranking: Top 10 Clientes
    top_clients AS (
      SELECT u.name, b.recicled_weight as recycled
      FROM app_user u
      JOIN app_user_curr_balance b ON u.user_id = b.user_fk
      ORDER BY b.recicled_weight DESC
      LIMIT 10
    )
  -- Seleção Final: Monta o JSON direto no banco
  SELECT 
    json_build_object(
      'total_clients', s.total_clients,
      'total_balance', s.total_balance,
      'total_recycled', s.total_recycled,
      'new_registrations', s.new_registrations
    ) as stats,
    (SELECT COALESCE(json_agg(row_to_json(r)), '[]') FROM recycling_monthly r) as recycling_data,
    (SELECT COALESCE(json_agg(row_to_json(r)), '[]') FROM registrations_monthly r) as registrations_data,
    (SELECT COALESCE(json_agg(row_to_json(m)), '[]') FROM materials m) as materials_data,
    (SELECT COALESCE(json_agg(row_to_json(t)), '[]') FROM top_clients t) as top_clients_data
  FROM stats s
`;

// ==============================================================================
// UTILITÁRIOS
// ==============================================================================

// Instância do formatador para evitar recriação a cada requisição
const monthFormatter = new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'UTC' });

/**
 * Converte uma data ISO para o nome do mês abreviado (Ex: "2023-01-01" -> "Jan").
 * @param {string|Date} dateString 
 * @returns {string} Mês com a primeira letra maiúscula.
 */
const formatMonthName = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  const month = monthFormatter.format(date);
  return month.charAt(0).toUpperCase() + month.slice(1);
};

/**
 * Higieniza erros para ambiente de produção.
 */
const sanitizeError = (err) => {
  return process.env.NODE_ENV === 'production' ? 'Erro interno do servidor' : err.message;
};

// ==============================================================================
// ROTAS DA API
// ==============================================================================

router.use(authenticateToken);

/**
 * @route   GET /api/home
 * @desc    Retorna todos os dados consolidados do dashboard.
 * @access  Private (Requer Token - middleware global ou injetado no app.js)
 * @note    Todos os perfis (admin, support, viewer) podem visualizar o saldo total.
 */
router.get('/', async (req, res) => {
  try {
    // 1. Cache Control
    // Define que o browser/CDN pode guardar esta resposta por 120 segundos (2 min).
    // Isso alivia o banco de dados em momentos de muito tráfego.
    res.set('Cache-Control', 'public, max-age=120');

    // 2. Execução da Query
    const result = await db.query(DASHBOARD_QUERY);

    // Fail-safe: Se o banco estiver vazio, retorna estruturas vazias para não quebrar o Frontend
    if (result.rows.length === 0) {
      return res.status(200).json({
        stats: {}, recyclingData: [], registrationsData: [], materialsData: [], topClients: []
      });
    }

    const row = result.rows[0];

    // 3. Formatação (Data Adapter)
    // Transforma os dados brutos do banco para o formato exato que os gráficos do Frontend esperam.
    const data = {
      stats: {
        totalClients: parseInt(row.stats.total_clients || 0),
        totalBalance: parseFloat(row.stats.total_balance || 0),
        totalRecycled: parseFloat(row.stats.total_recycled || 0),
        newRegistrations: parseInt(row.stats.new_registrations || 0)
      },
      recyclingData: row.recycling_data.map(r => ({
        month: formatMonthName(r.m_date),
        value: parseFloat(r.value)
      })),
      registrationsData: row.registrations_data.map(r => ({
        date: r.m_date,
        month: formatMonthName(r.m_date),
        value: parseInt(r.value)
      })),
      materialsData: row.materials_data.map(r => ({
        category: r.category,
        value: parseFloat(r.value)
      })),
      // Mapeamento com campos "dummy" para compatibilidade com componentes de listagem de usuários
      topClients: row.top_clients_data.map((r, i) => ({
        id: i,
        type: 'PF',
        name: r.name || 'Sem Nome',
        recycledKg: parseFloat(r.recycled),
        email: '',
        document: '',
        status: 'Ativo',
        balance: 0
      }))
    };

    res.json(data);

  } catch (err) {
    console.error('Erro crítico ao buscar dados da home:', err);
    res.status(500).json({ error: sanitizeError(err) });
  }
});

module.exports = router;