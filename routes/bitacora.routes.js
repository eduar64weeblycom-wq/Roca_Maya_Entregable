const express = require("express");
const router = express.Router();
const pool = require("../database/db");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const upload = multer({ dest: "uploads/" });
// ============================================================
// GET /bitacora - Página principal de bitácora
// ============================================================
router.get("/", async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT b.FECHA_HORA, u.USUARIO, b.ACCION, b.DESCRIPCION, b.MODULO
      FROM tbl_ms_bitacora b
      LEFT JOIN tbl_ms_usuario u ON b.ID_USUARIO = u.ID_USUARIO
      ORDER BY b.FECHA_HORA DESC LIMIT 50
    `);

    const [paramRows] = await pool.query(`
      SELECT VALOR FROM tbl_ms_parametros WHERE PARAMETRO = 'BITACORA_ACTIVA'
    `);

    const bitacoraPausada = paramRows.length > 0 ? paramRows[0].VALOR === '0' : false;

    res.render("bitacora", { 
      registros: rows, 
      bitacoraPausada: bitacoraPausada 
    });
  } catch (error) {
    console.error(" Error al cargar bitácora:", error);
    res.status(500).send("Error al cargar la bitácora");
  }
});

// ============================================================
// GET /bitacora/parametros - Página de parámetros
// ============================================================
router.get("/parametros", async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT ID_PARAMETRO, PARAMETRO, VALOR, DESCRIPCION
      FROM tbl_ms_parametros
      ORDER BY ID_PARAMETRO
    `);

    console.log(" Parámetros encontrados:", rows.length);
    res.render("parametros", { parametros: rows });
  } catch (error) {
    console.error(" Error al cargar parámetros:", error);
    res.status(500).send("Error al cargar los parámetros");
  }
});

// ============================================================
// POST /bitacora/parametros/guardar
// ============================================================
router.post("/parametros/guardar", async (req, res) => {
  try {
    const { parametros } = req.body;
    const idUsuario = req.user?.ID_USUARIO || 1;
    const nombreUsuario = req.user?.USUARIO || "ADMIN";

    if (!parametros || !Array.isArray(parametros)) {
      return res.json({ ok: false, mensaje: "Datos inválidos" });
    }

    for (const p of parametros) {
      await pool.query(
        "UPDATE tbl_ms_parametros SET VALOR = ?, FECHA_MODIFICACION = NOW(), USUARIO_MODIFICACION = ? WHERE ID_PARAMETRO = ?",
        [p.valor, nombreUsuario, p.id]
      );

      await pool.query(
        `INSERT INTO tbl_ms_bitacora (FECHA_HORA, ID_USUARIO, ACCION, DESCRIPCION, MODULO)
         VALUES (NOW(), ?, ?, ?, ?)`,
        [
          idUsuario,
          "ACTUALIZACION_PARAMETRO",
          `El usuario ${nombreUsuario} actualizó el parámetro ID ${p.id} a: ${p.valor}`,
          "CONFIGURACION"
        ]
      );
    }

    res.json({ ok: true, mensaje: "Todos los parámetros guardados correctamente" });
    
  } catch (err) {
    console.error(" Error guardar parámetros:", err);
    res.json({ ok: false, mensaje: "Error al guardar los parámetros: " + err.message });
  }
});

// ============================================================
// POST /bitacora/parametros/update
// ============================================================
router.post("/parametros/update", async (req, res) => {
  try {
    const { id, valor, usuario } = req.body;

    await pool.query(
      `UPDATE tbl_ms_parametros 
       SET VALOR = ?, FECHA_MODIFICACION = NOW(), USUARIO_MODIFICACION = ? 
       WHERE ID_PARAMETRO = ?`,
      [valor, usuario || 'system', id]
    );

    res.json({ ok: true });
  } catch (error) {
    console.error(" Error actualizar parámetro:", error);
    res.json({ ok: false, mensaje: "Error al actualizar el parámetro" });
  }
});

// ============================================================
// POST /bitacora/parametros/restore - Restaurar base de datos desde un archivo SQL
// ============================================================
router.post("/parametros/restore", upload.single("backup"), async (req, res) => {
  let connection;
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, mensaje: "No se ha proporcionado ningún archivo de respaldo." });
    }

    const archivoRuta = req.file.path;
    const contenidoSql = fs.readFileSync(archivoRuta, "utf8");

    // Eliminar archivo temporal inmediatamente
    fs.unlinkSync(archivoRuta);

    connection = await pool.getConnection();
    await connection.beginTransaction();

    await connection.query("SET FOREIGN_KEY_CHECKS = 0;");

    const sentencias = contenidoSql
      .split(/;\s*$/m)
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith("--"));

    for (const sentencia of sentencias) {
      if (sentencia) {
        await connection.query(sentencia);
      }
    }

    await connection.query("SET FOREIGN_KEY_CHECKS = 1;");
    await connection.commit();

    const idUsuario = req.user?.ID_USUARIO || 1;
    const nombreUsuario = req.user?.USUARIO || "ADMIN";
    await pool.query(
      `INSERT INTO tbl_ms_bitacora (FECHA_HORA, ID_USUARIO, ACCION, DESCRIPCION, MODULO)
       VALUES (NOW(), ?, ?, ?, ?)`,
      [idUsuario, "RESTAURACION_BD", `El usuario ${nombreUsuario} restauró la base de datos exitosamente.`, "CONFIGURACION"]
    );

    return res.json({ ok: true, mensaje: "Base de datos restaurada exitosamente." });

  } catch (error) {
    if (connection) {
      try { await connection.rollback(); } catch (e) {}
    }
    console.error("❌ Error en la restauración de la base de datos:", error);
    return res.status(500).json({ ok: false, mensaje: "Error al restaurar la base de datos: " + error.message });
  } finally {
    if (connection) connection.release();
  }
});
// ============================================================
// POST /bitacora/gestion (Activar, Pausar, Limpiar)
// ============================================================
router.post('/gestion', async (req, res) => {
  try {
    const { accion, usuario } = req.body;
    const usuarioMod = usuario || req.user?.USUARIO || 'SISTEMA';

    if (!['ACTIVAR', 'PAUSAR', 'LIMPIAR'].includes(accion)) {
      return res.status(400).json({ ok: false, mensaje: 'Acción inválida.' });
    }

    let mensaje = '';

    // ==================== ACTIVAR ====================
    if (accion === 'ACTIVAR') {
      const [update] = await pool.query(`
        UPDATE tbl_ms_parametros 
        SET VALOR = '1', 
            USUARIO_MODIFICACION = ?, 
            FECHA_MODIFICACION = NOW()
        WHERE PARAMETRO = 'BITACORA_ACTIVA'
      `, [usuarioMod]);

      if (update.affectedRows === 0) {
        await pool.query(`
          INSERT INTO tbl_ms_parametros 
          (PARAMETRO, VALOR, DESCRIPCION, USUARIO_MODIFICACION, FECHA_MODIFICACION)
          VALUES ('BITACORA_ACTIVA', '1', 'Indica si la bitácora está activa (1) o pausada (0)', ?, NOW())
        `, [usuarioMod]);
      }

      mensaje = 'Bitácora activada correctamente.';
    }

    // ==================== PAUSAR ====================
    else if (accion === 'PAUSAR') {
      const [update] = await pool.query(`
        UPDATE tbl_ms_parametros 
        SET VALOR = '0', 
            USUARIO_MODIFICACION = ?, 
            FECHA_MODIFICACION = NOW()
        WHERE PARAMETRO = 'BITACORA_ACTIVA'
      `, [usuarioMod]);

      if (update.affectedRows === 0) {
        await pool.query(`
          INSERT INTO tbl_ms_parametros 
          (PARAMETRO, VALOR, DESCRIPCION, USUARIO_MODIFICACION, FECHA_MODIFICACION)
          VALUES ('BITACORA_ACTIVA', '0', 'Indica si la bitácora está activa (1) o pausada (0)', ?, NOW())
        `, [usuarioMod]);
      }

      mensaje = 'Bitácora pausada correctamente.';
    }

    // ==================== LIMPIAR / VACIAR ====================
    else if (accion === 'LIMPIAR') {
      // Borra TODOS los registros de la bitácora
      const [result] = await pool.query(`DELETE FROM tbl_ms_bitacora`);
      mensaje = `Bitácora vaciada. Se eliminaron ${result.affectedRows} registros.`;
    }

    // Registrar la acción en la bitácora (solo si no estamos vaciando)
    if (accion !== 'LIMPIAR') {
      try {
        await pool.query(`
          INSERT INTO tbl_ms_bitacora (FECHA_HORA, ID_USUARIO, ACCION, DESCRIPCION, MODULO)
          VALUES (NOW(), ?, ?, ?, ?)
        `, [
          req.user?.ID_USUARIO || 1,
          `BITACORA_${accion}`,
          `El usuario ${usuarioMod} ejecutó la acción: ${accion}`,
          'CONFIGURACION'
        ]);
      } catch (e) {
        console.error('No se pudo registrar en bitácora:', e.message);
      }
    }

    return res.json({ ok: true, mensaje });

  } catch (error) {
    console.error('Error en la gestión de bitácora:', error);
    return res.status(500).json({ 
      ok: false, 
      mensaje: 'Error interno del servidor: ' + error.message 
    });
  }
});

module.exports = router;