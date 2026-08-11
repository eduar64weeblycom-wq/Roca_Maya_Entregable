const express = require('express');
const router = express.Router();
const pool = require('../database/db');
const { registrarBitacora } = require('../utils/bitacora'); // ajusta la ruta si es necesario
const multer = require('multer');

// ============================================================
// MULTER EN MEMORIA (ideal para Render)
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
// RUTA DE RESTAURACIÓN
// ============================================================
router.post("/restore", uploadRestore.single('backup'), async (req, res) => {
    const usuario = req.user || { id: 1, ID_USUARIO: 1 };

    try {
        if (!req.file) {
            return res.status(400).json({ ok: false, mensaje: "Archivo no recibido" });
        }

        console.log(`📦 Restaurando: ${req.file.originalname} (${req.file.size} bytes)`);

        // El archivo está en memoria (Buffer)
        const sqlContent = req.file.buffer.toString('utf8');

        if (!sqlContent || sqlContent.trim().length < 20) {
            return res.status(400).json({ ok: false, mensaje: "El archivo SQL está vacío o es inválido" });
        }

        const connection = await pool.getConnection();

        try {
            await connection.query("SET FOREIGN_KEY_CHECKS = 0");
            await connection.query("SET UNIQUE_CHECKS = 0");
            await connection.query("SET AUTOCOMMIT = 0");

            // Ejecutar todo el dump de una sola vez
            await connection.query(sqlContent);

            await connection.query("COMMIT");
            await connection.query("SET FOREIGN_KEY_CHECKS = 1");
            await connection.query("SET UNIQUE_CHECKS = 1");
            await connection.query("SET AUTOCOMMIT = 1");

            // Registrar en bitácora
            await registrarBitacora(
                'RESTAURACION_BASE_DATOS',
                'SEGURIDAD',
                `Base de datos restaurada exitosamente con el archivo: ${req.file.originalname}`,
                usuario.id || usuario.ID_USUARIO
            );

            return res.json({
                ok: true,
                mensaje: "Base de datos restaurada exitosamente."
            });

        } catch (dbError) {
            try { await connection.query("ROLLBACK"); } catch (_) {}
            console.error("❌ Error de BD durante restauración:", dbError.message);
            throw dbError;
        } finally {
            connection.release();
        }

    } catch (error) {
        console.error("❌ Error crítico en restauración:", error.message);
        return res.status(500).json({
            ok: false,
            mensaje: "Error al restaurar: " + (error.message || "Error desconocido")
        });
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
            
            const valorNum = parseInt(valorLimpio);
            
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
        const usuario = req.user || { id: 1 };

        await connection.beginTransaction();

        for (const param of parametros) {
            await connection.query(
                'UPDATE tbl_ms_parametros SET VALOR = ?, USUARIO_MODIFICACION = ?, FECHA_MODIFICACION = NOW() WHERE ID_PARAMETRO = ?',
                [param.valor, usuario.id, param.id]
            );
            
            await registrarBitacora(
                'ACTUALIZACION_PARAMETRO',
                'CONFIGURACION',
                `Parametro actualizado: ${param.clave} - Valor: ${param.valorOriginal} -> ${param.valor}`,
                usuario.id
            );
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