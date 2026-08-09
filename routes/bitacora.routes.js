const express = require("express");
const router = express.Router();
const pool = require("../database/db");
const path = require("path");
const fs = require("fs");

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
// GET /bitacora/parametros/backup - Generar respaldo nativo de la BD
// ============================================================
router.get("/parametros/backup", async (req, res) => {
  try {
    const idUsuario = req.user?.ID_USUARIO || 1;
    const nombreUsuario = req.user?.USUARIO || "ADMIN_SYSTEM";

    const dbConfig = {
      database: process.env.DB_NAME || "Roca_Maya"
    };

    const timestampRespaldo = new Date().toISOString()
      .replace(/T/, '_')
      .replace(/\..+/, '')
      .replace(/:/g, '-');
      
    const archivoRespaldoSql = `backup_rocamaya_${timestampRespaldo}.sql`;
    const rutaTemporalBackup = path.join(__dirname, "../", archivoRespaldoSql);

    console.log(`🔄 Generando backup nativo de la base de datos: ${dbConfig.database}`);

    let contenidoSql = `-- Respaldo de base de datos generado por Sistema Roca Maya\n`;
    contenidoSql += `-- Fecha: ${new Date().toISOString()}\n`;
    contenidoSql += `-- Base de datos: ${dbConfig.database}\n\n`;
    contenidoSql += `SET FOREIGN_KEY_CHECKS = 0;\n\n`;

    // 1. Obtener todas las tablas
    const [tablas] = await pool.query(`SHOW TABLES`);
    const keyName = Object.keys(tablas[0])[0];

    for (const row of tablas) {
      const nombreTabla = row[keyName];

      // Estructura de la tabla
      const [createTableResult] = await pool.query(`SHOW CREATE TABLE \`${nombreTabla}\``);
      const createSql = createTableResult[0]['Create Table'];

      contenidoSql += `DROP TABLE IF EXISTS \`${nombreTabla}\`;\n`;
      contenidoSql += `${createSql};\n\n`;

      // Datos de la tabla
      const [registrosTabla] = await pool.query(`SELECT * FROM \`${nombreTabla}\``);
      
      if (registrosTabla.length > 0) {
        for (const reg of registrosTabla) {
          const columnas = Object.keys(reg).map(c => `\`${c}\``).join(', ');
          const valores = Object.values(reg).map(val => {
            if (val === null) return 'NULL';
            if (typeof val === 'number') return val;
            if (val instanceof Date) return `'${val.toISOString().slice(0, 19).replace('T', ' ')}'`;
            return `'${String(val).replace(/'/g, "''").replace(/\\/g, "\\\\")}'`;
          }).join(', ');

          contenidoSql += `INSERT INTO \`${nombreTabla}\` (${columnas}) VALUES (${valores});\n`;
        }
        contenidoSql += `\n`;
      }
    }

    contenidoSql += `SET FOREIGN_KEY_CHECKS = 1;\n`;

    fs.writeFileSync(rutaTemporalBackup, contenidoSql, 'utf8');

    const stats = fs.statSync(rutaTemporalBackup);

    if (stats.size > 0) {
      console.log(`✅ Backup generado exitosamente: ${archivoRespaldoSql} (${stats.size} bytes)`);

      res.download(rutaTemporalBackup, archivoRespaldoSql, async (downloadError) => {
        try {
          if (fs.existsSync(rutaTemporalBackup)) {
            fs.unlinkSync(rutaTemporalBackup);
          }
        } catch (fsErr) {
          console.error("Error al limpiar archivo temporal:", fsErr);
        }

        if (!downloadError) {
          try {
            await pool.query(
              `INSERT INTO tbl_ms_bitacora 
                 (FECHA_HORA, ID_USUARIO, ACCION, DESCRIPCION, MODULO)
               VALUES (NOW(), ?, ?, ?, ?)`,
              [
                idUsuario,
                "BACKUP_BD",
                `El usuario ${nombreUsuario} generó el respaldo nativo: ${archivoRespaldoSql}`,
                "CONFIGURACION"
              ]
            );
          } catch (bitacoraError) {
            console.error("Error al registrar respaldo en bitácora:", bitacoraError);
          }
        }
      });
      return;
    } else {
      throw new Error("El archivo de respaldo generado está vacío.");
    }

  } catch (error) {
    console.error("❌ Error en backup nativo:", error);
    res.status(500).send("Error al generar el respaldo: " + error.message);
  }
});

// ============================================================
// POST /bitacora/gestion (Activar, Pausar, Limpiar)
// ============================================================
router.post('/gestion', async (req, res) => {
  try {
    const { accion, usuario } = req.body; 
    const usuarioMod = usuario || 'SISTEMA';

    if (!['ACTIVAR', 'PAUSAR', 'LIMPIAR'].includes(accion)) {
      return res.status(400).json({ ok: false, mensaje: 'Acción inválida.' });
    }

    const [resultado] = await pool.query(
      'CALL SP_GESTIONAR_BITACORA(?, ?)', 
      [accion, usuarioMod]
    );

    const respuestaSP = resultado[0][0];

    if (respuestaSP.RESULTADO === 'EXITO') {
      return res.json({ ok: true, mensaje: respuestaSP.MENSAJE });
    } else {
      return res.status(400).json({ ok: false, mensaje: respuestaSP.MENSAJE });
    }

  } catch (error) {
    console.error('Error en la gestión de bitácora:', error);
    return res.status(500).json({ ok: false, mensaje: 'Error interno del servidor: ' + error.message });
  }
});

module.exports = router;