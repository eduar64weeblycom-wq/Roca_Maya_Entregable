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
// RUTA DE RESTAURACIÓN SEGURA CON execFile
// ============================================================
router.post("/restore", uploadRestore.single('backup'), async (req, res) => {
    let tempFilePath = null;
    const usuario = req.user || { id: 1, ID_USUARIO: 1 };

    try {
        if (!req.file) {
            return res.status(400).json({ ok: false, mensaje: "Archivo no recibido" });
        }

        console.log(`📦 Restaurando base de datos: ${req.file.originalname} (${req.file.size} bytes)`);

        // 1. Guardar el archivo temporalmente
        tempFilePath = path.join(os.tmpdir(), `restore_${Date.now()}.sql`);
        fs.writeFileSync(tempFilePath, req.file.buffer);

        // 2. Credenciales desde variables de entorno
        const host = process.env.DB_HOST || 'localhost';
        const user = process.env.DB_USER;
        const password = process.env.DB_PASSWORD;
        const database = process.env.DB_NAME;
        const port = process.env.DB_PORT || '3306';

        // 3. Construcción de argumentos seguros para execFile (evita inyección de comandos)
        // Nota: Redirigimos el archivo SQL usando stdin mediante opciones de configuración de fs
        const args = [
            `-h${host}`,
            `-P${port}`,
            `-u${user}`,
            `-p${password}`,
            `--force`,
            database
        ];

        console.log("Ejecutando restauración con mysql CLI...");

        const sqlStream = fs.createReadStream(tempFilePath);

        const child = execFile('mysql', args, {
            maxBuffer: 50 * 1024 * 1024,
            timeout: 5 * 60 * 1000
        }, async (error, stdout, stderr) => {
            // Limpiar archivo temporal de forma segura
            if (tempFilePath && fs.existsSync(tempFilePath)) {
                try { fs.unlinkSync(tempFilePath); } catch (e) {}
            }

            if (error) {
                console.error("❌ Error crítico en restauración:", error.message);
                return res.status(500).json({
                    ok: false,
                    mensaje: "Error al restaurar: " + error.message
                });
            }

            if (stderr && !stderr.includes('Warning') && !stderr.includes('Using a password')) {
                console.warn("Advertencias de mysql:", stderr);
            }

            // 4. Registrar en bitácora
            try {
                await registrarBitacora(
                    'RESTAURACION_BASE_DATOS',
                    'SEGURIDAD',
                    `Base de datos restaurada exitosamente con el archivo: ${req.file.originalname}`,
                    usuario.id || usuario.ID_USUARIO
                );
            } catch (bitacoraError) {
                console.error("Error al registrar en bitácora:", bitacoraError);
            }

            return res.json({
                ok: true,
                mensaje: "Base de datos restaurada exitosamente."
            });
        });

        // Conectar el flujo del archivo SQL al flujo de entrada estándar (stdin) del proceso mysql
        sqlStream.pipe(child.stdin);

    } catch (error) {
        if (tempFilePath && fs.existsSync(tempFilePath)) {
            try { fs.unlinkSync(tempFilePath); } catch (e) {}
        }
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