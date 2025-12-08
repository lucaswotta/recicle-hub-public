/**
 * @file db.js
 * @description Gerenciador de Conexão com Banco de Dados (Híbrido: PostgreSQL + Oracle).
 * * FUNCIONALIDADES:
 * 1. PostgreSQL: Implementa padrão 'Bastion Host' via SSH Tunnel.
 * 2. Oracle: Conexão direta (Native ou Thin mode) para gestão de usuários e logs.
 * * @requires pg, ssh2, net, fs, dotenv, oracledb
 */

require('dotenv').config();
const { Client: SSHClient } = require('ssh2');
const { Pool } = require('pg');
const oracledb = require('oracledb');
const fs = require('fs');
const net = require('net');

// Variáveis globais de conexão
const sshClient = new SSHClient();
let pgPool = null;
let oraclePool = null;

// ==============================================================================
// CONFIGURAÇÃO DO ORACLE
// ==============================================================================

// Configura o driver para retornar objetos JS (ex: { ID: 1 }) ao invés de arrays
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
// Auto-commit habilitado por padrão facilita operações simples
oracledb.autoCommit = true;

// Tenta habilitar o modo Thin (não requer instalação de binários do Instant Client)
try {
    if (process.env.ORACLE_LIB_DIR) {
        oracledb.initOracleClient({ libDir: process.env.ORACLE_LIB_DIR });
    } else {
        // Modo Thin é o padrão nas versões recentes do node-oracledb
        // console.log('ℹ️  Usando driver Oracle em modo Thin (padrão)');
    }
} catch (err) {
    console.error('⚠️  Aviso: Falha ao inicializar cliente Oracle:', err.message);
}

const oracleConfig = {
    user: process.env.ORACLE_USER,
    password: process.env.ORACLE_PASSWORD,
    connectString: `${process.env.ORACLE_HOST}:${process.env.ORACLE_PORT}/${process.env.ORACLE_SERVICE}`,
    poolMin: 2,
    poolMax: 10,
    poolIncrement: 1
};

// ==============================================================================
// CONFIGURAÇÕES SSH E POSTGRES
// ==============================================================================

const sshConfig = {
    host: process.env.SSH_HOST,
    port: parseInt(process.env.SSH_PORT || '22'),
    username: process.env.SSH_USER,
    // Tenta ler a chave apenas se o caminho estiver definido
    privateKey: process.env.SSH_KEY_PATH ? fs.readFileSync(process.env.SSH_KEY_PATH) : null,
    passphrase: process.env.SSH_PASSPHRASE
};

const dbConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    host: '127.0.0.1' // Conectamos ao localhost, o túnel redireciona
};

// ==============================================================================
// GERENCIAMENTO DE CONEXÃO
// ==============================================================================

/**
 * Inicializa as conexões (SSH -> Postgres) e (Oracle Direto).
 */
async function connect() {
    console.log('🔌 Iniciando infraestrutura de banco de dados...');

    // 1. Conexão Oracle (Assíncrona e independente do SSH)
    try {
        if (oracleConfig.user && oracleConfig.password) {
            console.log('🔮 Conectando ao Oracle Database...');
            await oracledb.createPool(oracleConfig);
            console.log('✅ Oracle conectado com sucesso!');
        } else {
            console.warn('⚠️  Credenciais Oracle ausentes. Módulos de Usuário/Log podem falhar.');
        }
    } catch (err) {
        console.error('❌ Erro crítico ao conectar no Oracle:', err.message);
        // Não lançamos erro fatal aqui para permitir que o sistema inicie caso use apenas PG em algumas partes
    }

    // 2. Conexão Postgres via SSH Tunnel
    if (!sshConfig.privateKey) {
        console.error('❌ ERRO CRÍTICO: Chave SSH não encontrada em', process.env.SSH_KEY_PATH);
        return;
    }

    return new Promise((resolve, reject) => {
        sshClient.on('ready', () => {
            console.log('✅ SSH: Túnel estabelecido com sucesso!');

            // Cria servidor TCP local para encaminhamento
            const server = net.createServer((sock) => {
                sshClient.forwardOut(
                    sock.remoteAddress, sock.remotePort,
                    process.env.DB_HOST, parseInt(process.env.DB_PORT),
                    (err, stream) => {
                        if (err) {
                            console.error('❌ SSH Forwarding Error:', err);
                            return sock.end();
                        }
                        sock.pipe(stream).pipe(sock);
                    }
                );
            });

            // Ouve em porta aleatória disponível
            server.listen(0, '127.0.0.1', () => {
                const localPort = server.address().port;
                // console.log(`🚇 Túnel mapeado: 127.0.0.1:${localPort} -> ${process.env.DB_HOST}`);

                // Configura Pool PG usando a porta do túnel
                pgPool = new Pool({
                    ...dbConfig,
                    port: localPort,
                    max: 20,
                    min: 2,
                    idleTimeoutMillis: 30000,
                    connectionTimeoutMillis: 5000
                });

                pgPool.on('error', (err) => {
                    console.error('❌ Erro inesperado no pool PG:', err);
                });

                // Teste de vida (Ping)
                pgPool.query('SELECT NOW() as agora')
                    .then(res => {
                        console.log(`🐘 PostgreSQL conectado! Time: ${res.rows[0].agora}`);
                        resolve(pgPool);
                    })
                    .catch(err => {
                        console.error('❌ Falha no handshake PG:', err);
                        reject(err);
                    });
            });
        });

        sshClient.on('error', (err) => {
            console.error('❌ Erro na conexão SSH:', err);
            reject(err);
        });

        try {
            sshClient.connect(sshConfig);
        } catch (error) {
            reject(error);
        }
    });
}

// ==============================================================================
// WRAPPERS DE QUERY
// ==============================================================================

/**
 * Executa SQL no PostgreSQL (Via Túnel SSH).
 * @param {string} text - Query SQL ($1, $2...).
 * @param {Array} params - Parâmetros.
 */
const query = (text, params) => {
    if (!pgPool) throw new Error('Postgres não inicializado. Chame connect() primeiro.');
    return pgPool.query(text, params);
};

/**
 * Executa SQL no Oracle Database.
 * @param {string} text - Query SQL (:param1, :param2...).
 * @param {Object|Array} params - Parâmetros de bind.
 * @param {Object} options - Opções adicionais (ex: autoCommit).
 */
const oracleQuery = async (text, params = {}, options = {}) => {
    let connection;
    try {
        connection = await oracledb.getConnection(); // Pega do pool padrão

        // Garante formatação de objeto (linhas como objetos JSON)
        if (!options.outFormat) options.outFormat = oracledb.OUT_FORMAT_OBJECT;

        const result = await connection.execute(text, params, options);
        return result;
    } catch (err) {
        console.error('❌ Erro na execução Oracle SQL:', err);
        throw err;
    } finally {
        if (connection) {
            try {
                await connection.close(); // Devolve ao pool
            } catch (err) {
                console.error('❌ Erro ao fechar conexão Oracle:', err);
            }
        }
    }
};

// ==============================================================================
// SISTEMA DE LOGS / AUDITORIA (MIGRADO PARA ORACLE)
// ==============================================================================

/**
 * Registra ações do sistema na tabela de logs.
 * Tabela: VITRUVIO.RECICLEHUB_APP_LOG
 */
async function logAction(userId, userName, action, details) {
    try {
        const uid = userId ? parseInt(userId) : null;

        // Inserção com Bind Parameters nomeados
        await oracleQuery(`
            INSERT INTO VITRUVIO.RECICLEHUB_APP_LOG 
            (USER_ID, USER_NAME, ACTION, DETAILS, CREATED_AT)
            VALUES 
            (:uid, :userName, :action, :details, CURRENT_TIMESTAMP)
        `, {
            uid: uid,
            userName: userName,
            action: action,
            details: details
        });

        // Rotina de limpeza probabilística (1% de chance a cada log)
        // Remove logs antigos mantendo apenas os 50.000 mais recentes
        if (Math.random() < 0.01) {
            console.log('🧹 Manutenção: Limpando logs antigos no Oracle...');
            await oracleQuery(`
                DELETE FROM VITRUVIO.RECICLEHUB_APP_LOG 
                WHERE LOG_ID NOT IN (
                    SELECT LOG_ID FROM (
                        SELECT LOG_ID FROM VITRUVIO.RECICLEHUB_APP_LOG 
                        ORDER BY CREATED_AT DESC
                    ) WHERE ROWNUM <= 50000
                )
            `);
        }
    } catch (err) {
        // Logs não devem travar a aplicação, apenas reportar erro no console
        console.error('[ERRO AUDITORIA] Falha ao persistir log:', err.message);
    }
}

module.exports = { connect, query, oracleQuery, logAction };