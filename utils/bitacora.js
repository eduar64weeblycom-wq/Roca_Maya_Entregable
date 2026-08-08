const pool = require('../database/db');

/**
 * Registra una acción en la bitácora
 * @param {string} accion 
 * @param {string} modulo 
 * @param {string} descripcion 
 * @param {number|null} idUsuario 
 */
async function registrarBitacora(accion, modulo, descripcion, idUsuario = null) {
  try {
    await pool.query(
      `INSERT INTO tbl_ms_BITACORA 
         (FECHA_HORA, ID_USUARIO, ACCION, DESCRIPCION, MODULO)
       VALUES (NOW(), ?, ?, ?, ?)`,
      [idUsuario, accion, descripcion, modulo]
    );
  } catch (error) {
    console.error('Error al registrar en bitácora:', error.message);
    // No lanzamos el error para que no falle la operación principal
  }
}

module.exports = { registrarBitacora };