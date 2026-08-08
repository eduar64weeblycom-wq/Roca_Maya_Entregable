const express = require("express");
const router = express.Router();
const pool = require("../database/db");
const xl = require('excel4node');
const { registrarBitacora } = require("../services/bitacora.service");

const logError = (error, context) => {
  console.error(`Error en ${context}:`, error);
};

// ============================================================
// GET /pacientes -> Vista
// ============================================================
router.get("/", async (req, res) => {
  try {
    const [pacientes] = await pool.query(`
      SELECT 
        ID_PACIENTE,
        NOMBRES,
        APELLIDOS,
        FECHA_NACIMIENTO,
        GENERO,
        DIRECCION,
        TELEFONO,
        CORREO_ELECTRONICO,
        TIPO_DOCUMENTO_IDENTIDAD,
        NUMERO_DOCUMENTO_IDENTIDAD,
        RTN_PACIENTE,
        ESTADO_CIVIL,
        OCUPACION,
        NOMBRE_CONTACTO_EMERGENCIA,
        TELEFONO_CONTACTO_EMERGENCIA,
        PARENTESCO_CONTACTO_EMERGENCIA,
        ESTADO,
        FECHA_REGISTRO,
        FECHA_ACTUALIZACION,
        USUARIO_CREACION,
        USUARIO_MODIFICACION
      FROM TBL_PACIENTE
      WHERE ESTADO = 'ACTIVO'
      ORDER BY FECHA_REGISTRO DESC
    `);

    res.render("pacientes", {
      title: "Gestión de Pacientes",
      pacientes,
      usuario: req.user || { nombre: "Usuario" },
    });
  } catch (error) {
    logError(error, "GET /");
    res.status(500).render("error", {
      message: "Error al cargar los pacientes",
      error: process.env.NODE_ENV === "development" ? error : {},
    });
  }
});

// ============================================================
// GET /pacientes/api/:id -> detalle con historial
// ============================================================
router.get("/api/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      `
      SELECT 
        p.ID_PACIENTE,
        p.NOMBRES,
        p.APELLIDOS,
        p.FECHA_NACIMIENTO,
        p.GENERO,
        p.DIRECCION,
        p.TELEFONO,
        p.CORREO_ELECTRONICO,
        p.TIPO_DOCUMENTO_IDENTIDAD,
        p.NUMERO_DOCUMENTO_IDENTIDAD,
        p.RTN_PACIENTE,
        p.ESTADO_CIVIL,
        p.OCUPACION,
        p.NOMBRE_CONTACTO_EMERGENCIA,
        p.TELEFONO_CONTACTO_EMERGENCIA,
        p.PARENTESCO_CONTACTO_EMERGENCIA,
        p.ESTADO,
        p.FECHA_REGISTRO,
        p.FECHA_ACTUALIZACION,
        p.USUARIO_CREACION,
        p.USUARIO_MODIFICACION,
        h.ALERGIAS,
        h.ENFERMEDADES_CRONICAS,
        h.CIRUGIAS_PREVIAS,
        h.MEDICAMENTOS_ACTUALES,
        h.VACUNAS,
        h.ANTECEDENTES_FAMILIARES,
        h.HABITOS
      FROM TBL_PACIENTE p
      LEFT JOIN TBL_HISTORIAL_MEDICO h ON p.ID_PACIENTE = h.ID_PACIENTE
      WHERE p.ID_PACIENTE = ?
    `,
      [id]
    );

    if (rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Paciente no encontrado" });
    }

    const paciente = rows[0];
    const camposJSON = ['ALERGIAS', 'ENFERMEDADES_CRONICAS', 'CIRUGIAS_PREVIAS', 'MEDICAMENTOS_ACTUALES', 'VACUNAS', 'ANTECEDENTES_FAMILIARES', 'HABITOS'];
    camposJSON.forEach(campo => {
      if (paciente[campo]) {
        try {
          const parsed = JSON.parse(paciente[campo]);
          paciente[campo] = Array.isArray(parsed) ? parsed : [parsed];
        } catch (e) {
          paciente[campo] = paciente[campo] ? [paciente[campo]] : [];
        }
      } else {
        paciente[campo] = [];
      }
    });

    res.json({ success: true, data: paciente });
  } catch (error) {
    logError(error, "GET /api/:id");
    res.status(500).json({
      success: false,
      message: "Error al obtener paciente",
    });
  }
});

// ============================================================
// POST /pacientes/api -> Crear paciente (CORREGIDO)
// ============================================================
router.post("/api", async (req, res) => {
  try {
    const {
      NOMBRES,
      APELLIDOS,
      FECHA_NACIMIENTO,
      GENERO,
      DIRECCION,
      TELEFONO,
      CORREO_ELECTRONICO,
      TIPO_DOCUMENTO_IDENTIDAD,
      NUMERO_DOCUMENTO_IDENTIDAD,
      RTN_PACIENTE,
      ESTADO_CIVIL,
      OCUPACION,
      NOMBRE_CONTACTO_EMERGENCIA,
      TELEFONO_CONTACTO_EMERGENCIA,
      PARENTESCO_CONTACTO_EMERGENCIA,
      ESTADO = "ACTIVO",
      ALERGIAS,
      ENFERMEDADES_CRONICAS,
      CIRUGIAS_PREVIAS,
      MEDICAMENTOS_ACTUALES,
      VACUNAS,
      ANTECEDENTES_FAMILIARES,   // NUEVO
      HABITOS                    // NUEVO
    } = req.body;

    if (!NOMBRES || !APELLIDOS || !NUMERO_DOCUMENTO_IDENTIDAD) {
      return res.status(400).json({
        success: false,
        message: "Nombres, apellidos y documento son obligatorios",
      });
    }

    const [existe] = await pool.query(
      `SELECT ID_PACIENTE FROM TBL_PACIENTE WHERE NUMERO_DOCUMENTO_IDENTIDAD = ? AND ESTADO = 'ACTIVO'`,
      [NUMERO_DOCUMENTO_IDENTIDAD]
    );

    if (existe.length > 0) {
      return res.status(409).json({
        success: false,
        code: "DUPLICATE_DOCUMENT",
        message: "Ya existe un paciente activo con este número de documento",
        existingId: existe[0].ID_PACIENTE,
      });
    }

    const [result] = await pool.query(
      `
      INSERT INTO TBL_PACIENTE (
        NOMBRES, APELLIDOS, FECHA_NACIMIENTO, GENERO,
        DIRECCION, TELEFONO, CORREO_ELECTRONICO,
        TIPO_DOCUMENTO_IDENTIDAD, NUMERO_DOCUMENTO_IDENTIDAD,
        RTN_PACIENTE, ESTADO_CIVIL, OCUPACION,
        NOMBRE_CONTACTO_EMERGENCIA, TELEFONO_CONTACTO_EMERGENCIA,
        PARENTESCO_CONTACTO_EMERGENCIA, ESTADO, USUARIO_CREACION
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        NOMBRES,
        APELLIDOS,
        FECHA_NACIMIENTO || null,
        GENERO || "OTRO",
        DIRECCION || null,
        TELEFONO || null,
        CORREO_ELECTRONICO || null,
        TIPO_DOCUMENTO_IDENTIDAD || "DNI",
        NUMERO_DOCUMENTO_IDENTIDAD,
        RTN_PACIENTE || null,
        ESTADO_CIVIL || null,
        OCUPACION || null,
        NOMBRE_CONTACTO_EMERGENCIA || null,
        TELEFONO_CONTACTO_EMERGENCIA || null,
        PARENTESCO_CONTACTO_EMERGENCIA || null,
        ESTADO,
        req.user?.nombre || "ADMIN",
      ]
    );

    const pacienteId = result.insertId;

    const parseArray = (str) => {
      if (!str || typeof str !== 'string') return [];
      return str.split(',').map(s => s.trim()).filter(s => s.length > 0);
    };

    const alergiasArray = parseArray(ALERGIAS);
    const enfermedadesArray = parseArray(ENFERMEDADES_CRONICAS);
    const cirugiasArray = parseArray(CIRUGIAS_PREVIAS);
    const medicamentosArray = parseArray(MEDICAMENTOS_ACTUALES);
    const vacunasArray = parseArray(VACUNAS);
    const antecedentesArray = parseArray(ANTECEDENTES_FAMILIARES);   // NUEVO
    const habitosArray = parseArray(HABITOS);                         // NUEVO

    if (alergiasArray.length > 0 || enfermedadesArray.length > 0 || cirugiasArray.length > 0 || 
        medicamentosArray.length > 0 || vacunasArray.length > 0 || antecedentesArray.length > 0 || habitosArray.length > 0) {
      await pool.query(
        `
        INSERT INTO TBL_HISTORIAL_MEDICO (
          ID_PACIENTE,
          ALERGIAS,
          ENFERMEDADES_CRONICAS,
          CIRUGIAS_PREVIAS,
          MEDICAMENTOS_ACTUALES,
          VACUNAS,
          ANTECEDENTES_FAMILIARES,
          HABITOS,
          USUARIO_CREACION
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        [
          pacienteId,
          JSON.stringify(alergiasArray),
          JSON.stringify(enfermedadesArray),
          JSON.stringify(cirugiasArray),
          JSON.stringify(medicamentosArray),
          JSON.stringify(vacunasArray),
          JSON.stringify(antecedentesArray),
          JSON.stringify(habitosArray),
          req.user?.nombre || "ADMIN",
        ]
      );
    }

    res.json({
      success: true,
      message: "Paciente creado correctamente",
      data: { ID_PACIENTE: pacienteId },
    });
  } catch (error) {
    logError(error, "POST /api");
    if (error && error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        code: "DUPLICATE_DOCUMENT",
        message: "Ya existe un paciente con ese número de documento (error DB)",
        existingId: null,
        detail: error.message,
      });
    }
    res.status(500).json({
      success: false,
      message: "Error al crear paciente: " + error.message,
    });
  }
});

// ============================================================
// PUT /pacientes/api/:id -> Actualizar paciente (CORREGIDO)
// ============================================================
router.put("/api/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      NOMBRES,
      APELLIDOS,
      FECHA_NACIMIENTO,
      GENERO,
      DIRECCION,
      TELEFONO,
      CORREO_ELECTRONICO,
      TIPO_DOCUMENTO_IDENTIDAD,
      NUMERO_DOCUMENTO_IDENTIDAD,
      RTN_PACIENTE,
      ESTADO_CIVIL,
      OCUPACION,
      NOMBRE_CONTACTO_EMERGENCIA,
      TELEFONO_CONTACTO_EMERGENCIA,
      PARENTESCO_CONTACTO_EMERGENCIA,
      ESTADO,
      ALERGIAS,
      ENFERMEDADES_CRONICAS,
      CIRUGIAS_PREVIAS,
      MEDICAMENTOS_ACTUALES,
      VACUNAS,
      ANTECEDENTES_FAMILIARES,   // NUEVO
      HABITOS                    // NUEVO
    } = req.body;

    if (!NOMBRES || !APELLIDOS || !NUMERO_DOCUMENTO_IDENTIDAD) {
      return res.status(400).json({
        success: false,
        message: "Nombres, apellidos y documento son obligatorios",
      });
    }

    const [existe] = await pool.query(
      `SELECT ID_PACIENTE FROM TBL_PACIENTE WHERE NUMERO_DOCUMENTO_IDENTIDAD = ? AND ID_PACIENTE != ? AND ESTADO = 'ACTIVO'`,
      [NUMERO_DOCUMENTO_IDENTIDAD, id]
    );

    if (existe.length > 0) {
      return res.status(409).json({
        success: false,
        code: "DUPLICATE_DOCUMENT",
        message: "Ya existe otro paciente activo con este número de documento",
        existingId: existe[0].ID_PACIENTE,
      });
    }

    const [result] = await pool.query(
      `
      UPDATE TBL_PACIENTE SET
        NOMBRES = ?, APELLIDOS = ?, FECHA_NACIMIENTO = ?, GENERO = ?,
        DIRECCION = ?, TELEFONO = ?, CORREO_ELECTRONICO = ?,
        TIPO_DOCUMENTO_IDENTIDAD = ?, NUMERO_DOCUMENTO_IDENTIDAD = ?,
        RTN_PACIENTE = ?, ESTADO_CIVIL = ?, OCUPACION = ?,
        NOMBRE_CONTACTO_EMERGENCIA = ?, TELEFONO_CONTACTO_EMERGENCIA = ?,
        PARENTESCO_CONTACTO_EMERGENCIA = ?, ESTADO = ?,
        FECHA_ACTUALIZACION = NOW(), USUARIO_MODIFICACION = ?
      WHERE ID_PACIENTE = ?
    `,
      [
        NOMBRES,
        APELLIDOS,
        FECHA_NACIMIENTO || null,
        GENERO || "OTRO",
        DIRECCION || null,
        TELEFONO || null,
        CORREO_ELECTRONICO || null,
        TIPO_DOCUMENTO_IDENTIDAD || "DNI",
        NUMERO_DOCUMENTO_IDENTIDAD,
        RTN_PACIENTE || null,
        ESTADO_CIVIL || null,
        OCUPACION || null,
        NOMBRE_CONTACTO_EMERGENCIA || null,
        TELEFONO_CONTACTO_EMERGENCIA || null,
        PARENTESCO_CONTACTO_EMERGENCIA || null,
        ESTADO,
        req.user?.nombre || "ADMIN",
        id,
      ]
    );

    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Paciente no encontrado" });
    }

    const parseArray = (str) => {
      if (!str || typeof str !== 'string') return [];
      return str.split(',').map(s => s.trim()).filter(s => s.length > 0);
    };

    const alergiasArray = parseArray(ALERGIAS);
    const enfermedadesArray = parseArray(ENFERMEDADES_CRONICAS);
    const cirugiasArray = parseArray(CIRUGIAS_PREVIAS);
    const medicamentosArray = parseArray(MEDICAMENTOS_ACTUALES);
    const vacunasArray = parseArray(VACUNAS);
    const antecedentesArray = parseArray(ANTECEDENTES_FAMILIARES);   // NUEVO
    const habitosArray = parseArray(HABITOS);                         // NUEVO

    const [historialExistente] = await pool.query(
      `SELECT ID_HISTORIAL FROM TBL_HISTORIAL_MEDICO WHERE ID_PACIENTE = ?`,
      [id]
    );

    if (historialExistente.length > 0) {
      await pool.query(
        `
        UPDATE TBL_HISTORIAL_MEDICO SET
          ALERGIAS = ?,
          ENFERMEDADES_CRONICAS = ?,
          CIRUGIAS_PREVIAS = ?,
          MEDICAMENTOS_ACTUALES = ?,
          VACUNAS = ?,
          ANTECEDENTES_FAMILIARES = ?,
          HABITOS = ?,
          FECHA_ACTUALIZACION = NOW(),
          USUARIO_MODIFICACION = ?
        WHERE ID_PACIENTE = ?
      `,
        [
          JSON.stringify(alergiasArray),
          JSON.stringify(enfermedadesArray),
          JSON.stringify(cirugiasArray),
          JSON.stringify(medicamentosArray),
          JSON.stringify(vacunasArray),
          JSON.stringify(antecedentesArray),
          JSON.stringify(habitosArray),
          req.user?.nombre || "ADMIN",
          id,
        ]
      );
    } else {
      if (alergiasArray.length > 0 || enfermedadesArray.length > 0 || cirugiasArray.length > 0 || 
          medicamentosArray.length > 0 || vacunasArray.length > 0 || antecedentesArray.length > 0 || habitosArray.length > 0) {
        await pool.query(
          `
          INSERT INTO TBL_HISTORIAL_MEDICO (
            ID_PACIENTE,
            ALERGIAS,
            ENFERMEDADES_CRONICAS,
            CIRUGIAS_PREVIAS,
            MEDICAMENTOS_ACTUALES,
            VACUNAS,
            ANTECEDENTES_FAMILIARES,
            HABITOS,
            USUARIO_CREACION
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
          [
            id,
            JSON.stringify(alergiasArray),
            JSON.stringify(enfermedadesArray),
            JSON.stringify(cirugiasArray),
            JSON.stringify(medicamentosArray),
            JSON.stringify(vacunasArray),
            JSON.stringify(antecedentesArray),
            JSON.stringify(habitosArray),
            req.user?.nombre || "ADMIN",
          ]
        );
      }
    }

    res.json({ success: true, message: "Paciente actualizado correctamente" });
  } catch (error) {
    logError(error, "PUT /api/:id");
    if (error && error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        code: "DUPLICATE_DOCUMENT",
        message: "Ya existe otro paciente con ese número de documento (error DB)",
        existingId: null,
        detail: error.message,
      });
    }
    res.status(500).json({
      success: false,
      message: "Error al actualizar paciente: " + error.message,
    });
  }
});

// ============================================================
// DELETE /pacientes/api/:id -> Inactivar
// ============================================================
router.delete("/api/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const [result] = await pool.query(
      `
      UPDATE TBL_PACIENTE SET
        ESTADO = 'INACTIVO',
        FECHA_ACTUALIZACION = NOW(),
        USUARIO_MODIFICACION = ?
      WHERE ID_PACIENTE = ?
    `,
      [req.user?.nombre || "ADMIN", id]
    );

    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Paciente no encontrado" });
    }

    res.json({ success: true, message: "Paciente eliminado correctamente" });
  } catch (error) {
    logError(error, "DELETE /api/:id");
    res.status(500).json({
      success: false,
      message: "Error al eliminar paciente",
    });
  }
});

// ============================================================
// GET /pacientes/api/excel -> Descargar Excel
// ============================================================
router.get("/api/excel", async (req, res) => {
  try {
    console.log("📊 Generando Excel con excel4node...");

    const [pacientes] = await pool.query(`
      SELECT 
        NOMBRES,
        APELLIDOS,
        TIPO_DOCUMENTO_IDENTIDAD,
        NUMERO_DOCUMENTO_IDENTIDAD,
        GENERO,
        TELEFONO,
        CORREO_ELECTRONICO,
        ESTADO
      FROM TBL_PACIENTE
      WHERE ESTADO = 'ACTIVO'
      ORDER BY APELLIDOS, NOMBRES
    `);

    console.log(`📋 Pacientes encontrados: ${pacientes.length}`);

    if (!pacientes || pacientes.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No hay pacientes para exportar"
      });
    }

    const wb = new xl.Workbook();
    const ws = wb.addWorksheet('Pacientes');

    const headerStyle = wb.createStyle({
      font: {
        bold: true,
        color: '#FFFFFF',
        size: 12,
      },
      fill: {
        type: 'pattern',
        patternType: 'solid',
        bgColor: '#217346',
        fgColor: '#217346',
      },
      alignment: {
        horizontal: 'center',
        vertical: 'center',
      },
    });

    const cellStyle = wb.createStyle({
      alignment: {
        horizontal: 'left',
        vertical: 'center',
      },
      border: {
        left: { style: 'thin', color: '#000000' },
        right: { style: 'thin', color: '#000000' },
        top: { style: 'thin', color: '#000000' },
        bottom: { style: 'thin', color: '#000000' },
      },
    });

    const headers = ['Nombres', 'Apellidos', 'Tipo Documento', 'Número Documento', 'Género', 'Teléfono', 'Correo Electrónico', 'Estado'];
    
    headers.forEach((header, index) => {
      ws.cell(1, index + 1)
        .string(header)
        .style(headerStyle);
    });

    pacientes.forEach((paciente, rowIndex) => {
      const row = rowIndex + 2;
      
      ws.cell(row, 1).string(paciente.NOMBRES || '').style(cellStyle);
      ws.cell(row, 2).string(paciente.APELLIDOS || '').style(cellStyle);
      ws.cell(row, 3).string(paciente.TIPO_DOCUMENTO_IDENTIDAD || '').style(cellStyle);
      ws.cell(row, 4).string(paciente.NUMERO_DOCUMENTO_IDENTIDAD || '').style(cellStyle);
      ws.cell(row, 5).string(paciente.GENERO || '').style(cellStyle);
      ws.cell(row, 6).string(paciente.TELEFONO || '').style(cellStyle);
      ws.cell(row, 7).string(paciente.CORREO_ELECTRONICO || '').style(cellStyle);
      ws.cell(row, 8).string(paciente.ESTADO || '').style(cellStyle);
    });

    ws.column(1).setWidth(25);
    ws.column(2).setWidth(25);
    ws.column(3).setWidth(20);
    ws.column(4).setWidth(20);
    ws.column(5).setWidth(15);
    ws.column(6).setWidth(20);
    ws.column(7).setWidth(30);
    ws.column(8).setWidth(15);

    const fecha = new Date().toISOString().split('T')[0];
    const fileName = `Pacientes_${fecha}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);

    wb.write(fileName, res);

    console.log(`✅ Excel generado correctamente: ${pacientes.length} pacientes`);

    try {
      await registrarBitacora({
        usuario: req.user?.nombre || "SISTEMA",
        accion: "EXPORTAR_EXCEL_PACIENTES",
        descripcion: `Exportados ${pacientes.length} pacientes a Excel`,
        modulo: "PACIENTES",
        tabla: "TBL_PACIENTE",
        estado: "EXITO",
        req
      });
    } catch (bitError) {
      console.error("Error registrando bitácora:", bitError);
    }

  } catch (error) {
    console.error("❌ Error exportando Excel:", error);
    res.status(500).json({
      success: false,
      message: "Error al generar el archivo Excel: " + error.message
    });
  }
});

module.exports = router;