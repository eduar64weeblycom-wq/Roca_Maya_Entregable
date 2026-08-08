const mysql = require("mysql2/promise");
require("dotenv").config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "yair2003",
  database: process.env.DB_NAME || "Roca_Maya", 
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
    console.log("MySQL pool connected");
    conn.release();
  } catch (err) {
    console.error("MySQL connection error:", err.message);
  }
}

testConnection();

module.exports = pool;
