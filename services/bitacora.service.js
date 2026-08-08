const pool = require("../database/db");

async function registrarBitacora({
  usuario,
  accion,
  descripcion,
  modulo = "AUTENTICACIÓN",
  idRegistro = null,
  tabla = null,
  estado = "ÉXITO",
  detalleError = null,
  req = null,
}) {
  try {
    // 1. Verificar si la bitácora está activa en los parámetros del sistema
    const [param] = await pool.query(
      "SELECT VALOR FROM TBL_MS_PARAMETROS WHERE PARAMETRO = 'BITACORA_ACTIVA'"
    );

    // Si el parámetro existe y su valor es '0', está pausada: salimos inmediatamente sin hacer nada
    if (param.length > 0 && param[0].VALOR === '0') {
      return; 
    }

    let idUsuario = null;

    // Buscar el ID del usuario
    if (usuario && typeof usuario === "string") {
      const [rows] = await pool.query(
        "SELECT ID_USUARIO FROM TBL_MS_USUARIO WHERE USUARIO = ?",
        [usuario]
      );
      if (rows.length) idUsuario = rows[0].ID_USUARIO;
    } else if (typeof usuario === "number") {
      idUsuario = usuario;
    }

    // Si no se encontró usuario, usar el admin por defecto
    if (!idUsuario) {
      const [sys] = await pool.query(
        "SELECT ID_USUARIO FROM TBL_MS_USUARIO WHERE USUARIO = 'ADMIN'"
      );
      idUsuario = sys && sys.length ? sys[0].ID_USUARIO : 1;
    }

    // Obtener IP y navegador (si hay req)
    const ipCliente = req
      ? req.ip ||
        req.headers["x-forwarded-for"] ||
        req.connection.remoteAddress
      : "127.0.0.1";

    const userAgent = req
      ? req.get("User-Agent") || "Desconocido"
      : "Sistema";

    // 2. Registrar en la bitácora mediante el procedimiento almacenado
    await pool.query(
      "CALL SP_REGISTRAR_BITACORA(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        idUsuario,
        accion,
        descripcion,
        modulo,
        idRegistro,
        tabla,
        ipCliente,
        userAgent,
        estado,
        detalleError,
        "SISTEMA_WEB",
      ]
    );
  } catch (err) {
    console.error("bitacora error:", err);
  }
}

module.exports = { registrarBitacora };