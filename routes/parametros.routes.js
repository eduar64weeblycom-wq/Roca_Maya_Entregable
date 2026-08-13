const express = require('express');
const router = express.Router();

const pool = require('../database/db');
const { registrarBitacora } = require('../services/bitacora.service');
const fs = require('fs');
const path = require('path');
const os = require('os');
const util = require('util');
const { execFile } = require('child_process');

const execFilePromise = util.promisify(execFile);

// ============================================================
// RESTAURACIÓN DE BASE DE DATOS
// ============================================================

router.post("/restore", async (req, res) => {
    const usuario = req.user || {
        ID_USUARIO: 1,
        USUARIO: 'ADMIN'
    };

    let connection;

    try {
        console.log("==========================================");
        console.log("🔥 ROUTER PARAMETROS - RESTAURACIÓN");
        console.log("Método:", req.method);
        console.log("URL:", req.originalUrl);
        console.log("Usuario:", usuario.USUARIO);
        console.log("Content-Type:", req.headers["content-type"]);
        console.log("==========================================");

        const { backupBase64 } = req.body;

        if (!backupBase64) {
            return res.status(400).json({
                ok: false,
                mensaje: "No se recibió ningún archivo SQL."
            });
        }

        // ==========================================
        // LIMPIAR DATA URL
        // ==========================================
        const base64Data = backupBase64.includes(';base64,')
            ? backupBase64.split(';base64,').pop()
            : backupBase64;

        // ==========================================
        // DECODIFICAR ARCHIVO
        // ==========================================
        let sqlContent;

        try {
            sqlContent = Buffer
                .from(base64Data, 'base64')
                .toString('utf8');
        } catch (decodeError) {
            console.error("❌ Error decodificando Base64:", decodeError);
            return res.status(400).json({
                ok: false,
                mensaje: "El archivo SQL no pudo ser procesado."
            });
        }

        if (!sqlContent || sqlContent.trim().length < 10) {
            return res.status(400).json({
                ok: false,
                mensaje: "El archivo SQL está vacío o es inválido."
            });
        }

        console.log(`📄 Archivo SQL recibido: ${sqlContent.length} caracteres`);

        // ==========================================
        // OBTENER CONEXIÓN Y PREPARAR SESIÓN DE MYSQL
        // ==========================================

        connection = await pool.getConnection();

        await connection.beginTransaction();

        // 1. Desactivar modo estricto y chequeo de llaves foráneas para la sesión actual
        await connection.query("SET SESSION sql_mode = ''");
        await connection.query("SET FOREIGN_KEY_CHECKS = 0");

        // 2. Modificar columnas problemáticas para evitar errores por tipo JSON
        try {
            await connection.query("ALTER TABLE tbl_consulta_medica MODIFY COLUMN SINTOMAS TEXT, MODIFY COLUMN EXAMEN_FISICO TEXT");
            await connection.query("ALTER TABLE tbl_historial_medico MODIFY COLUMN ALERGIAS TEXT, MODIFY COLUMN ENFERMEDADES_CRONICAS TEXT, MODIFY COLUMN CIRUGIAS_PREVIAS TEXT, MODIFY COLUMN MEDICAMENTOS_ACTUALES TEXT, MODIFY COLUMN ANTECEDENTES_FAMILIARES TEXT, MODIFY COLUMN HABITOS TEXT, MODIFY COLUMN VACUNAS TEXT, MODIFY COLUMN NOTAS_IMPORTANTES TEXT");
            await connection.query("ALTER TABLE tbl_citas MODIFY COLUMN ESTADO VARCHAR(100)");
        } catch (alterErr) {
            console.log("Nota en modificación de esquemas:", alterErr.message);
        }

        // ==========================================
        // SEPARAR SENTENCIAS
        // ==========================================
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

        console.log(`📊 Sentencias detectadas: ${statements.length}`);
// ==========================================
        // EJECUTAR SQL
        // ==========================================

        let ejecutados = 0;

        for (let statement of statements) {
            if (!statement.trim()) {
                continue;
            }

            try {
                // Parche para evitar errores con columnas generadas (calculadas) como IMC en tbl_preclinica
                if (statement.toUpperCase().includes('TBL_PRECLINICA')) {
                    // Remover la columna `IMC` y su valor correspondiente del INSERT si vienen explícitos
                    statement = statement.replace(/,\s*`IMC`/, '');
                    // Expresión para remover el valor numérico correspondiente a IMC en la cláusula VALUES
                    // (Asume que el valor de IMC está presente en los valores)
                }

                await connection.query(statement);
                ejecutados++;
            } catch (sqlError) {
                // Si la sentencia falla específicamente por la columna generada, intentamos ignorarla o la reportamos
                console.error(
                    "❌ Error ejecutando sentencia:",
                    sqlError.message
                );
                console.error("SQL con error:", statement.substring(0, 300));
                throw sqlError;
            }
        }
        // ==========================================
        // REACTIVAR FOREIGN KEYS Y COMMIT
        // ==========================================
        await connection.query('SET FOREIGN_KEY_CHECKS = 1');
        await connection.commit();

        console.log(`✅ Restauración completada: ${ejecutados} sentencias`);

        // ==========================================
        // BITÁCORA
        // ==========================================
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
            try {
                await connection.rollback();
            } catch (rollbackError) {
                console.error("Error en rollback:", rollbackError.message);
            }

            try {
                await connection.query('SET FOREIGN_KEY_CHECKS = 1');
            } catch (fkError) {
                console.error("Error restaurando FOREIGN_KEY_CHECKS:", fkError.message);
            }
        }

        return res.status(500).json({
            ok: false,
            success: false,
            mensaje: "Error al restaurar la base de datos: " + (error.message || "Error desconocido")
        });

    } finally {
        if (connection) {
            connection.release();
        }
    }
});

module.exports = router;