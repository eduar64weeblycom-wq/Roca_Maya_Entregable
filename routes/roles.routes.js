const express = require('express');
const router = express.Router();
const pool = require('../database/db');

// ============================================================
// GET /roles - Vista principal de roles
// ============================================================
router.get("/", async (req, res) => {
  try {
    const [roles] = await pool.query(`
      SELECT ID_ROL, ROL, DESCRIPCION, ESTADO, FECHA_CREACION 
      FROM TBL_MS_ROLES 
      ORDER BY ID_ROL
    `);
    
    const [objetos] = await pool.query(`
      SELECT ID_OBJETO, OBJETO, DESCRIPCION, TIPO_OBJETO 
      FROM TBL_OBJETOS 
      ORDER BY ID_OBJETO
    `);
    
    const [permisos] = await pool.query(`
      SELECT p.ID_PERMISO, p.ID_ROL, p.ID_OBJETO, 
             p.PERMISO_CONSULTA,
             o.OBJETO
      FROM TBL_PERMISOS p
      INNER JOIN TBL_OBJETOS o ON p.ID_OBJETO = o.ID_OBJETO
      ORDER BY p.ID_ROL, o.ID_OBJETO
    `);
    
    console.log('📋 Roles cargados:', roles.length);
    console.log('📋 Objetos cargados:', objetos.length);
    console.log('📋 Permisos cargados:', permisos.length);
    
    res.render("roles", { 
      roles,
      objetos,
      permisos,
      usuarioLogueado: req.user?.USUARIO || 'SISTEMA'
    });
  } catch (error) {
    console.error("❌ Error en GET /roles:", error);
    res.status(500).send("Error al cargar roles: " + error.message);
  }
});

// ============================================================
// API: Obtener todos los roles (para selectores)
// ============================================================
router.get("/api/roles", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT ID_ROL, ROL, DESCRIPCION, ESTADO 
       FROM TBL_MS_ROLES 
       ORDER BY ID_ROL`
    );
    res.json({ ok: true, roles: rows });
  } catch (error) {
    console.error("❌ Error al obtener roles:", error);
    res.status(500).json({ ok: false, msg: "Error al obtener roles" });
  }
});

// ============================================================
// API: Obtener todos los roles (alias)
// ============================================================
router.get("/api/todos", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT ID_ROL, ROL, DESCRIPCION, ESTADO 
       FROM TBL_MS_ROLES 
       ORDER BY ID_ROL`
    );
    res.json({ ok: true, roles: rows });
  } catch (error) {
    console.error("❌ Error al obtener todos los roles:", error);
    res.status(500).json({ ok: false, msg: "Error al obtener roles" });
  }
});

// ============================================================
// API: Obtener objetos del sistema (menús/páginas)
// ============================================================
router.get("/api/objetos", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT ID_OBJETO, OBJETO, DESCRIPCION, TIPO_OBJETO 
       FROM TBL_OBJETOS 
       ORDER BY ID_OBJETO`
    );
    res.json({ ok: true, objetos: rows });
  } catch (error) {
    console.error("❌ Error al obtener objetos:", error);
    res.status(500).json({ ok: false, msg: "Error al obtener objetos" });
  }
});

// ============================================================
// API: Obtener permisos de un rol específico
// ============================================================
router.get("/api/permisos/:idRol", async (req, res) => {
  try {
    const { idRol } = req.params;
    
    const [permisos] = await pool.query(`
      SELECT p.ID_PERMISO, p.ID_ROL, p.ID_OBJETO, 
             p.PERMISO_CONSULTA,
             o.OBJETO, o.DESCRIPCION AS OBJETO_DESCRIPCION
      FROM TBL_PERMISOS p
      INNER JOIN TBL_OBJETOS o ON p.ID_OBJETO = o.ID_OBJETO
      WHERE p.ID_ROL = ?
      ORDER BY o.ID_OBJETO
    `, [idRol]);
    
    res.json({ ok: true, permisos });
  } catch (error) {
    console.error("❌ Error al obtener permisos:", error);
    res.status(500).json({ ok: false, msg: "Error al obtener permisos" });
  }
});

// ============================================================
// API: Guardar permisos de un rol (SOLO CONSULTA)
// ============================================================
router.post("/api/permisos/guardar", async (req, res) => {
  try {
    const { idRol, permisos, usuarioAccion } = req.body;
    
    if (!idRol) {
      return res.status(400).json({ ok: false, msg: "ID de rol requerido" });
    }
    
    await pool.query(`DELETE FROM TBL_PERMISOS WHERE ID_ROL = ?`, [idRol]);
    
    if (permisos && permisos.length > 0) {
      const values = permisos.map(p => [
        idRol,
        p.idObjeto,
        p.consulta ? 1 : 0,
        usuarioAccion || 'SISTEMA'
      ]);
      
      const query = `
        INSERT INTO TBL_PERMISOS 
        (ID_ROL, ID_OBJETO, PERMISO_CONSULTA, USUARIO_CREACION) 
        VALUES ?
      `;
      
      await pool.query(query, [values]);
    }
    
    res.json({ ok: true, msg: "Permisos guardados exitosamente" });
  } catch (error) {
    console.error("❌ Error al guardar permisos:", error);
    res.status(500).json({ ok: false, msg: "Error al guardar permisos: " + error.message });
  }
});

// ============================================================
// API: Crear nuevo rol
// ============================================================
router.post("/api/crear", async (req, res) => {
  try {
    const { rol, descripcion, estado, usuarioAccion } = req.body;
    
    if (!rol || rol.trim() === '') {
      return res.status(400).json({ ok: false, msg: "El nombre del rol es obligatorio" });
    }

    // Validar estado: solo 'ACTIVO' o 'INACTIVO', por defecto 'ACTIVO'
    let estadoFinal = 'ACTIVO';
    if (estado) {
      const upper = estado.toUpperCase();
      if (upper === 'ACTIVO' || upper === 'INACTIVO') {
        estadoFinal = upper;
      }
    }

    const [existe] = await pool.query(
      `SELECT ID_ROL FROM TBL_MS_ROLES WHERE UPPER(ROL) = UPPER(?)`,
      [rol.trim()]
    );
    
    if (existe.length > 0) {
      return res.status(400).json({ ok: false, msg: "Este rol ya existe" });
    }

    const [result] = await pool.query(
      `INSERT INTO TBL_MS_ROLES (ROL, DESCRIPCION, ESTADO, USUARIO_CREACION) 
       VALUES (?, ?, ?, ?)`,
      [rol.trim(), descripcion || '', estadoFinal, usuarioAccion || 'SISTEMA']
    );

    const nuevoIdRol = result.insertId;

    // Asignar permisos mínimos: SOLO CONSULTA en todos los objetos
    const [objetos] = await pool.query(`SELECT ID_OBJETO FROM TBL_OBJETOS`);
    
    if (objetos.length > 0) {
      const values = objetos.map(o => [
        nuevoIdRol,
        o.ID_OBJETO,
        0,  // PERMISO_CONSULTA
        usuarioAccion || 'SISTEMA'
      ]);
      
      await pool.query(`
        INSERT INTO TBL_PERMISOS 
        (ID_ROL, ID_OBJETO, PERMISO_CONSULTA, USUARIO_CREACION) 
        VALUES ?
      `, [values]);
    }

    res.json({ 
      ok: true, 
      msg: `Rol "${rol.trim()}" creado exitosamente.`,
      id: nuevoIdRol,
      rol: rol.trim()
    });

  } catch (error) {
    console.error("❌ Error en POST /roles/api/crear:", error);
    res.status(500).json({ ok: false, msg: "Error al crear rol: " + error.message });
  }
});

// ============================================================
// API: Actualizar rol
// ============================================================
router.put("/api/actualizar/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { rol, descripcion, estado, usuarioAccion } = req.body;

    if (!rol || rol.trim() === '') {
      return res.status(400).json({ ok: false, msg: "El nombre del rol es obligatorio" });
    }

    // Validar estado
    let estadoFinal = 'ACTIVO';
    if (estado) {
      const upper = estado.toUpperCase();
      if (upper === 'ACTIVO' || upper === 'INACTIVO') {
        estadoFinal = upper;
      }
    }

    const [existe] = await pool.query(
      `SELECT ID_ROL FROM TBL_MS_ROLES 
       WHERE UPPER(ROL) = UPPER(?) AND ID_ROL != ?`,
      [rol.trim(), id]
    );
    
    if (existe.length > 0) {
      return res.status(400).json({ ok: false, msg: "Ya existe otro rol con ese nombre" });
    }

    await pool.query(
      `UPDATE TBL_MS_ROLES 
       SET ROL = ?, DESCRIPCION = ?, ESTADO = ?,
           FECHA_MODIFICACION = CURRENT_TIMESTAMP, 
           USUARIO_MODIFICACION = ? 
       WHERE ID_ROL = ?`,
      [rol.trim(), descripcion || '', estadoFinal, usuarioAccion || 'SISTEMA', id]
    );

    res.json({ ok: true, msg: "Rol actualizado exitosamente" });

  } catch (error) {
    console.error("❌ Error en PUT /roles/api/actualizar:", error);
    res.status(500).json({ ok: false, msg: "Error al actualizar rol" });
  }
});

// ============================================================
// API: Eliminar rol (solo si no tiene usuarios asociados)
// ============================================================
router.delete("/api/eliminar/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { usuarioAccion } = req.body;

    if (parseInt(id) <= 5) {
      return res.status(400).json({ 
        ok: false, 
        msg: "No se pueden eliminar roles del sistema (Administrador, Doctor, Enfermera, Recepcionista, Paciente)" 
      });
    }

    const [usuarios] = await pool.query(
      `SELECT COUNT(*) as total FROM TBL_MS_USUARIO WHERE ID_ROL = ?`,
      [id]
    );

    if (usuarios[0].total > 0) {
      return res.status(400).json({ 
        ok: false, 
        msg: `No se puede eliminar el rol porque tiene ${usuarios[0].total} usuarios asociados.` 
      });
    }

    await pool.query(`DELETE FROM TBL_PERMISOS WHERE ID_ROL = ?`, [id]);

    const [rolData] = await pool.query(
      `SELECT ROL FROM TBL_MS_ROLES WHERE ID_ROL = ?`,
      [id]
    );

    await pool.query(`DELETE FROM TBL_MS_ROLES WHERE ID_ROL = ?`, [id]);

    res.json({ ok: true, msg: `Rol "${rolData[0]?.ROL || 'ID ' + id}" eliminado exitosamente` });

  } catch (error) {
    console.error("❌ Error en DELETE /roles/api/eliminar:", error);
    res.status(500).json({ ok: false, msg: "Error al eliminar rol" });
  }
});

module.exports = router;