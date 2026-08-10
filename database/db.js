const mysql = require("mysql2/promise");
require("dotenv").config();

// ============================================================
// CONFIGURACIÓN DEL POOL MYSQL
// ============================================================

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT) || 3306,

    // Pool
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT) || 10,
    maxIdle: Number(process.env.DB_MAX_IDLE) || 10,
    idleTimeout: Number(process.env.DB_IDLE_TIMEOUT) || 60000,
    queueLimit: 0,

    // Mantener conexiones activas
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,

    // Permitir múltiples sentencias SQL
    // IMPORTANTE para algunas operaciones de restauración.
    multipleStatements: true,

    // Zona horaria
    timezone: "Z",

    // Devolver fechas como strings
    dateStrings: true
});

// ============================================================
// PRUEBA DE CONEXIÓN
// ============================================================

async function testConnection() {

    let conn = null;

    try {

        console.log("🔄 Probando conexión con MySQL...");

        conn = await pool.getConnection();

        // Hacer una consulta real
        await conn.query("SELECT 1 AS conexion");

        console.log("✅ Conexión exitosa a la base de datos");
        console.log(`📡 Host: ${process.env.DB_HOST}`);
        console.log(`🗄️ Base de datos: ${process.env.DB_NAME}`);
        console.log(`🔌 Puerto: ${process.env.DB_PORT || 3306}`);

    } catch (err) {

        console.error(
            "❌ Error al conectar a la base de datos:"
        );

        console.error(err.message);

    } finally {

        if (conn) {
            conn.release();
        }
    }
}

// Ejecutar prueba
testConnection();

// ============================================================
// EXPORTAR POOL
// ============================================================

module.exports = pool;