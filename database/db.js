const mysql = require("mysql2/promise");
require("dotenv").config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || "mysql.railway.internal",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "jWgLAGkmXFfYUhaoYKGGAxBUYLCUQsAk",
  database: process.env.DB_NAME || "railway", 
  port: Number(process.env.DB_PORT) || 3306,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT) || 10,
  maxIdle: 10,
  idleTimeout: 60000,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  multipleStatements: true,
  timezone: 'Z',
  dateStrings: true
});

async function testConnection() {
  try {
    const conn = await pool.getConnection();
    console.log("¡Conexión exitosa a la base de datos MySQL en Railway!");
    conn.release();
  } catch (err) {
    console.error("Error al conectar a la base de datos:", err.message);
  }
}

testConnection();

module.exports = pool;