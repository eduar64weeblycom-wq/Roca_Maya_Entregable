const express = require('express');
const router = express.Router();
const pool = require('../database/db');
const { registrarBitacora } = require('../utils/bitacora');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const Importer = require('mysql-import');
const fs = require('fs');
const path = require('path');

const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
router.post("/restore", upload.single('backup'), async (req, res) => {
  let tempPath = null;

  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, mensaje: "Archivo no recibido" });
    }

    if (!req.file.originalname.toLowerCase().endsWith('.sql')) {
      return res.status(400).json({ ok: false, mensaje: "Solo se permiten archivos .sql" });
    }

    tempPath = path.join(__dirname, '../temp_restore.sql');
    fs.writeFileSync(tempPath, req.file.buffer);

    // Leer el contenido del archivo SQL
    const sqlContent = fs.readFileSync(tempPath, 'utf8');

    // Dividir las consultas por punto y coma (manejando scripts básicos)
    // Nota: Si usas procedimientos almacenados con BEGIN...END, es mejor usar un importador dedicado, 
    // pero para evitar dependencias de consola, ejecutamos por bloques o usamos multiStatements.
    const connection = await pool.getConnection();
    try {
        await connection.query("SET FOREIGN_KEY_CHECKS = 0;");
        
        // Dividir por sentencias básicas o ejecutar con multipleStatements habilitado en el pool
        // Como tu pool ya tiene multipleStatements: true, puedes intentar ejecutar el script completo si no es gigante:
        await connection.query(sqlContent);
        
        await connection.query("SET FOREIGN_KEY_CHECKS = 1;");
    } finally {
        connection.release();
    }

    return res.json({ ok: true, mensaje: "Restauración exitosa" });

  } catch (error) {
    console.error("Error crítico en restauración:", error);
    return res.status(500).json({ 
      ok: false, 
      mensaje: "Error al restaurar: " + (error.message || "Error desconocido")
    });
  } finally {
    if (tempPath && fs.existsSync(tempPath)) {
      try { fs.unlinkSync(tempPath); } catch (e) {}
    }
  }
});

// Función de validación estricta
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

// Ruta para guardar parámetros
router.post('/guardar', validarParametrosBackend, async (req, res) => {
    try {
        const { parametros } = req.body;
        const usuario = req.user || { id: 1 };

        for (const param of parametros) {
            await pool.query(
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
        
       return res.json({ 
            success: true, 
            message: 'Parametros actualizados exitosamente' 
        });
        
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Error interno del servidor' 
        });
    }
});

// Ruta para obtener parámetros
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

// Funciones auxiliares
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