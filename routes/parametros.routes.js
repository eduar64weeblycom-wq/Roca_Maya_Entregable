const express = require('express');
const router = express.Router();
const pool = require('../database/db');
const { registrarBitacora } = require('../services/bitacora.service');
const multer = require('multer');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const util = require('util');

const execFilePromise = util.promisify(execFile);

// ============================================================
// MULTER EN MEMORIA
// ============================================================
const uploadRestore = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
    fileFilter: (req, file, cb) => {
        if (file.originalname.toLowerCase().endsWith('.sql')) {
            cb(null, true);
        } else {
            cb(new Error('Solo se permiten archivos .sql'), false);
        }
    }
});

// ============================================================
// RUTA DE RESTAURACIÓN OPTIMIZADA Y SEGURA
// ============================================================
router.post("/restore", (req, res, next) => {
    uploadRestore.single('backup')(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            return res.status(400).json({ 
                ok: false, 
                mensaje: `Error en la subida del archivo: ${err.message}` 
            });
        } else if (err) {
            return res.status(400).json({ 
                ok: false, 
                mensaje: err.message 
            });
        }
        next();
    });
}, async (req, res) => {
    const usuario = req.user || { id: 1, ID_USUARIO: 1, USUARIO: 'ADMIN' };
    const connection = await pool.getConnection();

    try {
        if (!req.file) {
            return res.status(400).json({ 
                ok: false, 
                mensaje: "No se recibió ningún archivo .sql" 
            });
        }

        console.log(`📦 Iniciando restauración: ${req.file.originalname} (${(req.file.size / 1024 / 1024).toFixed(2)} MB)`);

        const sqlContent = req.file.buffer.toString('utf8');

        if (!sqlContent || sqlContent.trim().length < 10) {
            return res.status(400).json({ 
                ok: false, 
                mensaje: "El archivo SQL está vacío o es inválido" 
            });
        }

        // Limpiar y separar sentencias de forma robusta
        const statements = sqlContent
            .split(/;\s*[\r\n]+/)
            .map(stmt => stmt.trim())
            .filter(stmt => {
                return stmt.length > 0 &&
                       !stmt.startsWith('--') &&
                       !stmt.startsWith('/*') &&
                       !stmt.startsWith('//');
            });

        console.log(`📄 Se procesarán ${statements.length} sentencias SQL`);

        // Desactivar temporalmente las restricciones de claves foráneas para evitar conflictos de orden al restaurar
        await connection.query('SET FOREIGN_KEY_CHECKS = 0;');
        await connection.beginTransaction();

        let ejecutados = 0;
        for (const statement of statements) {
            if (statement) {
                await connection.query(statement);
                ejecutados++;
            }
        }

        await connection.commit();
        await connection.query('SET FOREIGN_KEY_CHECKS = 1;');

        console.log(`✅ Restauración completada con éxito. Sentencias ejecutadas: ${ejecutados}`);

        // Registrar en bitácora de manera segura
        try {
            await registrarBitacora({
                usuario: usuario.USUARIO || usuario.usuarioActual || 'ADMIN',
                accion: 'RESTAURACION_BASE_DATOS',
                modulo: 'SEGURIDAD',
                descripcion: `Base de datos restaurada con el archivo: ${req.file.originalname} (${ejecutados} sentencias)`,
                idRegistro: null,
                tabla: null,
                estado: 'EXITO',
                req: req
            });
        } catch (bitacoraError) {
            console.error("Error al registrar en bitácora:", bitacoraError);
        }

        return res.json({
            ok: true,
            mensaje: `Base de datos restaurada exitosamente (${ejecutados} sentencias ejecutadas).`
        });

    } catch (error) {
        await connection.rollback();
        try {
            await connection.query('SET FOREIGN_KEY_CHECKS = 1;');
        } catch (e) { /* ignorar si falla la reactivación en el catch */ }

        console.error("❌ Error crítico en restauración:", error);
        return res.status(500).json({
            ok: false,
            mensaje: "Error al restaurar la base de datos: " + (error.message || "Error desconocido")
        });
    } finally {
        connection.release();
    }
});
// ==========================================
// VALIDACIÓN DE PARÁMETROS
// ==========================================
function validarParametrosBackend(req, res, next) {
    const { parametros } = req.body;
    
    if (!parametros || !Array.isArray(parametros)) {
        return res.status(400).json({
            success: false,
            message: 'Formato de datos invalido'
        });
    }
    
    const errores = [];
    
    for (const param of parametros) {
        if (!param.id || !param.clave || param.valor === undefined || param.valor === '') {
            errores.push(`Faltan campos requeridos para ${param.clave}`);
            continue;
        }
        
        let valorLimpio = String(param.valor).replace(/[^\w\s@.-]/gi, '').trim();
        
        if (esParametroNumerico(param.clave)) {
            if (!/^\d+$/.test(valorLimpio)) {
                errores.push(`El parametro ${param.clave} debe contener solo numeros`);
                continue;
            }
            
            const valorNum = parseInt(valorLimpio, 10);
            
            if (valorNum < 1) {
                if (['ADMIN_PREGUNTAS', 'ADMIN_INTENTOS_INVALIDOS', 'SEGURIDAD_INTENTOS'].includes(param.clave)) {
                    errores.push(`${param.clave} debe ser al menos 1`);
                } else if (param.clave === 'SEGURIDAD_LONGITUD') {
                    errores.push('SEGURIDAD_LONGITUD debe ser al menos 6');
                }
            }
            
            param.valor = valorNum;
            
        } else if (esParametroTexto(param.clave)) {
            if (!/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/.test(valorLimpio)) {
                errores.push(`El parametro ${param.clave} debe contener solo letras y espacios`);
                continue;
            }
        } else if (['CORREO_USUARIO', 'CORREO_DESTINATARIO'].includes(param.clave)) {
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valorLimpio)) {
                errores.push(`El parametro ${param.clave} debe ser un email valido`);
                continue;
            }
        }
        
        param.valor = valorLimpio;
    }
    
    if (errores.length > 0) {
        return res.status(400).json({
            success: false,
            message: 'Errores de validacion',
            errors: errores
        });
    }
    
    next();
}

// ==========================================
// RUTA PARA GUARDAR PARÁMETROS (Con Transacción)
// ==========================================
router.post('/guardar', validarParametrosBackend, async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const { parametros } = req.body;
        const usuario = req.user || { id: 1, USUARIO: 'ADMIN' };

        await connection.beginTransaction();

        for (const param of parametros) {
            await connection.query(
                'UPDATE tbl_ms_parametros SET VALOR = ?, USUARIO_MODIFICACION = ?, FECHA_MODIFICACION = NOW() WHERE ID_PARAMETRO = ?',
                [param.valor, usuario.id || usuario.ID_USUARIO, param.id]
            );
            
            await registrarBitacora({
                usuario: usuario.USUARIO || usuario.usuarioActual || 'ADMIN',
                accion: 'ACTUALIZACION_PARAMETRO',
                modulo: 'CONFIGURACION',
                descripcion: `Parametro actualizado: ${param.clave} - Valor: ${param.valorOriginal} -> ${param.valor}`,
                idRegistro: param.id,
                tabla: 'tbl_ms_parametros',
                estado: 'EXITO',
                req: req
            });
        }
        
        await connection.commit();

        return res.json({ 
            success: true, 
            message: 'Parametros actualizados exitosamente' 
        });
        
    } catch (error) {
        await connection.rollback();
        console.error('Error al guardar parámetros:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Error interno del servidor' 
        });
    } finally {
        connection.release();
    }
});

// ==========================================
// RUTA PARA OBTENER PARÁMETROS
// ==========================================
router.get('/', async (req, res) => {
    try {
        const [parametros] = await pool.query(`
            SELECT * FROM tbl_ms_parametros 
            ORDER BY ID_PARAMETRO
        `);
        
        return res.render('parametros', { parametros });
        
    } catch (error) {
        console.error('Error obteniendo parametros:', error);
        return res.status(500).json({
            success: false,
            message: 'Error al obtener parametros'
        });
    }
});

// ==========================================
// FUNCIONES AUXILIARES
// ==========================================
function esParametroNumerico(clave) {
    const parametrosNumericos = [
        'ADMIN_INTENTOS_INVALIDOS', 'ADMIN_TIEMPO_SESION', 'ADMIN_PREGUNTAS',
        'SEGURIDAD_INTENTOS', 'SEGURIDAD_LONGITUD', 'CORREO_PUERTO'
    ];
    return parametrosNumericos.includes(clave);
}

function esParametroTexto(clave) {
    const parametrosTexto = [
        'ADMIN_NOMBRE_SISTEMA', 'ADMIN_PAIS', 'ADMIN_IDIOMA'
    ];
    return parametrosTexto.includes(clave);
}

module.exports = router;