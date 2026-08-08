const mysql = require("mysql2/promise");
require("dotenv").config();

console.log("===== DEBUG VARIABLES =====");
console.log("DB_HOST:", process.env.DB_HOST);
console.log("DB_USER:", process.env.DB_USER);
console.log("DB_PASSWORD existe?:", !!process.env.DB_PASSWORD);
console.log("DB_PASSWORD length:", process.env.DB_PASSWORD ? process.env.DB_PASSWORD.length : 0);
console.log("DB_NAME:", process.env.DB_NAME);
console.log("DB_PORT:", process.env.DB_PORT);
console.log("MYSQL_URL existe?:", !!process.env.MYSQL_URL);
console.log("===========================");

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT) || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  multipleStatements: true,
  timezone: "Z",
  dateStrings: true
});

async function testConnection() {
  try {
    const conn = await pool.getConnection();
    console.log("¡Conexión exitosa a la base de datos MySQL!");
    conn.release();
  } catch (err) {
    console.error("Error al conectar a la base de datos:", err.message);
  }
}

testConnection();

module.exports = pool;