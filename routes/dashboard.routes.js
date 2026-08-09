const express = require("express");
const router = express.Router();
const db = require('../database/db');
const { verificarSesion } = require("../middleware/auth.middleware");
const verificarPrimerIngreso = require("../middleware/verificarPrimerIngreso");
const bcrypt = require('bcrypt');

// ============================================================
// Todas las rutas de dashboard requieren sesión Y verificación de primer ingreso
// ============================================================
router.use(verificarSesion);
router.use(verificarPrimerIngreso);

// ============================================================
// DASHBOARD PRINCIPAL
// ============================================================
router.get("/", async (req, res) => {
  try {
    const usuario = req.usuarioActual;
    const esPrimerIngreso = req.esPrimerIngreso || false;

    // 🔹 INCLUIMOS TELEFONO_PROFESIONAL EN EL SELECT
    const [userData] = await db.query(`
      SELECT u.ID_USUARIO, u.USUARIO, u.NOMBRE_USUARIO, 
             u.CORREO_ELECTRONICO, u.ESTADO, u.TELEFONO_PROFESIONAL,
             r.ROL, r.ID_ROL
      FROM tbl_ms_usuario u
      INNER JOIN tbl_ms_roles r ON u.ID_ROL = r.ID_ROL
      WHERE u.USUARIO = ?
    `, [usuario]);

    if (userData.length === 0) {
      return res.redirect("/auth/login");
    }

    const rol = userData[0].ROL;
    const nombreUsuario = userData[0].NOMBRE_USUARIO;
    const email = userData[0].CORREO_ELECTRONICO || null;
    const telefonoProfesional = userData[0].TELEFONO_PROFESIONAL || ''; // 🔹 VALOR
    const estado = userData[0].ESTADO;
    const esNuevo = (estado && estado.toUpperCase() === 'NUEVO') || esPrimerIngreso;

    let stats = { pacientes: 0, citasHoy: 0, consultasDiarias: 0, medicamentos: 0 };
    if (!esNuevo) {
      if (rol === 'ADMINISTRADOR' || rol === 'ENFERMERA') {
        const [pacientes] = await db.query("SELECT COUNT(*) as total FROM tbl_paciente WHERE ESTADO = 'ACTIVO'");
        stats.pacientes = pacientes[0]?.total || 0;
      }
      if (rol === 'ADMINISTRADOR' || rol === 'RECEPCIONISTA') {
        const [citas] = await db.query("SELECT COUNT(*) as total FROM tbl_citas WHERE DATE(FECHA_CITA) = CURDATE()");
        stats.citasHoy = citas[0]?.total || 0;
      }
      if (rol === 'ADMINISTRADOR' || rol === 'DOCTOR') {
        const [consultas] = await db.query("SELECT COUNT(*) as total FROM tbl_consulta_medica WHERE DATE(FECHA_CONSULTA) = CURDATE()");
        stats.consultasDiarias = consultas[0]?.total || 0;
      }
      if (rol === 'ADMINISTRADOR') {
        const [medicamentos] = await db.query("SELECT COUNT(*) as total FROM TBL_INVENTARIO_MEDICAMENTOS WHERE ESTADO = 'ACTIVO'");
        stats.medicamentos = medicamentos[0]?.total || 0;
      }
    }

    // 🔹 PASAMOS telefonoProfesional A LA VISTA
    res.render("dashboard", {
      rol,
      nombreUsuario,
      usuario,
      email,
      stats,
      telefonoProfesional,
      esPrimerIngreso: esNuevo
    });

  } catch (error) {
    console.error("Error en dashboard:", error);
    res.status(500).send("Error al cargar el dashboard");
  }
});

router.get("/dashboard", async (req, res) => {
  res.redirect("/dashboard");
});

// ============================================================
// PERMISOS DEL MENÚ
// ============================================================
router.get('/permisos', async (req, res) => {
  try {
    const usuario = req.usuarioActual;
    if (!usuario) return res.status(401).json({ error: 'No autenticado' });

    const [userData] = await db.query(`SELECT ID_ROL FROM tbl_ms_usuario WHERE USUARIO = ?`, [usuario]);
    if (userData.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });

    const idRol = userData[0].ID_ROL;
    const [permisos] = await db.query(`
      SELECT p.ID_OBJETO as id, p.PERMISO_CONSULTA as consulta, o.OBJETO as nombre, o.TIPO_OBJETO as tipo
      FROM TBL_PERMISOS p
      INNER JOIN TBL_OBJETOS o ON p.ID_OBJETO = o.ID_OBJETO
      WHERE p.ID_ROL = ?
      ORDER BY o.ID_OBJETO
    `, [idRol]);

    res.json({ success: true, rol: idRol, permisos });
  } catch (error) {
    console.error('Error al obtener permisos:', error);
    res.status(500).json({ success: false, error: 'Error al cargar los permisos' });
  }
});

// ============================================================
// CAMBIAR CONTRASEÑA - CON VALIDACIÓN DE NO REPETIR LA MISMA
// ============================================================
router.post('/cambiar-password', async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const usuario = req.usuarioActual;

    if (!usuario) {
      return res.status(401).json({ success: false, error: 'No autenticado' });
    }

    // Validar longitud de la nueva contraseña
    if (newPassword.length < 9 || newPassword.length > 15) {
      return res.status(400).json({
        success: false,
        error: 'La contraseña debe tener entre 9 y 15 caracteres'
      });
    }

    const [userData] = await db.query(`
      SELECT ID_USUARIO, CONTRASENA, ESTADO 
      FROM tbl_ms_usuario 
      WHERE USUARIO = ?
    `, [usuario]);

    if (userData.length === 0) {
      return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
    }

    const userId = userData[0].ID_USUARIO;
    const hashedPassword = userData[0].CONTRASENA;
    const estadoActual = userData[0].ESTADO || '';

    // 1. Validar que la contraseña actual sea correcta
    const isMatch = await bcrypt.compare(currentPassword, hashedPassword);
    if (!isMatch) {
      return res.status(400).json({ success: false, error: 'Contraseña actual incorrecta' });
    }

    // 2. Validar que la nueva contraseña NO sea igual a la actual
    const isSamePassword = await bcrypt.compare(newPassword, hashedPassword);
    if (isSamePassword) {
      return res.status(400).json({
        success: false,
        error: 'La nueva contraseña no puede ser igual a la contraseña actual'
      });
    }

    // Hashear la nueva contraseña
    const newHashedPassword = await bcrypt.hash(newPassword, 10);

    // Actualizar contraseña y cambiar estado a ACTIVO (si era NUEVO)
    const nuevoEstado = estadoActual.toUpperCase() === 'NUEVO' ? 'ACTIVO' : estadoActual;

    await db.query(`
      UPDATE tbl_ms_usuario 
      SET CONTRASENA = ?, 
          ESTADO = ?,
          FECHA_MODIFICACION = NOW(),
          USUARIO_MODIFICACION = ?
      WHERE ID_USUARIO = ?
    `, [newHashedPassword, nuevoEstado, usuario, userId]);

    // Registrar en bitácora
    await db.query(`
      CALL SP_REGISTRAR_BITACORA(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      userId,
      'CAMBIO_CONTRASENA',
      `Usuario ${usuario} cambió su contraseña${estadoActual === 'NUEVO' ? ' (primer ingreso)' : ''}`,
      'SEGURIDAD',
      userId,
      'tbl_ms_usuario',
      req.ip || null,
      req.headers['user-agent'] || null,
      'EXITO',
      null,
      usuario
    ]);

    res.json({
      success: true,
      message: 'Contraseña cambiada exitosamente',
      primerIngreso: false,
      recargar: true
    });

  } catch (error) {
    console.error('Error al cambiar contraseña:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor: ' + error.message
    });
  }
});

// ============================================================
// ACTUALIZAR NÚMERO PROFESIONAL (desde el dashboard)
// ============================================================
router.post('/actualizar-telefono', async (req, res) => {
  try {
    const usuario = req.usuarioActual;
    if (!usuario) {
      return res.status(401).json({ success: false, error: 'No autenticado' });
    }

    const { telefono } = req.body;
    if (!telefono || telefono.trim() === '') {
      return res.status(400).json({ success: false, error: 'El número profesional no puede estar vacío' });
    }

    // Actualizar el teléfono
    await db.query(
      'UPDATE tbl_ms_usuario SET TELEFONO_PROFESIONAL = ? WHERE USUARIO = ?',
      [telefono.trim(), usuario]
    );

    // Registrar en bitácora
    await db.query(`
      CALL SP_REGISTRAR_BITACORA(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      null, // ID_USUARIO (podríamos obtenerlo, pero no es crítico)
      'ACTUALIZAR_TELEFONO_PROFESIONAL',
      `Usuario ${usuario} actualizó su número profesional a: ${telefono.trim()}`,
      'PERFIL',
      null,
      'tbl_ms_usuario',
      req.ip || null,
      req.headers['user-agent'] || null,
      'EXITO',
      null,
      usuario
    ]);

    res.json({ success: true, message: 'Número profesional actualizado correctamente' });
  } catch (error) {
    console.error('Error al actualizar número profesional:', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

// ============================================================
// ESTADÍSTICAS (endpoint para actualización vía AJAX)
// ============================================================
router.get('/stats', async (req, res) => {
  try {
    const usuario = req.usuarioActual;
    const [userData] = await db.query(`
      SELECT r.ROL
      FROM tbl_ms_usuario u
      INNER JOIN tbl_ms_roles r ON u.ID_ROL = r.ID_ROL
      WHERE u.USUARIO = ?
    `, [usuario]);
    const rol = userData[0]?.ROL || '';
    let stats = { pacientesActivos: 0, citasHoy: 0, consultasHoy: 0, medicamentosActivos: 0 };
    if (rol === 'ADMINISTRADOR' || rol === 'ENFERMERA') {
      const [pacientes] = await db.query("SELECT COUNT(*) as total FROM tbl_paciente WHERE ESTADO = 'ACTIVO'");
      stats.pacientesActivos = pacientes[0]?.total || 0;
    }
    if (rol === 'ADMINISTRADOR' || rol === 'RECEPCIONISTA') {
      const [citas] = await db.query("SELECT COUNT(*) as total FROM tbl_citas WHERE DATE(FECHA_CITA) = CURDATE()");
      stats.citasHoy = citas[0]?.total || 0;
    }
    if (rol === 'ADMINISTRADOR' || rol === 'DOCTOR') {
      const [consultas] = await db.query("SELECT COUNT(*) as total FROM tbl_consulta_medica WHERE DATE(FECHA_CONSULTA) = CURDATE()");
      stats.consultasHoy = consultas[0]?.total || 0;
    }
    if (rol === 'ADMINISTRADOR') {
      const [medicamentos] = await db.query("SELECT COUNT(*) as total FROM TBL_INVENTARIO_MEDICAMENTOS WHERE ESTADO = 'ACTIVO'");
      stats.medicamentosActivos = medicamentos[0]?.total || 0;
    }
    res.json(stats);
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ error: 'Error al cargar las estadísticas' });
  }
});

module.exports = router;