const express = require("express");
const router = express.Router();
const pool = require("../database/db");
const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");

// ============================================================
// GET /bitacora - Página principal de bitácora
// ============================================================
router.get("/", async (req, res) => {
  try {
    // 1. Obtener los registros de la bitácora
    const [rows] = await pool.query(`
      SELECT b.FECHA_HORA, u.USUARIO, b.ACCION, b.DESCRIPCION, b.MODULO
      FROM tbl_ms_bitacora b
      LEFT JOIN tbl_ms_usuario u ON b.ID_USUARIO = u.ID_USUARIO
      ORDER BY b.FECHA_HORA DESC LIMIT 50
    `);

    // 2. Consultar el estado actual del parámetro de la bitácora
    const [paramRows] = await pool.query(`
      SELECT VALOR FROM tbl_ms_PARAMETROS WHERE PARAMETRO = 'BITACORA_ACTIVA'
    `);

    // Si el valor es '0', está pausada. Si es '1' o no existe, está activa.
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
      FROM tbl_ms_PARAMETROS
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
        "UPDATE tbl_ms_PARAMETROS SET VALOR = ?, FECHA_MODIFICACION = NOW(), USUARIO_MODIFICACION = ? WHERE ID_PARAMETRO = ?",
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
      `UPDATE tbl_ms_PARAMETROS 
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
// GET /bitacora/parametros/backup - Generar respaldo de la BD
// ============================================================
router.get("/parametros/backup", async (req, res) => {
  try {
    const idUsuario = req.user?.ID_USUARIO || 1;
    const nombreUsuario = req.user?.USUARIO || "ADMIN_SYSTEM";

    const dbConfig = {
      host: process.env.DB_HOST || "localhost",
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD || "",
      database: process.env.DB_NAME || "Roca_Maya"
    };

    // ========== 1. Intentar obtener la ruta desde parámetros ==========
    let rutaMysqldump = null;

try {
  const [paramRows] = await pool.query(
    "SELECT VALOR FROM tbl_ms_PARAMETROS WHERE PARAMETRO = 'RUTA_MYSQLDUMP' LIMIT 1"
  );

  console.log(">>> Resultado SQL RUTA_MYSQLDUMP:", paramRows);

  if (paramRows.length > 0 && paramRows[0].VALOR) {
    let rutaParametro = String(paramRows[0].VALOR).trim();

    // Quitar comillas si las hubiera
    rutaParametro = rutaParametro.replace(/^["']|["']$/g, "").trim();

    console.log(">>> Ruta limpia:", rutaParametro);
    console.log(">>> ¿Existe?:", fs.existsSync(rutaParametro));

    if (fs.existsSync(rutaParametro)) {
      rutaMysqldump = rutaParametro;
      console.log("✅ Usando ruta del parámetro:", rutaMysqldump);
    } else {
      console.warn("⚠️ El archivo NO existe en esa ruta");
    }
  } else {
    console.warn("⚠️ Parámetro RUTA_MYSQLDUMP vacío o no encontrado");
  }
} catch (err) {
  console.error("Error leyendo RUTA_MYSQLDUMP:", err.message);
}
    // ========== 2. Si no hay parámetro válido, buscar automáticamente ==========
    if (!rutaMysqldump) {
      function encontrarMysqldump() {
        const rutas = [
          // Rutas más comunes de MySQL instalado normal
          "C:\\Program Files\\MySQL\\MySQL Server 8.4\\bin\\mysqldump.exe",
          "C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysqldump.exe",
          "C:\\Program Files\\MySQL\\MySQL Server 9.0\\bin\\mysqldump.exe",
          "C:\\Program Files\\MySQL\\MySQL Server 5.7\\bin\\mysqldump.exe",
          "C:\\Program Files (x86)\\MySQL\\MySQL Server 5.7\\bin\\mysqldump.exe",
          // XAMPP / WAMP / Laragon (por si acaso)
          "C:\\xampp\\mysql\\bin\\mysqldump.exe",
          "C:\\wamp64\\bin\\mysql\\mysql8.0.31\\bin\\mysqldump.exe",
          "C:\\laragon\\bin\\mysql\\mysql-8.0.30-winx64\\bin\\mysqldump.exe",
          // MySQL Workbench
          "C:\\Program Files\\MySQL\\MySQL Workbench 8.0\\mysqldump.exe",
        ];

        for (const ruta of rutas) {
          if (fs.existsSync(ruta)) {
            console.log(`✅ mysqldump encontrado automáticamente: ${ruta}`);
            return ruta;
          }
        }

        // Último intento: buscar en el PATH del sistema
        try {
          const { execSync } = require("child_process");
          const resultado = execSync("where mysqldump", { encoding: "utf8" });
          const rutaPath = resultado.split("\n")[0].trim();
          if (rutaPath && fs.existsSync(rutaPath)) {
            console.log(`✅ mysqldump encontrado en PATH: ${rutaPath}`);
            return rutaPath;
          }
        } catch (e) {
          // No está en el PATH
        }

        return null;
      }

      rutaMysqldump = encontrarMysqldump();
    }

    // ========== 3. Si aún no se encontró, mostrar error ==========
    if (!rutaMysqldump) {
      return res.status(500).send(`
        <h2>Error: No se encontró mysqldump</h2>
        <p>No se encontró el ejecutable <strong>mysqldump</strong>.</p>
        <p><strong>Solución:</strong></p>
        <ol>
          <li>Ve a <strong>Parámetros</strong></li>
          <li>Busca el parámetro <code>RUTA_MYSQLDUMP</code></li>
          <li>Pon la ruta completa de mysqldump.exe (ejemplo):</li>
        </ol>
        <pre>C:\\Program Files\\MySQL\\MySQL Server 8.4\\bin\\mysqldump.exe</pre>
        <p>Luego vuelve a intentar el respaldo.</p>
      `);
    }

    // ========== Generar el backup ==========
    const timestampRespaldo = new Date().toISOString()
      .replace(/T/, '_')
      .replace(/\..+/, '')
      .replace(/:/g, '-');
      
    const archivoRespaldoSql = `backup_rocamaya_${timestampRespaldo}.sql`;
    const rutaTemporalBackup = path.join(__dirname, "../", archivoRespaldoSql);

    const passwordFlag = dbConfig.password ? `-p${dbConfig.password}` : "";
    const comando = `"${rutaMysqldump}" -h ${dbConfig.host} -u ${dbConfig.user} ${passwordFlag} --skip-triggers --complete-insert --add-drop-table ${dbConfig.database} > "${rutaTemporalBackup}"`;

    console.log(`🔄 Ejecutando backup con: ${rutaMysqldump}`);

    exec(comando, { timeout: 120000 }, async (error, stdout, stderr) => {
      if (fs.existsSync(rutaTemporalBackup)) {
        const stats = fs.statSync(rutaTemporalBackup);

        if (stats.size > 0) {
          console.log(`✅ Backup generado: ${archivoRespaldoSql} (${stats.size} bytes)`);

          res.download(rutaTemporalBackup, archivoRespaldoSql, async (downloadError) => {
            // Limpiar archivo temporal
            try {
              if (fs.existsSync(rutaTemporalBackup)) {
                fs.unlinkSync(rutaTemporalBackup);
              }
            } catch (fsErr) {
              console.error("Error al limpiar archivo temporal:", fsErr);
            }

            // Registrar en bitácora
            if (!downloadError) {
              try {
                await pool.query(
                  `INSERT INTO tbl_ms_bitacora 
                     (FECHA_HORA, ID_USUARIO, ACCION, DESCRIPCION, MODULO)
                   VALUES (NOW(), ?, ?, ?, ?)`,
                  [
                    idUsuario,
                    "BACKUP_BD",
                    `El usuario ${nombreUsuario} generó el respaldo: ${archivoRespaldoSql}`,
                    "CONFIGURACION"
                  ]
                );
              } catch (bitacoraError) {
                console.error("Error al registrar respaldo en bitácora:", bitacoraError);
              }
            }
          });
          return;
        }
      }

      console.error("❌ Error al generar backup:", error?.message || stderr);
      res.status(500).send(`Error al generar backup: ${error?.message || stderr || "Archivo vacío"}`);
    });

  } catch (error) {
    console.error("❌ Error en backup:", error);
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

    // Ejecuta el procedimiento almacenado unificado
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