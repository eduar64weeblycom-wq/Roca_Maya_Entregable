// middleware/verificarPrimerIngreso.js
const db = require('../database/db');

/**
 * Middleware que verifica si el usuario está en estado 'NUEVO'
 * - Si es NUEVO y la ruta NO es la raíz del dashboard, redirige a '/dashboard'
 * - Si es NUEVO y la ruta es '/dashboard' o '/cambiar-password', permite el paso
 * - Marca req.esPrimerIngreso = true para que la vista lo sepa
 */
async function verificarPrimerIngreso(req, res, next) {
    // Permitir acceso a la ruta de cambio de contraseña (POST)
    if (req.path === '/cambiar-password') {
        return next();
    }

    try {
        const usuario = req.usuarioActual;
        if (!usuario) {
            return next();
        }

        const [rows] = await db.query(
            'SELECT ESTADO FROM TBL_MS_USUARIO WHERE USUARIO = ?',
            [usuario]
        );

        if (rows.length === 0) {
            return next();
        }

        const estado = rows[0].ESTADO || '';

        if (estado.toUpperCase() === 'NUEVO') {
            // Si la ruta NO es la raíz del dashboard, redirigir a la raíz
            if (req.path !== '/') {
                return res.redirect('/dashboard');
            }
            // Si es la raíz, permitir paso y marcar como primer ingreso
            req.esPrimerIngreso = true;
            return next();
        }

        next();
    } catch (error) {
        console.error('Error en verificarPrimerIngreso:', error);
        next();
    }
}

module.exports = verificarPrimerIngreso;