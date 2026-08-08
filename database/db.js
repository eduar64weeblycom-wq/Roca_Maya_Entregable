const mysql = require("mysql2/promise");
require("dotenv").config();

// Obtener la contraseña priorizando las variables reales de Railway y descartando textos literales
const getPassword = () => {
  const pwd = process.env.DB_PASSWORD || process.env.MYSQL_ROOT_PASSWORD || process.env.MYSQLPASSWORD;
  if (!pwd || pwd.includes("el_valor_de")) {
    return "jWgLAGkmXFfYUhaoYKGGAxBUYLCUQsAk";
  }
  return pwd;
};

const getUser = () => {
  const user = process.env.DB_USER || process.env.MYSQLUSER;
  if (!user || user.includes("el_valor_de")) {
    return "root";
  }
  return user;
};

const getHost = () => {
  const host = process.env.DB_HOST || process.env.MYSQLHOST;
  if (!host || host.includes("el_valor_de")) {
    return "mysql.railway.internal";
  }
  return host;
};

const pool = mysql.createPool({
  host: getHost(),
  user: getUser(),
  password: getPassword(),
  database: process.env.DB_NAME || process.env.MYSQLDATABASE || "railway", 
  port: Number(process.env.DB_PORT || process.env.MYSQLPORT) || 3306,
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