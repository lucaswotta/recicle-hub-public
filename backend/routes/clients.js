/**
 * @file clients.js
 * @description Gerenciamento de clientes e geração de relatórios em Excel.
 * @requires express, exceljs, zod
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { logAction } = require('../db');
const { authenticateToken } = require('../auth');
const ExcelJS = require('exceljs');
const { z } = require('zod');

// ==============================================================================
// CONFIGURAÇÕES E CONSTANTES
// ==============================================================================

// Esquema de validação para atualização de cliente
const clientUpdateSchema = z.object({
    name: z.string().min(3, 'Nome deve ter no mínimo 3 caracteres'),
    email: z.string().email('Email inválido'),
    status: z.enum(['Ativo', 'Inativo']),
    phone: z.string().optional()
});

// Estilos padronizados para o Excel (Cores, Fontes e Proteção)
const STYLES = {
    COLORS: {
        EMERALD_BG: 'FF047857',    // Fundo Verde Esmeralda (700)
        EMERALD_TEXT: 'FF059669',  // Texto Verde Esmeralda (600)
        SLATE_BG: 'FF1E293B',      // Fundo Cinza Ardósia (800)
        SLATE_HEADER: 'FF334155',  // Cabeçalho (700)
        SLATE_LIGHT: 'FFF1F5F9',   // Fundo Claro (100)
        SLATE_TEXT: 'FF334155',    // Texto Escuro (700)
        SLATE_FOOTER: 'FF94A3B8',  // Rodapé (400)
        WHITE_TEXT: 'FFFFFFFF',    // Branco Puro
        RED_TEXT: 'FFDC2626'       // Vermelho Alerta (600)
    },
    FONTS: {
        TITLE: { name: 'Arial', size: 14, bold: true },
        LABEL: { bold: true },
        DATA: { name: 'Arial', size: 10 },
        FOOTER: { name: 'Arial', size: 9 }
    },
    // Configurações de bloqueio da planilha
    PROTECTION: {
        selectLockedCells: true, selectUnlockedCells: true, formatCells: false,
        formatColumns: true, formatRows: true, insertColumns: false,
        insertRows: false, insertHyperlinks: false, deleteColumns: false,
        deleteRows: false, sort: true, autoFilter: true, pivotTables: false
    }
};

// ==============================================================================
// CLASSES AUXILIARES
// ==============================================================================

/**
 * Responsável por estruturar e gerar o arquivo Excel de relatórios.
 * Implementa o padrão "Builder" para encadeamento de métodos.
 */
class ClientReportBuilder {
    /**
     * @param {string} userName - Nome do usuário gerador do relatório (para auditoria no rodapé).
     */
    constructor(userName) {
        this.workbook = new ExcelJS.Workbook();
        this.workbook.creator = 'Recicle Hub System';
        this.workbook.created = new Date();
        this.userName = userName || 'Sistema';
    }

    /**
     * Gera a aba "Ficha Cadastral" com os dados do perfil.
     * @param {object} client - Objeto com dados do banco de dados.
     * @param {string|number} clientId - ID do cliente.
     * @returns {ClientReportBuilder} Retorna a instância para encadeamento (Fluent Interface).
     */
    addProfileSheet(client, clientId) {
        const sheet = this.workbook.addWorksheet('Ficha Cadastral', { views: [{ showGridLines: false }] });

        // --- Cabeçalho ---
        sheet.mergeCells('A1:B1');
        const title = sheet.getCell('A1');
        title.value = 'FICHA CADASTRAL DO CLIENTE';
        title.font = { ...STYLES.FONTS.TITLE, color: { argb: STYLES.COLORS.WHITE_TEXT } };
        title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STYLES.COLORS.EMERALD_BG } };
        title.alignment = { horizontal: 'center', vertical: 'middle' };
        sheet.getRow(1).height = 30;

        /**
         * Helper interno para adicionar linhas formatadas (Chave: Valor)
         */
        const addRow = (label, value) => {
            const row = sheet.addRow([label, value]);
            const labelCell = row.getCell(1);

            // Estilo visual da etiqueta (Label)
            labelCell.font = { ...STYLES.FONTS.LABEL, color: { argb: STYLES.COLORS.SLATE_TEXT } };
            labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STYLES.COLORS.SLATE_LIGHT } };
            row.getCell(2).alignment = { horizontal: 'left' };
        };

        // --- Preenchimento dos Dados ---

        // Pessoais
        addRow('ID do Cliente', clientId);
        addRow('Nome Completo', client.name);
        addRow('Tipo', client.person_type || 'PF');
        addRow('Documento', client.document_id);
        addRow('Email', client.email);
        addRow('Telefone', client.phone_number);
        addRow('Data de Nascimento', client.birth_date ? new Date(client.birth_date).toLocaleDateString('pt-BR') : '-');
        addRow('Status', client.status === 'active' ? 'Ativo' : 'Inativo');
        addRow('Data de Cadastro', new Date(client.create_date).toLocaleDateString('pt-BR'));

        sheet.addRow([]); // Espaçador visual

        // Financeiros
        addRow('Saldo Atual', `R$ ${parseFloat(client.balance).toFixed(2)}`);
        addRow('Total Reciclado', `${parseFloat(client.recycled_weight).toFixed(2)} Kg`);

        sheet.addRow([]); // Espaçador visual

        // Endereço
        addRow('Endereço', client.addr);
        addRow('Número', client.addr_number);
        addRow('Complemento', client.complement);
        addRow('Bairro', client.district);
        addRow('Cidade/UF', `${client.city}/${client.state_name}`);
        addRow('CEP', client.zip_code);

        // Layout
        sheet.getColumn(1).width = 25;
        sheet.getColumn(2).width = 50;

        this._addFooter(sheet, 2);
        return this;
    }

    /**
     * Gera a aba "Extrato" com o histórico de transações.
     * @param {Array} movements - Lista de movimentações financeiras/peso.
     * @returns {ClientReportBuilder}
     */
    addStatementSheet(movements) {
        const sheet = this.workbook.addWorksheet('Extrato', { views: [{ showGridLines: false }] });

        // --- Cabeçalho Principal ---
        sheet.mergeCells('A1:F1');
        const title = sheet.getCell('A1');
        title.value = 'EXTRATO DE TRANSAÇÕES';
        title.font = { ...STYLES.FONTS.TITLE, color: { argb: STYLES.COLORS.WHITE_TEXT } };
        title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STYLES.COLORS.EMERALD_BG } };
        title.alignment = { horizontal: 'center', vertical: 'middle' };
        sheet.getRow(1).height = 30;

        // --- Cabeçalhos das Colunas ---
        const headers = ['Data/Hora', 'Tipo', 'Descrição', 'Peso (Kg)', 'Valor (R$)', 'Local'];
        const headerRow = sheet.getRow(3);
        headerRow.values = headers;
        headerRow.font = { bold: true, color: { argb: STYLES.COLORS.WHITE_TEXT } };

        headerRow.eachCell(cell => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STYLES.COLORS.SLATE_HEADER } };
            cell.alignment = { horizontal: 'center' };
        });

        // --- Iteração dos Dados ---
        movements.forEach(mov => {
            const row = sheet.addRow([
                new Date(mov.mov_date).toLocaleString('pt-BR'),
                this._formatMovimentTag(mov.moviment_tag),
                mov.description,
                mov.weight_value ? parseFloat(mov.weight_value) : null,
                // Lógica de sinal: Resgates (RE) diminuem saldo visualmente, mas aqui mostramos o valor da operação
                Math.abs(parseFloat(mov.currency_value)) * (mov.moviment_tag === 'RE' ? -1 : 1),
                mov.location_id || '-'
            ]);

            // Formatação Condicional
            const typeCell = row.getCell(2);
            if (mov.moviment_tag === 'RC') typeCell.font = { color: { argb: STYLES.COLORS.EMERALD_TEXT } }; // Reciclagem
            if (mov.moviment_tag === 'RE') typeCell.font = { color: { argb: STYLES.COLORS.RED_TEXT } };     // Resgate
            if (mov.moviment_tag === '_undoDebit') typeCell.font = { color: { argb: STYLES.COLORS.EMERALD_TEXT } };

            const valueCell = row.getCell(5);
            valueCell.numFmt = '"R$ "#,##0.00';
            valueCell.font = { color: { argb: valueCell.value >= 0 ? STYLES.COLORS.EMERALD_TEXT : STYLES.COLORS.RED_TEXT } };
        });

        // Layout
        sheet.columns.forEach(col => { col.width = 20; });
        sheet.getColumn(3).width = 40; // Descrição mais larga

        this._addFooter(sheet, 6);
        return this;
    }

    /**
     * Aplica proteção, cabeçalhos HTTP e envia o arquivo.
     * @param {object} res - Response do Express.
     * @param {string} fileName - Nome do arquivo sem extensão.
     */
    async sendResponse(res, fileName) {
        const excelPassword = process.env.EXCEL_PASSWORD || 'container';

        for (const sheet of this.workbook.worksheets) {
            await sheet.protect(excelPassword, STYLES.PROTECTION);
        }

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=${fileName}.xlsx`);

        await this.workbook.xlsx.write(res);
        res.end();
    }

    // --- MÉTODOS PRIVADOS ---

    /**
     * Adiciona rodapé confidencial.
     * @private
     */
    _addFooter(sheet, mergeCols) {
        const lastRow = sheet.rowCount + 2;
        const range = `A${lastRow}:${sheet.getColumn(mergeCols).letter}${lastRow}`;

        sheet.mergeCells(range);
        const footer = sheet.getCell(`A${lastRow}`);

        const dataHora = new Date().toLocaleString('pt-BR');

        footer.value = `Gerado por: ${this.userName} em ${dataHora}\nDocumento confidencial. Gerado pelo Recicle Hub.`;

        footer.font = { ...STYLES.FONTS.FOOTER, color: { argb: STYLES.COLORS.SLATE_FOOTER } };
        footer.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

        sheet.getRow(lastRow).height = 40;
    }

    /**
     * @private
     */
    _formatMovimentTag(tag) {
        const tags = { 'RC': 'Reciclagem', 'RE': 'Resgate', '_undoDebit': 'Estorno' };
        return tags[tag] || tag;
    }
}

// ==============================================================================
// UTILITÁRIOS
// ==============================================================================

/**
 * Oculta detalhes do erro em produção por segurança.
 * @param {Error} err 
 * @returns {string} Mensagem segura ou detalhada.
 */
const sanitizeError = (err) => {
    return process.env.NODE_ENV === 'production' ? 'Erro interno do servidor' : err.message;
};

// ==============================================================================
// ROTAS DA API
// ==============================================================================

router.use(authenticateToken);

/**
 * @route   GET /api/clients
 * @desc    Lista todos os clientes com paginação e dados agregados
 * @access  Private
 */
router.get('/', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT 
                u.user_id as id, u.name, u.email, u.state as status, u.person_type, u.document_id,
                u.create_date as "joinedDate", u.birth_date, u.phone_number,
                COALESCE(b.balance, 0) as balance, COALESCE(b.recicled_weight, 0) as recycled,
                a.addr, a.addr_number, a.complement, a.district, a.city, a.state_name, a.zip_code
            FROM app_user u
            LEFT JOIN app_user_curr_balance b ON u.user_id = b.user_fk
            LEFT JOIN address a ON u.user_addr_fk = a.addr_id
            ORDER BY u.create_date DESC, u.user_id DESC
        `);

        // Adapter: Converte snake_case do banco para camelCase da API
        const clients = result.rows.map(row => ({
            id: row.id,
            type: row.person_type || 'PF',
            name: row.name || 'Sem Nome',
            email: row.email || 'Sem Email',
            document: row.document_id || '',
            phone: row.phone_number || '',
            balance: parseFloat(row.balance),
            status: row.status === 'active' ? 'Ativo' : 'Inativo',
            recycledKg: parseFloat(row.recycled),
            create_date: row.joinedDate,
            birth_date: row.birth_date,
            address: row.addr ? {
                street: row.addr, number: row.addr_number, complement: row.complement,
                district: row.district, city: row.city, state: row.state_name, zipCode: row.zip_code
            } : null
        }));

        // Filtro de Segurança: Viewer não vê saldo
        if (req.user.role === 'viewer') {
            clients.forEach(c => c.balance = null);
        }

        res.json(clients);
    } catch (err) {
        console.error('Erro ao buscar clientes:', err);
        res.status(500).json({ error: sanitizeError(err) });
    }
});

/**
 * @route   PUT /api/clients/:id
 * @desc    Atualiza informações cadastrais do cliente
 * @access  Private (Admin/Manager)
 */
router.put('/:id', async (req, res) => {
    const { id } = req.params;

    // Segurança: Viewer não pode editar
    if (req.user.role === 'viewer') {
        return res.status(403).json({ error: 'Acesso negado. Consultores não podem editar dados.' });
    }

    // 1. Validação de Payload
    const validation = clientUpdateSchema.safeParse(req.body);
    if (!validation.success) return res.status(400).json({ error: validation.error.errors[0].message });

    const { name, email, status, phone } = validation.data;
    const editorId = req.user.id;
    const editorName = req.user.name || 'Sistema';

    /**
     * Mapeamento seguro: do front (PT-BR) -> valor aceito pelo banco (lowercase english)
     */
    const stateMap = {
        'Ativo': 'active',
        'Inativo': 'inactive'
    };

    try {
        // 2. Busca dados prévios para auditoria (Diff) e estado atual
        const currentClientResult = await db.query('SELECT email, phone_number, state FROM app_user WHERE user_id = $1', [id]);
        const currentClient = currentClientResult.rows[0];

        if (!currentClient) {
            return res.status(404).json({ error: 'Cliente não encontrado.' });
        }

        const currentState = currentClient.state ? currentClient.state.trim() : '';

        // Regra: se já está 'deleted', preservamos o estado independentemente do que o front envie.
        const dbState = currentState === 'deleted' ? 'deleted' : (stateMap[status] || currentState);

        // 3. Persistência — atualiza apenas campos permitidos
        await db.query(`
            UPDATE app_user 
            SET name = $1, email = $2, state = $3, phone_number = $4
            WHERE user_id = $5
        `, [name, email, dbState, phone, id]);

        // 4. Auditoria de alterações sensíveis
        // CORREÇÃO: Função auxiliar para comparar valores ignorando null/undefined/vazio e espaços
        const normalize = (val) => (val || '').toString().trim();

        let updateDetails = [];
        if (currentClient) {
            if (normalize(currentClient.email) !== normalize(email)) updateDetails.push('e-mail');
            if (normalize(currentClient.phone_number) !== normalize(phone)) updateDetails.push('telefone');
        }

        let logMessage = `Atualizou dados do cliente: ${name}`;
        if (updateDetails.length > 0) logMessage = `Atualizou ${updateDetails.join(' e ')} do cliente: ${name}`;

        await logAction(editorId, editorName, 'UPDATE_CLIENT', logMessage);
        res.json({ success: true });
    } catch (err) {
        console.error('Erro ao atualizar cliente:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * @route   POST /api/clients/:id/reset-password
 * @desc    Reseta a senha do cliente para o padrão do sistema
 * @access  Private (Admin)
 */
router.post('/:id/reset-password', async (req, res) => {
    const { id } = req.params;

    // Segurança: Viewer não pode resetar senha
    if (req.user.role === 'viewer') {
        return res.status(403).json({ error: 'Acesso negado. Consultores não podem resetar senhas.' });
    }

    const editorId = req.user.id;
    const editorName = req.user.name || 'Sistema';

    const passHash = process.env.RESET_PASSWORD_HASH;
    const passSalt = process.env.RESET_PASSWORD_SALT;

    if (!passHash || !passSalt) {
        console.error('ERRO CRÍTICO: Variáveis de ambiente de senha não configuradas.');
        return res.status(500).json({ error: 'Configuração de segurança ausente no servidor' });
    }

    try {
        await db.query('UPDATE app_user SET pass_hash = $1, pass_salt = $2 WHERE user_id = $3', [passHash, passSalt, id]);

        const clientResult = await db.query('SELECT name FROM app_user WHERE user_id = $1', [id]);
        const clientName = clientResult.rows[0]?.name || 'Desconhecido';

        await logAction(editorId, editorName, 'RESET_PASSWORD', `Reinicializou senha do cliente: ${clientName}`);
        res.json({ success: true });
    } catch (err) {
        console.error('Erro ao reinicializar senha:', err);
        res.status(500).json({ error: sanitizeError(err) });
    }
});

/**
 * @route   GET /api/clients/:id/report
 * @desc    Gera e baixa um relatório Excel (Perfil + Extrato)
 * @access  Private (Exceto Support)
 */
router.get('/:id/report', async (req, res) => {
    const { id } = req.params;
    const requesterRole = req.user.role;

    // Regra de Negócio: Bloqueio de Perfil
    if (requesterRole === 'support' || requesterRole === 'viewer') {
        return res.status(403).json({ error: 'Acesso negado. Seu perfil não permite baixar este relatório.' });
    }

    try {
        // 1. Coleta de Dados (Perfil)
        const clientResult = await db.query(`
            SELECT 
                u.name, u.email, u.phone_number, u.document_id, u.person_type, u.state as status,
                u.create_date, u.birth_date,
                COALESCE(b.balance, 0) as balance,
                COALESCE(b.recicled_weight, 0) as recycled_weight,
                a.addr, a.addr_number, a.complement, a.district, a.city, a.state_name, a.zip_code
            FROM app_user u
            LEFT JOIN app_user_curr_balance b ON u.user_id = b.user_fk
            LEFT JOIN address a ON u.user_addr_fk = a.addr_id
            WHERE u.user_id = $1
        `, [id]);

        if (clientResult.rows.length === 0) return res.status(404).json({ error: 'Cliente não encontrado.' });
        const client = clientResult.rows[0];

        // 2. Coleta de Dados (Extrato)
        const movementsResult = await db.query(`
            SELECT mov_date, moviment_tag, description, weight_value, currency_value, location_id
            FROM account_movement
            WHERE user_fk = $1
            ORDER BY mov_date DESC
        `, [id]);
        const movements = movementsResult.rows;

        // 3. Auditoria
        const editorId = req.user.id;
        const editorName = req.user.name || 'Sistema';
        await logAction(editorId, editorName, 'GENERATE_REPORT', `Gerou relatório completo do cliente: ${client.name}`);

        // 4. Geração do Arquivo
        const builder = new ClientReportBuilder(req.headers['x-user-name']);
        await builder
            .addProfileSheet(client, id)
            .addStatementSheet(movements)
            .sendResponse(res, `Relatorio_${client.name.replace(/\s+/g, '_')}`);

    } catch (err) {
        console.error('Erro ao gerar relatório do cliente:', err);
        res.status(500).json({ error: 'Erro interno ao gerar relatório.' });
    }
});

module.exports = router;