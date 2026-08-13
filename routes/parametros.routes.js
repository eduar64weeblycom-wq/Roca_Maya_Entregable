const express = require('express');
const router = express.Router();

const pool = require('../database/db');
const { registrarBitacora } = require('../services/bitacora.service');
const fs = require('fs');
const path = require('path');
const os = require('os');
const util = require('util');

// ============================================================
// VISTA DE PARÁMETROS (GET)
// ============================================================
router.get("/", async (req, res) => {
    try {
        const [parametros] = await pool.query("SELECT * FROM tbl_parametros");
        res.render("parametros", {
            usuario: req.user || { USUARIO: 'ADMIN', ROL: 'ADMINISTRADOR' },
            parametros: parametros
        });
    } catch (err) {
        console.error("❌ Error al cargar parámetros:", err.message);
        res.status(500).send("Error interno al cargar la página de parámetros");
    }
});
// ============================================================
// GUARDAR CAMBIOS DE PARÁMETROS (POST)
// ============================================================
router.post("/guardar", async (req, res) => {
    const { parametros } = req.body;
    
    if (!parametros || !Array.isArray(parametros)) {
        return res.status(400).json({
            success: false,
            message: "No se recibieron datos válidos para guardar."
        });
    }

    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        for (let param of parametros) {
            await connection.query(
                "UPDATE tbl_parametros SET VALOR = ? WHERE ID_PARAMETRO = ?",
                [param.valor, param.id]
            );
        }

        await connection.commit();

        return res.status(200).json({
            success: true,
            message: "Parámetros actualizados correctamente."
        });

    } catch (error) {
        await connection.rollback();
        console.error("❌ Error al guardar parámetros:", error.message);
        return res.status(500).json({
            success: false,
            message: "Error interno al actualizar los parámetros."
        });
    } finally {
        connection.release();
    }
});
// ============================================================
// RESTAURACIÓN DE BASE DE DATOS (POST)
// Soportando tanto /restore como /upload-sql-data
// ============================================================
const procesarRestauracion = async (req, res) => {
    const usuario = req.user || {
        ID_USUARIO: 1,
        USUARIO: 'ADMIN'
    };

    let connection;

    try {
        let sqlContent = '';

        // Soportar tanto archivo adjunto (FormData) como Base64 (JSON)
        if (req.file) {
            sqlContent = fs.readFileSync(req.file.path, 'utf8');
            // Limpiar archivo temporal si se usó multer
            try { fs.unlinkSync(req.file.path); } catch(e) {}
        } else if (req.body && req.body.backupBase64) {
            const base64Data = req.body.backupBase64.includes(';base64,')
                ? req.body.backupBase64.split(';base64,').pop()
                : req.body.backupBase64;
            sqlContent = Buffer.from(base64Data, 'base64').toString('utf8');
        }

        if (!sqlContent || sqlContent.trim().length < 10) {
            return res.status(400).json({
                ok: false,
                success: false,
                mensaje: "El archivo SQL está vacío o es inválido."
            });
        }

        connection = await pool.getConnection();
        await connection.beginTransaction();

        // Desactivar modo estricto y llaves foráneas temporalmente
        await connection.query("SET SESSION sql_mode = ''");
        await connection.query("SET FOREIGN_KEY_CHECKS = 0");

        // Modificar columnas problemáticas o JSON si existen
        try {
            await connection.query("ALTER TABLE tbl_consulta_medica MODIFY COLUMN SINTOMAS TEXT, MODIFY COLUMN EXAMEN_FISICO TEXT");
            await connection.query("ALTER TABLE tbl_historial_medico MODIFY COLUMN ALERGIAS TEXT, MODIFY COLUMN ENFERMEDADES_CRONICAS TEXT, MODIFY COLUMN CIRUGIAS_PREVIAS TEXT, MODIFY COLUMN MEDICAMENTOS_ACTUALES TEXT, MODIFY COLUMN ANTECEDENTES_FAMILIARES TEXT, MODIFY COLUMN HABITOS TEXT, MODIFY COLUMN VACUNAS TEXT, MODIFY COLUMN NOTAS_IMPORTANTES TEXT");
            await connection.query("ALTER TABLE tbl_citas MODIFY COLUMN ESTADO VARCHAR(100)");
        } catch (alterErr) {
            console.log("Nota en modificación de esquemas:", alterErr.message);
        }

        const statements = sqlContent
            .split(/;\s*(?:\r?\n|$)/)
            .map(statement => statement.trim())
            .filter(statement => {
                if (!statement) return false;
                if (statement.startsWith('--')) return false;
                if (statement.startsWith('/*')) return false;
                if (statement.startsWith('//')) return false;
                return true;
            });

        let ejecutados = 0;

        for (let statement of statements) {
            if (!statement.trim()) continue;

            try {
                // Omitir columna generada IMC si aparece explícitamente en tbl_preclinica
                if (statement.toUpperCase().includes('TBL_PRECLINICA')) {
                    statement = statement.replace(/,\s*`IMC`/, '');
                }

                await connection.query(statement);
                ejecutados++;
            } catch (sqlError) {
                console.error("❌ Error ejecutando sentencia:", sqlError.message);
                throw sqlError;
            }
        }

        await connection.query('SET FOREIGN_KEY_CHECKS = 1');
        await connection.commit();

        try {
            await registrarBitacora({
                usuario: usuario.USUARIO || 'ADMIN',
                accion: 'RESTAURACION_BASE_DATOS',
                modulo: 'SEGURIDAD',
                descripcion: `Base de datos restaurada mediante archivo SQL (${ejecutados} sentencias ejecutadas)`,
                idRegistro: null,
                tabla: null,
                estado: 'EXITO',
                req: req
            });
        } catch (bitacoraError) {
            console.error("⚠️ Error registrando bitácora:", bitacoraError.message);
        }

        return res.status(200).json({
            ok: true,
            success: true,
            mensaje: `Base de datos restaurada exitosamente (${ejecutados} sentencias ejecutadas).`
        });

    } catch (error) {
        console.error("❌ ERROR CRÍTICO EN RESTAURACIÓN:", error);

        if (connection) {
            try { await connection.rollback(); } catch (e) {}
            try { await connection.query('SET FOREIGN_KEY_CHECKS = 1'); } catch (e) {}
        }

        return res.status(500).json({
            ok: false,
            success: false,
            mensaje: "Error al restaurar la base de datos: " + (error.message || "Error desconocido")
        });

    } finally {
        if (connection) connection.release();
    }
};

// Registrar ambas rutas para evitar conflictos con el frontend
router.post("/restore", procesarRestauracion);
router.post("/upload-sql-data", procesarRestauracion);

module.exports = router;