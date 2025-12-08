/**
 * @file reports.js
 * @description Centraliza a geração de todos os relatórios do sistema (Excel).
 * @requires express, exceljs, db
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const ExcelJS = require('exceljs');
const { logAction } = require('../db');
const { authenticateToken } = require('../auth');

// ==============================================================================
// CONFIGURAÇÕES E CONSTANTES
// ==============================================================================

const STYLES = {
    COLORS: {
        EMERALD_BG: 'FF047857',    // Fundo Verde (700)
        EMERALD_TEXT: 'FF059669',  // Texto Verde (600)
        TEAL_TEXT: 'FF0F766E',     // Texto Azul-Petróleo (700)
        SLATE_BG: 'FF1E293B',      // Fundo Escuro (800)
        SLATE_TITLE: 'FF334155',   // Título (700)
        SLATE_SUBTITLE: 'FF64748B',// Subtítulo (500)
        SLATE_FOOTER: 'FF94A3B8',  // Rodapé (400)
        WHITE_TEXT: 'FFFFFFFF',    // Branco
        RED_TEXT: 'FFDC2626',      // Vermelho Alerta
        GOLD_BG: 'FFFFD700',       // Ranking 1º
        SILVER_BG: 'FFC0C0C0',     // Ranking 2º
        BRONZE_BG: 'FFCD7F32'      // Ranking 3º
    },
    FONTS: {
        TITLE: { name: 'Arial', size: 16, bold: true },
        SUBTITLE: { name: 'Arial', size: 12, bold: true },
        HEADER: { name: 'Arial', size: 11, bold: true },
        DATA: { name: 'Arial', size: 10 },
        DATA_SMALL: { name: 'Arial', size: 9 },
        FOOTER: { name: 'Arial', size: 9 }
    },
    BORDERS: {
        THIN: { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }
    }
};

// ==============================================================================
// CLASSE AUXILIAR (BUILDER PATTERN)
// ==============================================================================

/**
 * Responsável por abstrair a complexidade do ExcelJS.
 * Permite a criação fluida de relatórios com design consistente.
 */
class ExcelBuilder {
    constructor(userName) {
        this.workbook = new ExcelJS.Workbook();
        this.workbook.creator = 'Recicle Hub System';
        this.workbook.created = new Date();
        this.userName = userName || 'Sistema';
        this.sheet = null;
    }

    /**
     * Inicia uma nova aba na planilha.
     */
    createSheet(name, options = {}) {
        const defaultOptions = { views: [{ showGridLines: false }] };
        this.sheet = this.workbook.addWorksheet(name, { ...defaultOptions, ...options });
        return this;
    }

    /**
     * Gera o cabeçalho visual (Logo/Título/Info) nas primeiras 3 linhas.
     */
    addHeader(title, subtitle, info, mergeRange) {
        if (!this.sheet) throw new Error('Planilha não inicializada.');

        // 1. Título Principal (Fundo Verde)
        this.sheet.mergeCells(mergeRange.replace(/1:(\w)1/, '1:$11'));
        const titleCell = this.sheet.getCell(mergeRange.split(':')[0]);
        titleCell.value = title;
        titleCell.font = { ...STYLES.FONTS.TITLE, color: { argb: STYLES.COLORS.WHITE_TEXT } };
        titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STYLES.COLORS.EMERALD_BG } };
        titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
        this.sheet.getRow(1).height = 30;

        // 2. Subtítulo (Nome do Relatório)
        this.sheet.mergeCells(mergeRange.replace(/1:(\w)1/, '2:$12'));
        const subTitleCell = this.sheet.getCell(mergeRange.split(':')[0].replace('1', '2'));
        subTitleCell.value = subtitle;
        subTitleCell.font = { ...STYLES.FONTS.SUBTITLE, color: { argb: STYLES.COLORS.SLATE_TITLE } };
        subTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
        this.sheet.getRow(2).height = 25;

        // 3. Informações (Data/Período)
        this.sheet.mergeCells(mergeRange.replace(/1:(\w)1/, '3:$13'));
        const infoCell = this.sheet.getCell(mergeRange.split(':')[0].replace('1', '3'));
        infoCell.value = info;
        infoCell.font = { name: 'Arial', size: 10, italic: true, color: { argb: STYLES.COLORS.SLATE_SUBTITLE } };
        infoCell.alignment = { horizontal: 'center', vertical: 'middle' };
        this.sheet.getRow(3).height = 20;

        this.sheet.getRow(4).height = 10; // Espaçador
        return this;
    }

    /**
     * Define colunas e ativa o AutoFilter.
     */
    setTableHeaders(headers) {
        const headerRow = this.sheet.getRow(5);
        headerRow.values = headers;
        headerRow.height = 30;

        headerRow.eachCell((cell) => {
            cell.font = { ...STYLES.FONTS.HEADER, color: { argb: STYLES.COLORS.WHITE_TEXT } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STYLES.COLORS.SLATE_BG } };
            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
            cell.border = STYLES.BORDERS.THIN;
        });

        this.sheet.autoFilter = {
            from: { row: 5, column: 1 },
            to: { row: 5, column: headers.length }
        };
        return this;
    }

    /**
     * Itera dados e preenche linhas.
     * @param {Function} styleCallback - Permite estilizar células individualmente (condicional).
     */
    addRows(data, rowMapper, styleCallback) {
        let currentRow = 6;

        if (data.length === 0) {
            const lastCol = this.sheet.getRow(5).cellCount;
            const range = `A${currentRow}:${this.sheet.getColumn(lastCol).letter}${currentRow}`;
            this.sheet.mergeCells(range);
            const cell = this.sheet.getCell(`A${currentRow}`);
            cell.value = 'Nenhum registro encontrado para o período selecionado.';
            cell.alignment = { horizontal: 'center' };
            return this;
        }

        data.forEach((item, index) => {
            const rowValues = rowMapper(item, index);
            const dataRow = this.sheet.getRow(currentRow);
            dataRow.values = rowValues;
            dataRow.height = 20;

            dataRow.eachCell((cell, colNumber) => {
                cell.font = STYLES.FONTS.DATA;
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
                cell.border = STYLES.BORDERS.THIN;

                if (styleCallback) styleCallback(cell, colNumber, rowValues, index);
            });
            currentRow++;
        });
        return this;
    }

    /**
     * Algoritmo para ajustar largura das colunas baseado no conteúdo.
     */
    autoFitColumns() {
        this.sheet.columns.forEach((column) => {
            let maxLen = 0;

            // Varre as células para encontrar o maior conteúdo
            column.eachCell({ includeEmpty: false }, (cell) => {
                let cellValue = '';
                if (cell.value !== null && cell.value !== undefined) {
                    if (typeof cell.value === 'object' && cell.value.richText) {
                        cellValue = cell.value.richText.map(t => t.text).join('');
                    } else if (typeof cell.value === 'object' && cell.value.result) {
                        cellValue = cell.value.result.toString();
                    } else {
                        cellValue = cell.value.toString();
                    }
                }

                let len = cellValue.length;
                if (cell.font && cell.font.bold) len *= 1.2; // Compensação visual para negrito
                if (len > maxLen) maxLen = len;
            });

            // Fórmula: (Caracteres * 1.1) + Buffer. 
            // Min 12 (para não sumir cabeçalho), Max 45 (para não ficar gigante).
            const desiredWidth = (maxLen * 1.1) + 2;
            column.width = Math.min(Math.max(desiredWidth, 12), 45);
        });
        return this; // <--- OBRIGATÓRIO PARA O CHAINING FUNCIONAR
    }

    /**
     * Adiciona o rodapé padrão.
     * Calcula automaticamente a largura baseada na tabela.
     */
    addFooter() {
        const lastRow = this.sheet.lastRow.number; // Pega a última linha usada
        const footerRowIdx = lastRow + 1;

        // Pega a quantidade de colunas baseada na linha de cabeçalho (linha 5)
        // Se não houver cabeçalho, assume 1 coluna
        const lastCol = this.sheet.getRow(5).cellCount || 1;

        const range = `A${footerRowIdx}:${this.sheet.getColumn(lastCol).letter}${footerRowIdx}`;

        this.sheet.mergeCells(range);
        const footer = this.sheet.getCell(`A${footerRowIdx}`);

        const dataHora = new Date().toLocaleString('pt-BR');

        footer.value = `Gerado por: ${this.userName} em ${dataHora}\nDocumento confidencial. Gerado pelo Recicle Hub.`;

        footer.font = { ...STYLES.FONTS.FOOTER, color: { argb: STYLES.COLORS.SLATE_FOOTER } };
        footer.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

        this.sheet.getRow(footerRowIdx).height = 40;

        return this; // <--- OBRIGATÓRIO PARA O CHAINING FUNCIONAR
    }

    async sendResponse(res, fileName) {
        const password = process.env.EXCEL_PASSWORD || 'reciclehub';

        // Proteção que permite ao usuário interagir (ordenar/filtrar/formatar), mas não editar dados
        await this.sheet.protect(password, {
            selectLockedCells: true, selectUnlockedCells: true,
            formatColumns: true, formatRows: true, // Permitir redimensionar
            sort: true, autoFilter: true, // Permitir ordenar e filtrar
            insertRows: false, deleteRows: false
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=${fileName}.xlsx`);
        await this.workbook.xlsx.write(res);
        res.end();
    }
}

// ==============================================================================
// UTILITÁRIOS
// ==============================================================================

const sanitizeError = (err) => {
    return process.env.NODE_ENV === 'production' ? 'Erro ao gerar relatório' : err.message;
};

// ==============================================================================
// ROTAS DA API
// ==============================================================================

router.use(authenticateToken);

/**
 * @route   GET /api/reports/saldo
 * @desc    Relatório financeiro de passivo (saldo dos clientes)
 * @access  Private
 */
router.get('/saldo', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT SUM(balance) as total_balance, COUNT(user_fk) as total_clients 
            FROM app_user_curr_balance WHERE balance > 0
        `);

        // Dados do Usuário (via Token)
        const userId = req.user.id;
        const userName = req.user.name || 'Sistema';

        await logAction(userId, userName, 'GENERATE_REPORT', 'Gerou relatório: Saldo Ativo');

        const { total_balance, total_clients } = result.rows[0];

        const builder = new ExcelBuilder(userName);
        await builder
            .createSheet('Saldo Ativo')
            .addHeader('RECICLE HUB', 'RELATÓRIO: SALDO EM CIRCULAÇÃO', `Gerado em: ${new Date().toLocaleString('pt-BR')}`, 'A1:B1')
            .setTableHeaders(['Saldo Total em Circulação', 'Clientes com Saldo'])
            .addRows(
                [{ bal: parseFloat(total_balance), cli: parseInt(total_clients) }],
                (item) => [item.bal, item.cli],
                (cell, col) => {
                    if (col === 1) {
                        cell.numFmt = '"R$ "#,##0.00';
                        cell.font = { size: 14, bold: true, color: { argb: STYLES.COLORS.EMERALD_TEXT } };
                    }
                }
            )
            .autoFitColumns()
            .addFooter()
            .sendResponse(res, 'saldo_ativo');

    } catch (err) {
        console.error('Erro no relatório de saldo:', err);
        res.status(500).json({ error: sanitizeError(err) });
    }
});

/**
 * @route   GET /api/reports/resgates
 * @desc    Total de resgates agrupados por Loja/Local
 * @access  Private
 */
router.get('/resgates', async (req, res) => {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) return res.status(400).json({ error: 'Parâmetros de data obrigatórios.' });

    try {
        const result = await db.query(`
            SELECT location_id, COUNT(mov_id) as qtd, SUM(ABS(currency_value)) as total_val
            FROM account_movement
            WHERE moviment_tag = 'RE' AND mov_date::date BETWEEN $1 AND $2
            GROUP BY location_id
            ORDER BY total_val DESC
        `, [startDate, endDate]);

        const userName = req.user.name || 'Sistema';
        await logAction(req.user.id, userName, 'GENERATE_REPORT', 'Gerou relatório: Resgates por Loja');

        const period = `${startDate.split('-').reverse().join('/')} a ${endDate.split('-').reverse().join('/')}`;

        const builder = new ExcelBuilder(userName);
        await builder
            .createSheet('Resgates')
            .addHeader('RECICLE HUB', 'RESGATES POR LOJA', `Período: ${period}`, 'A1:C1')
            .setTableHeaders(['Loja', 'Qtd. Transações', 'Valor Total'])
            .addRows(
                result.rows,
                (row) => [row.location_id || 'N/A', parseInt(row.qtd), parseFloat(row.total_val)],
                (cell, col) => {
                    if (col === 3) {
                        cell.numFmt = '"R$ "#,##0.00';
                        cell.font = { bold: true, color: { argb: STYLES.COLORS.RED_TEXT } };
                    }
                }
            )
            .autoFitColumns()
            .addFooter()
            .sendResponse(res, 'resgates_loja');

    } catch (err) {
        console.error('Erro no relatório de resgates:', err);
        res.status(500).json({ error: sanitizeError(err) });
    }
});

/**
 * @route   GET /api/reports/clientes
 * @desc    Relatório completo (Heavy Query) com dados cadastrais e saldo de materiais
 * @access  Private
 */
router.get('/clientes', async (req, res) => {
    try {
        // Query otimizada com Subquery para Pivot de Materiais
        const result = await db.query(`
            SELECT
                u.person_type, u.name, u.email, u.phone_number, u.document_id, u.birth_date, u.state as status, u.create_date,
                b.balance, COALESCE(b.recicled_weight, 0) as total_weight,
                a.addr, a.addr_number, a.district, a.city, a.state_name, a.zip_code,
                COALESCE(mat."Papelão", 0) as papelao, COALESCE(mat."Plástico", 0) as plastico,
                COALESCE(mat."PET", 0) as pet, COALESCE(mat."Alumínio", 0) as aluminio,
                COALESCE(mat."Vidro", 0) as vidro
            FROM app_user u
            LEFT JOIN app_user_curr_balance b ON u.user_id = b.user_fk
            LEFT JOIN address a ON u.user_addr_fk = a.addr_id
            LEFT JOIN (
                SELECT user_fk,
                    SUM(CASE WHEN description = 'PAPELÃO' THEN weight_value ELSE 0 END) as "Papelão",
                    SUM(CASE WHEN description = 'PLÁSTICO' THEN weight_value ELSE 0 END) as "Plástico",
                    SUM(CASE WHEN description = 'PET' THEN weight_value ELSE 0 END) as "PET",
                    SUM(CASE WHEN description = 'ALUMÍNIO' THEN weight_value ELSE 0 END) as "Alumínio",
                    SUM(CASE WHEN description = 'VIDRO' THEN weight_value ELSE 0 END) as "Vidro"
                FROM account_movement WHERE moviment_tag = 'RC' GROUP BY user_fk
            ) mat ON u.user_id = mat.user_fk
            ORDER BY u.name ASC
        `);

        const userName = req.user.name || 'Sistema';
        await logAction(req.user.id, userName, 'GENERATE_REPORT', 'Gerou relatório: Ficha Cadastral Completa');

        const builder = new ExcelBuilder(userName);
        await builder
            .createSheet('Clientes', { views: [{ showGridLines: false, state: 'frozen', ySplit: 5 }] })
            .addHeader('RECICLE HUB', 'FICHA CONSOLIDADA DE CLIENTES', `Gerado em: ${new Date().toLocaleString('pt-BR')}`, 'A1:O1') // Ajustar range
            .setTableHeaders([
                'Nome', 'Tipo', 'Documento', 'Email', 'Telefone', 'Saldo (R$)', 'Total (Kg)',
                'Papelão', 'Plástico', 'PET', 'Alumínio', 'Vidro',
                'Cidade', 'Bairro', 'Cadastro'
            ])
            .addRows(
                result.rows,
                (r) => [
                    r.name, r.person_type, r.document_id, r.email, r.phone_number,
                    parseFloat(r.balance), parseFloat(r.total_weight),
                    parseFloat(r.papelao), parseFloat(r.plastico), parseFloat(r.pet), parseFloat(r.aluminio), parseFloat(r.vidro),
                    r.city, r.district, r.create_date
                ],
                (cell, col, vals) => {
                    cell.font = STYLES.FONTS.DATA_SMALL;
                    // Moeda
                    if (col === 6) {
                        cell.numFmt = '"R$ "#,##0.00';
                        cell.font = { bold: true, color: { argb: vals[5] < 0 ? STYLES.COLORS.RED_TEXT : STYLES.COLORS.EMERALD_TEXT } };
                    }
                    // Pesos
                    if (col >= 7 && col <= 12) cell.numFmt = '#,##0.00';
                    // Data
                    if (col === 15) cell.numFmt = 'dd/mm/yyyy';
                }
            )
            .autoFitColumns()
            .addFooter()
            .sendResponse(res, 'ficha_clientes');

    } catch (err) {
        console.error('Erro na ficha de clientes:', err);
        res.status(500).json({ error: sanitizeError(err) });
    }
});

/**
 * @route   GET /api/reports/transacoes
 * @desc    Extrato linear de todas as movimentações no período
 * @access  Private
 */
router.get('/transacoes', async (req, res) => {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) return res.status(400).json({ error: 'Parâmetros de data obrigatórios.' });

    try {
        const result = await db.query(`
            SELECT am.mov_date, u.name, am.moviment_tag, am.description, am.weight_value, am.currency_value, am.location_id
            FROM account_movement am
            JOIN app_user u ON am.user_fk = u.user_id
            WHERE am.mov_date::date BETWEEN $1 AND $2
            ORDER BY am.mov_date DESC
        `, [startDate, endDate]);

        const userName = req.user.name || 'Sistema';
        await logAction(req.user.id, userName, 'GENERATE_REPORT', 'Gerou relatório: Extrato Geral');

        const builder = new ExcelBuilder(userName);
        await builder
            .createSheet('Transações')
            .addHeader('RECICLE HUB', 'EXTRATO DE MOVIMENTAÇÕES', `Período: ${startDate} a ${endDate}`, 'A1:G1')
            .setTableHeaders(['Data', 'Cliente', 'Tipo', 'Descrição', 'Peso (Kg)', 'Valor (R$)', 'Local'])
            .addRows(
                result.rows,
                (r) => [
                    r.mov_date, r.name,
                    r.moviment_tag === 'RC' ? 'Reciclagem' : (r.moviment_tag === 'RE' ? 'Resgate' : r.moviment_tag),
                    r.description,
                    r.weight_value ? parseFloat(r.weight_value) : null,
                    Math.abs(parseFloat(r.currency_value)) * (r.moviment_tag === 'RE' ? -1 : 1), // Visual negativo para resgate
                    r.location_id
                ],
                (cell, col, vals) => {
                    if (col === 1) cell.numFmt = 'dd/mm/yyyy hh:mm';

                    // Cores por Tipo
                    if (col === 3) {
                        const val = cell.value;
                        if (val === 'Reciclagem') cell.font = { color: { argb: STYLES.COLORS.EMERALD_TEXT }, bold: true };
                        if (val === 'Resgate') cell.font = { color: { argb: STYLES.COLORS.RED_TEXT }, bold: true };
                    }

                    if (col === 6) {
                        cell.numFmt = '"R$ "#,##0.00';
                        cell.font = { color: { argb: vals[5] >= 0 ? STYLES.COLORS.EMERALD_TEXT : STYLES.COLORS.RED_TEXT } };
                    }
                }
            )
            .autoFitColumns()
            .addFooter()
            .sendResponse(res, 'extrato_movimentacoes');

    } catch (err) {
        console.error('Erro no extrato:', err);
        res.status(500).json({ error: sanitizeError(err) });
    }
});

/**
 * @route   GET /api/reports/reciclagem
 * @desc    Panorama de reciclagem por material (peso e valor)
 * @access  Private
 */
router.get('/reciclagem', async (req, res) => {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) return res.status(400).json({ error: 'Parâmetros de data obrigatórios.' });

    try {
        const result = await db.query(`
            SELECT description, COUNT(mov_id) as qtd, SUM(weight_value) as peso, SUM(currency_value) as valor
            FROM account_movement
            WHERE moviment_tag = 'RC' AND mov_date::date BETWEEN $1 AND $2
            GROUP BY description
            ORDER BY peso DESC
        `, [startDate, endDate]);

        const userName = req.user.name || 'Sistema';
        await logAction(req.user.id, userName, 'GENERATE_REPORT', 'Gerou relatório: Panorama de Reciclagem');

        const period = `${startDate.split('-').reverse().join('/')} a ${endDate.split('-').reverse().join('/')}`;

        const builder = new ExcelBuilder(userName);
        await builder
            .createSheet('Panorama')
            .addHeader('RECICLE HUB', 'PANORAMA DE RECICLAGEM', `Período: ${period}`, 'A1:D1')
            .setTableHeaders(['Material', 'Qtd. Entregas', 'Peso Total (Kg)', 'Valor Pago (R$)'])
            .addRows(
                result.rows,
                (row) => [row.description || 'N/A', parseInt(row.qtd), parseFloat(row.peso), parseFloat(row.valor)],
                (cell, col) => {
                    if (col === 3) {
                        cell.numFmt = '#,##0.00';
                        cell.font = { bold: true, color: { argb: STYLES.COLORS.EMERALD_TEXT } };
                    }
                    if (col === 4) {
                        cell.numFmt = '"R$ "#,##0.00';
                        cell.font = { bold: true, color: { argb: STYLES.COLORS.TEAL_TEXT } };
                    }
                }
            )
            .autoFitColumns()
            .addFooter()
            .sendResponse(res, 'panorama_reciclagem');

    } catch (err) {
        console.error('Erro no panorama de reciclagem:', err);
        res.status(500).json({ error: sanitizeError(err) });
    }
});

/**
 * @route   GET /api/reports/ranking
 * @desc    Ranking de usuários por volume reciclado (Gamification)
 * @access  Private
 */
router.get('/ranking', async (req, res) => {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) return res.status(400).json({ error: 'Parâmetros de data obrigatórios.' });

    try {
        const result = await db.query(`
            SELECT u.name, COUNT(am.mov_id) as qtd, SUM(am.weight_value) as peso, SUM(am.currency_value) as valor
            FROM account_movement am
            JOIN app_user u ON am.user_fk = u.user_id
            WHERE am.moviment_tag = 'RC' AND am.mov_date::date BETWEEN $1 AND $2
            GROUP BY u.user_id, u.name
            ORDER BY peso DESC
        `, [startDate, endDate]);

        const userName = req.user.name || 'Sistema';
        await logAction(req.user.id, userName, 'GENERATE_REPORT', 'Gerou relatório: Ranking');

        const builder = new ExcelBuilder(userName);
        await builder
            .createSheet('Ranking')
            .addHeader('RECICLE HUB', 'RANKING DE RECICLADORES', `Top usuários de ${startDate} a ${endDate}`, 'A1:D1')
            .setTableHeaders(['#', 'Cliente', 'Entregas', 'Peso Total (Kg)'])
            .addRows(
                result.rows,
                (r, i) => [i + 1, r.name, parseInt(r.qtd), parseFloat(r.peso)],
                (cell, col, vals, i) => {
                    // Medalhas (Cores de Fundo)
                    if (col === 1) {
                        cell.font = { bold: true };
                        if (i === 0) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STYLES.COLORS.GOLD_BG } };
                        if (i === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STYLES.COLORS.SILVER_BG } };
                        if (i === 2) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STYLES.COLORS.BRONZE_BG } };
                    }
                    if (col === 2) cell.alignment = { horizontal: 'left' };
                    if (col === 4) {
                        cell.numFmt = '#,##0.00';
                        cell.font = { bold: true, color: { argb: STYLES.COLORS.EMERALD_TEXT } };
                    }
                }
            )
            .autoFitColumns()
            .addFooter()
            .sendResponse(res, 'ranking_recicladores');

    } catch (err) {
        console.error('Erro no ranking:', err);
        res.status(500).json({ error: sanitizeError(err) });
    }
});

module.exports = router;