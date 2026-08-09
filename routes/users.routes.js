const express = require('express');
const router = express.Router();
const pool = require('../database/db');
const { registrarBitacora } = require('../services/bitacora.service');
const xl = require('excel4node');

// ============================================================
// RUTA PRINCIPAL - Mostrar vista de usuarios
// ============================================================
router.get("/", async (req, res) => {
  try {
    const [usuarios] = await pool.query(`
      SELECT 
        u.ID_USUARIO,
        u.USUARIO,
        u.NOMBRE_USUARIO,
        u.ESTADO,
        u.CORREO_ELECTRONICO,
        u.ACTIVO_2FA,
        u.FECHA_ULTIMA_CONEXION,
        u.TELEFONO_PROFESIONAL,   -- NUEVO
        r.ROL AS NOMBRE_ROL,
        r.ID_ROL
      FROM tbl_ms_usuario u
      INNER JOIN tbl_ms_roles r ON u.ID_ROL = r.ID_ROL
      ORDER BY u.ID_USUARIO
    `);

    // Obtener todos los roles (sin filtro de ESTADO)
    const [roles] = await pool.query(
      `SELECT ID_ROL, ROL, DESCRIPCION 
       FROM tbl_ms_roles 
       ORDER BY ID_ROL`
    );

    res.render("users", { 
      usuarios,
      roles,
      usuarioLogueado: req.user?.USUARIO || 'SISTEMA'
    });
  } catch (error) {
    console.error("❌ Error en GET /users:", error);
    res.status(500).send("Error al cargar usuarios");
  }
});

// ============================================================
// API: Obtener todas las especialidades activas
// ============================================================
router.get("/api/especialidades", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT ID_ESPECIALIDAD, NOMBRE_ESPECIALIDAD 
       FROM tbl_especialidades 
       WHERE ESTADO = 'ACTIVA' 
       ORDER BY NOMBRE_ESPECIALIDAD`
    );
    res.json({ ok: true, especialidades: rows });
  } catch (error) {
    console.error("❌ Error al obtener especialidades:", error);
    res.status(500).json({ ok: false, msg: "Error al obtener especialidades" });
  }
});

// ============================================================
// API: Obtener usuario por ID (con especialidades si es doctor)
// ============================================================
router.get("/api/usuario/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const [rows] = await pool.query(
      `SELECT u.*, r.ROL 
       FROM tbl_ms_usuario u 
       INNER JOIN tbl_ms_roles r ON u.ID_ROL = r.ID_ROL 
       WHERE u.ID_USUARIO = ?`,
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ ok: false, msg: "Usuario no encontrado" });
    }
    const usuario = rows[0];
    let especialidades = [];
    // Si es doctor (ID_ROL = 2 según tu base de datos)
    if (usuario.ID_ROL === 2) {
      const [espRows] = await pool.query(
        `SELECT ID_ESPECIALIDAD FROM tbl_doctor_especialidad WHERE ID_DOCTOR = ?`,
        [id]
      );
      especialidades = espRows.map(row => row.ID_ESPECIALIDAD);
    }
    res.json({ ok: true, usuario, especialidades });
  } catch (error) {
    console.error("❌ Error al obtener usuario:", error);
    res.status(500).json({ ok: false, msg: "Error al obtener usuario" });
  }
});

// ============================================================
// API: Actualizar usuario (incluyendo especialidades y teléfono)
// ============================================================
router.post("/api/update", async (req, res) => {
  try {
    const {
      id,
      usuario,
      nombre_usuario,
      id_rol,
      estado,
      activo_2fa,
      usuarioAccion,
      especialidades,
      telefono_profesional   // NUEVO
    } = req.body;

    // Validar campos obligatorios
    if (!id || !usuario || !nombre_usuario || !id_rol || !estado) {
      return res.status(400).json({ ok: false, msg: "Faltan campos obligatorios" });
    }

    // Actualizar datos básicos del usuario
    await pool.query(
      `UPDATE tbl_ms_usuario SET 
        USUARIO = ?, 
        NOMBRE_USUARIO = ?, 
        ID_ROL = ?, 
        ESTADO = ?, 
        ACTIVO_2FA = ?,
        TELEFONO_PROFESIONAL = ?,   -- NUEVO
        FECHA_MODIFICACION = CURRENT_TIMESTAMP, 
        USUARIO_MODIFICACION = ? 
      WHERE ID_USUARIO = ?`,
      [usuario, nombre_usuario, id_rol, estado, activo_2fa || 0, telefono_profesional || null, usuarioAccion || 'SISTEMA', id]
    );

    // ============================================================
    // GESTIÓN DE ESPECIALIDADES (SOLO PARA DOCTORES)
    // ============================================================
    if (parseInt(id_rol) === 2) {
      // Eliminar especialidades existentes
      await pool.query(`DELETE FROM tbl_doctor_especialidad WHERE ID_DOCTOR = ?`, [id]);
      
      // Insertar nuevas especialidades si hay
      if (especialidades && especialidades.length > 0) {
        const values = especialidades.map(espId => [parseInt(id), parseInt(espId)]);
        await pool.query(
          `INSERT INTO tbl_doctor_especialidad (ID_DOCTOR, ID_ESPECIALIDAD) VALUES ?`,
          [values]
        );
      }
    }

    // Registrar en bitácora
    await registrarBitacora({
      usuario: usuarioAccion || 'SISTEMA',
      accion: "ACTUALIZACION_USUARIO",
      descripcion: `Usuario ${usuario} actualizado. Rol: ${id_rol}. Especialidades: ${especialidades ? especialidades.join(', ') : 'Ninguna'}. Teléfono: ${telefono_profesional || 'No especificado'}`,
      modulo: "USUARIOS",
      idRegistro: id,
      tabla: "tbl_ms_usuario",
      estado: "EXITO",
      req
    });

    res.json({ ok: true, msg: "Usuario actualizado correctamente" });

  } catch (error) {
    console.error("❌ Error en POST /users/api/update:", error);
    res.status(500).json({ ok: false, msg: "Error al actualizar usuario: " + error.message });
  }
});

// ============================================================
// API: Cambiar estado de usuario
// ============================================================
router.post("/api/cambiar-estado", async (req, res) => {
  try {
    const { id, estado, usuarioAccion } = req.body;
    if (!id || !estado) {
      return res.status(400).json({ ok: false, msg: "Faltan parámetros" });
    }

    await pool.query(
      `UPDATE tbl_ms_usuario SET ESTADO = ?, FECHA_MODIFICACION = CURRENT_TIMESTAMP, USUARIO_MODIFICACION = ? WHERE ID_USUARIO = ?`,
      [estado, usuarioAccion || 'SISTEMA', id]
    );

    await registrarBitacora({
      usuario: usuarioAccion || 'SISTEMA',
      accion: "CAMBIO_ESTADO_USUARIO",
      descripcion: `Usuario ID ${id} cambió a estado: ${estado}`,
      modulo: "USUARIOS",
      idRegistro: id,
      tabla: "tbl_ms_usuario",
      estado: "EXITO",
      req
    });

    res.json({ ok: true, msg: "Estado actualizado correctamente" });
  } catch (error) {
    console.error("❌ Error en POST /api/cambiar-estado:", error);
    res.status(500).json({ ok: false, msg: "Error al cambiar estado" });
  }
});

// ============================================================
// GET /excel/usuarios -> Descargar Excel de usuarios
// ============================================================
router.get("/usuarios", async (req, res) => {
  try {
    console.log("📊 Generando Excel de usuarios...");

    const [usuarios] = await pool.query(`
      SELECT 
        u.USUARIO,
        u.NOMBRE_USUARIO,
        r.ROL AS ROL,
        u.ESTADO,
        u.CORREO_ELECTRONICO,
        u.TELEFONO_PROFESIONAL,   -- NUEVO
        CASE WHEN u.ACTIVO_2FA = 1 THEN 'Sí' ELSE 'No' END AS ACTIVO_2FA,
        u.FECHA_ULTIMA_CONEXION
      FROM tbl_ms_usuario u
      INNER JOIN tbl_ms_roles r ON u.ID_ROL = r.ID_ROL
      ORDER BY u.ID_USUARIO
    `);

    console.log(`📋 Usuarios encontrados: ${usuarios.length}`);

    if (!usuarios || usuarios.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No hay usuarios para exportar"
      });
    }

    const wb = new xl.Workbook();
    const ws = wb.addWorksheet('Usuarios');

    const headerStyle = wb.createStyle({
      font: { bold: true, color: '#FFFFFF', size: 12 },
      fill: { type: 'pattern', patternType: 'solid', bgColor: '#217346', fgColor: '#217346' },
      alignment: { horizontal: 'center', vertical: 'center' },
    });

    const cellStyle = wb.createStyle({
      alignment: { horizontal: 'left', vertical: 'center' },
      border: {
        left: { style: 'thin', color: '#000000' },
        right: { style: 'thin', color: '#000000' },
        top: { style: 'thin', color: '#000000' },
        bottom: { style: 'thin', color: '#000000' },
      },
    });

    const headers = ['Usuario', 'Nombre', 'Rol', 'Estado', 'Correo', 'Teléfono', '2FA Activado', 'Última Conexión'];
    
    headers.forEach((header, index) => {
      ws.cell(1, index + 1).string(header).style(headerStyle);
    });

    usuarios.forEach((usuario, rowIndex) => {
      const row = rowIndex + 2;
      ws.cell(row, 1).string(usuario.USUARIO || '').style(cellStyle);
      ws.cell(row, 2).string(usuario.NOMBRE_USUARIO || '').style(cellStyle);
      ws.cell(row, 3).string(usuario.ROL || '').style(cellStyle);
      ws.cell(row, 4).string(usuario.ESTADO || '').style(cellStyle);
      ws.cell(row, 5).string(usuario.CORREO_ELECTRONICO || '').style(cellStyle);
      ws.cell(row, 6).string(usuario.TELEFONO_PROFESIONAL || '').style(cellStyle);  // NUEVO
      ws.cell(row, 7).string(usuario.ACTIVO_2FA || 'No').style(cellStyle);
      ws.cell(row, 8).string(usuario.FECHA_ULTIMA_CONEXION ? new Date(usuario.FECHA_ULTIMA_CONEXION).toLocaleString() : 'Nunca').style(cellStyle);
    });

    ws.column(1).setWidth(20);
    ws.column(2).setWidth(30);
    ws.column(3).setWidth(20);
    ws.column(4).setWidth(15);
    ws.column(5).setWidth(30);
    ws.column(6).setWidth(20);   // Teléfono
    ws.column(7).setWidth(18);
    ws.column(8).setWidth(25);

    const fecha = new Date().toISOString().split('T')[0];
    const fileName = `Usuarios_${fecha}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);

    wb.write(fileName, res);

    console.log(`✅ Excel de usuarios generado correctamente: ${usuarios.length} usuarios`);

    try {
      await registrarBitacora({
        usuario: req.user?.nombre || "SISTEMA",
        accion: "EXPORTAR_EXCEL_USUARIOS",
        descripcion: `Exportados ${usuarios.length} usuarios a Excel`,
        modulo: "USUARIOS",
        tabla: "tbl_ms_usuario",
        estado: "EXITO",
        req
      });
    } catch (bitError) {
      console.error("Error registrando bitácora:", bitError);
    }

  } catch (error) {
    console.error("❌ Error exportando Excel de usuarios:", error);
    res.status(500).json({
      success: false,
      message: "Error al generar el archivo Excel: " + error.message
    });
  }
});

// ============================================================
// API: Eliminar usuario permanentemente
// ============================================================
router.post("/api/delete", async (req, res) => {
  try {
    const { id, usuarioAccion } = req.body;
    if (!id) {
      return res.status(400).json({ ok: false, msg: "ID de usuario requerido" });
    }

    const [user] = await pool.query(`SELECT USUARIO FROM tbl_ms_usuario WHERE ID_USUARIO = ?`, [id]);
    const nombreUsuario = user.length ? user[0].USUARIO : 'Desconocido';

    await pool.query(`DELETE FROM tbl_ms_usuario WHERE ID_USUARIO = ?`, [id]);

    await registrarBitacora({
      usuario: usuarioAccion || 'SISTEMA',
      accion: "ELIMINACION_USUARIO",
      descripcion: `Usuario ${nombreUsuario} (ID ${id}) eliminado permanentemente`,
      modulo: "USUARIOS",
      idRegistro: id,
      tabla: "tbl_ms_usuario",
      estado: "EXITO",
      req
    });

    res.json({ ok: true, msg: "Usuario eliminado permanentemente" });
  } catch (error) {
    console.error("❌ Error en POST /api/delete:", error);
    res.status(500).json({ ok: false, msg: "Error al eliminar usuario" });
  }
});

module.exports = router;