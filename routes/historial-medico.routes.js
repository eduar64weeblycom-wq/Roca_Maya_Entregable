const express = require('express');
const router = express.Router();
const db = require('../database/db');
const PDFDocument = require('pdfkit');
const xl = require('excel4node');

// ============================================================
// RUTA PRINCIPAL - Mostrar vista de historial médico
// ============================================================
router.get("/", async (req, res) => {
  try {
    const [pacientes] = await db.query(`
      SELECT ID_PACIENTE, NOMBRES, APELLIDOS
      FROM TBL_PACIENTE
      WHERE ESTADO = 'ACTIVO'
      ORDER BY NOMBRES
    `);
    res.render("historial-medico", {
      pacientes: pacientes || [],
      pacienteSeleccionado: null,
      historial: null
    });
  } catch (err) {
    console.error("❌ Error al obtener pacientes:", err);
    res.render("historial-medico", {
      pacientes: [],
      pacienteSeleccionado: null,
      historial: null
    });
  }
});

// ============================================================
// API: Obtener pacientes activos (para AJAX) - CON CAMPOS AMPLIADOS
// ============================================================
router.get("/pacientes", async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT ID_PACIENTE, NOMBRES, APELLIDOS, TELEFONO, CORREO_ELECTRONICO, NUMERO_DOCUMENTO_IDENTIDAD
      FROM TBL_PACIENTE
      WHERE ESTADO = 'ACTIVO'
      ORDER BY NOMBRES
    `);
    res.json(rows || []);
  } catch (err) {
    console.error("❌ Error al obtener pacientes:", err);
    res.status(500).json({ error: "Error al obtener pacientes" });
  }
});

// ============================================================
// ENDPOINT: Obtener historial médico consolidado
// ============================================================
router.get("/consolidado/:pacienteId", async (req, res) => {
  const { pacienteId } = req.params;

  try {
    // 1. DATOS DEL PACIENTE
    const [pacienteRows] = await db.query(`
      SELECT
        p.ID_PACIENTE,
        p.NOMBRES,
        p.APELLIDOS,
        p.FECHA_NACIMIENTO,
        p.GENERO,
        p.TELEFONO,
        p.CORREO_ELECTRONICO,
        p.DIRECCION,
        p.ESTADO,
        p.RTN_PACIENTE,
        p.OCUPACION,
        p.ESTADO_CIVIL,
        p.FECHA_REGISTRO
      FROM TBL_PACIENTE p
      WHERE p.ID_PACIENTE = ?
    `, [pacienteId]);

    if (pacienteRows.length === 0) {
      return res.status(404).json({ error: "Paciente no encontrado" });
    }

    const paciente = pacienteRows[0];

    // Si no tiene fecha_registro, la buscamos en bitácora
    if (!paciente.FECHA_REGISTRO) {
      const [bitacoraRows] = await db.query(`
        SELECT FECHA_HORA
        FROM TBL_MS_BITACORA
        WHERE ACCION = 'CREACION_PACIENTE'
          AND TABLA_AFECTADA = 'TBL_PACIENTE'
          AND ID_REGISTRO_AFECTADO = ?
        ORDER BY FECHA_HORA ASC
        LIMIT 1
      `, [pacienteId]);
      if (bitacoraRows.length > 0) {
        paciente.FECHA_REGISTRO = bitacoraRows[0].FECHA_HORA;
      }
    }

    // 2. HISTORIAL MÉDICO
    const [historialRows] = await db.query(`
      SELECT
        h.ID_HISTORIAL,
        h.ALERGIAS,
        h.ENFERMEDADES_CRONICAS,
        h.CIRUGIAS_PREVIAS,
        h.MEDICAMENTOS_ACTUALES,
        h.ANTECEDENTES_FAMILIARES,
        h.HABITOS,
        h.VACUNAS,
        h.NOTAS_IMPORTANTES,
        h.FECHA_ACTUALIZACION,
        h.USUARIO_CREACION,
        h.USUARIO_MODIFICACION
      FROM TBL_HISTORIAL_MEDICO h
      WHERE h.ID_PACIENTE = ?
    `, [pacienteId]);

    const historial = historialRows.length > 0 ? historialRows[0] : null;

    // 3. ÚLTIMAS CONSULTAS
    const [consultasRows] = await db.query(`
      SELECT
        cm.ID_CONSULTA,
        cm.FECHA_CONSULTA,
        cm.MOTIVO_CONSULTA,
        cm.SINTOMAS,
        cm.EXAMEN_FISICO,
        cm.DIAGNOSTICO_PRINCIPAL,
        cm.CODIGO_CIE10_PRINCIPAL,
        cm.DIAGNOSTICO_SECUNDARIO,
        cm.CODIGO_CIE10_SECUNDARIO,
        cm.TRATAMIENTO,
        cm.RECOMENDACIONES,
        cm.OBSERVACIONES,
        cm.TIPO_CONSULTA,
        u.NOMBRE_USUARIO AS DOCTOR
      FROM TBL_CONSULTA_MEDICA cm
      INNER JOIN TBL_MS_USUARIO u ON cm.ID_DOCTOR = u.ID_USUARIO
      WHERE cm.ID_PACIENTE = ?
      ORDER BY cm.FECHA_CONSULTA DESC
      LIMIT 10
    `, [pacienteId]);

    // 4. PRECLÍNICAS
    const [preclinicasRows] = await db.query(`
      SELECT
        pr.ID_PRECLINICA,
        pr.FECHA_REGISTRO,
        pr.TEMPERATURA,
        pr.PRESION_SISTOLICA,
        pr.PRESION_DIASTOLICA,
        pr.FRECUENCIA_CARDIACA,
        pr.FRECUENCIA_RESPIRATORIA,
        pr.SATURACION_OXIGENO,
        pr.PESO,
        pr.TALLA,
        pr.IMC,
        pr.GLUCOSA,
        pr.ESTADO_GENERAL,
        pr.OBSERVACIONES,
        u.NOMBRE_USUARIO AS ENFERMERA
      FROM TBL_PRECLINICA pr
      INNER JOIN TBL_MS_USUARIO u ON pr.ID_USUARIO_ENFERMERIA = u.ID_USUARIO
      WHERE pr.ID_CITA IN (
        SELECT ID_CITA FROM TBL_CITAS WHERE ID_PACIENTE = ?
      )
      ORDER BY pr.FECHA_REGISTRO DESC
      LIMIT 10
    `, [pacienteId]);

    // 5. CITAS
    const [citasRows] = await db.query(`
      SELECT
        c.ID_CITA,
        c.FECHA_CITA,
        c.ESTADO,
        c.MOTIVO_CONSULTA,
        c.PRIORIDAD,
        c.TIPO_CITA,
        c.DURACION_ESTIMADA_MIN,
        u.NOMBRE_USUARIO AS DOCTOR
      FROM TBL_CITAS c
      INNER JOIN TBL_MS_USUARIO u ON c.ID_DOCTOR = u.ID_USUARIO
      WHERE c.ID_PACIENTE = ?
      ORDER BY c.FECHA_CITA DESC
      LIMIT 10
    `, [pacienteId]);

    // 6. MEDICAMENTOS PRESCRITOS
    const [medicamentosRows] = await db.query(`
      SELECT
        pr.ID_PRESCRIPCION,
        pr.ID_CONSULTA,
        pr.FECHA_PRESCRIPCION,
        m.NOMBRE_MEDICAMENTO,
        pr.DOSIS,
        pr.FRECUENCIA,
        pr.DURACION,
        pr.INSTRUCCIONES_ADICIONALES,
        pr.ESTADO,
        cm.FECHA_CONSULTA
      FROM TBL_PRESCRIPCION pr
      INNER JOIN TBL_INVENTARIO_MEDICAMENTOS m ON pr.ID_MEDICAMENTO = m.ID_MEDICAMENTO
      INNER JOIN TBL_CONSULTA_MEDICA cm ON pr.ID_CONSULTA = cm.ID_CONSULTA
      WHERE cm.ID_PACIENTE = ?
      ORDER BY pr.FECHA_PRESCRIPCION DESC
      LIMIT 10
    `, [pacienteId]);

    // 7. TOTALES
    const [countRows] = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM TBL_CONSULTA_MEDICA WHERE ID_PACIENTE = ?) AS TOTAL_CONSULTAS,
        (SELECT COUNT(*) FROM TBL_CITAS WHERE ID_PACIENTE = ?) AS TOTAL_CITAS
    `, [pacienteId, pacienteId]);

    res.json({
      success: true,
      paciente: paciente,
      historial: historial,
      consultas: consultasRows,
      preclinicas: preclinicasRows,
      citas: citasRows,
      medicamentos: medicamentosRows,
      totales: {
        consultas: countRows[0]?.TOTAL_CONSULTAS || 0,
        citas: countRows[0]?.TOTAL_CITAS || 0
      }
    });

  } catch (err) {
    console.error("❌ Error al obtener historial consolidado:", err);
    res.status(500).json({
      success: false,
      error: "Error al obtener historial consolidado: " + err.message
    });
  }
});

// ============================================================
// ENDPOINT: Guardar historial desde consulta médica
// ============================================================
router.post("/guardar-desde-consulta/:pacienteId", async (req, res) => {
  const { pacienteId } = req.params;
  const datos = req.body;

  try {
    const [paciente] = await db.query(
      "SELECT ID_PACIENTE FROM TBL_PACIENTE WHERE ID_PACIENTE = ?",
      [pacienteId]
    );
    if (paciente.length === 0) {
      return res.status(404).json({ success: false, error: "Paciente no encontrado" });
    }

    const [existe] = await db.query(
      "SELECT ID_HISTORIAL FROM TBL_HISTORIAL_MEDICO WHERE ID_PACIENTE = ?",
      [pacienteId]
    );

    const {
      ALERGIAS = [],
      ENFERMEDADES_CRONICAS = [],
      CIRUGIAS_PREVIAS = [],
      MEDICAMENTOS_ACTUALES = [],
      ANTECEDENTES_FAMILIARES = [],
      HABITOS = [],
      VACUNAS = [],
      NOTAS_IMPORTANTES = '',
      USUARIO_MODIFICACION = 'SISTEMA'
    } = datos;

    const asegurarArray = (valor) => {
      if (Array.isArray(valor)) return valor;
      if (typeof valor === 'string') {
        if (valor.startsWith('[')) {
          try { return JSON.parse(valor); } catch { return []; }
        }
        return valor.split(',').map(item => item.trim()).filter(item => item !== '');
      }
      return [];
    };

    const alergiasArray = asegurarArray(ALERGIAS);
    const enfermedadesArray = asegurarArray(ENFERMEDADES_CRONICAS);
    const cirugiasArray = asegurarArray(CIRUGIAS_PREVIAS);
    const medicamentosArray = asegurarArray(MEDICAMENTOS_ACTUALES);
    const antecedentesArray = asegurarArray(ANTECEDENTES_FAMILIARES);
    const habitosArray = asegurarArray(HABITOS);
    const vacunasArray = asegurarArray(VACUNAS);

    if (existe.length > 0) {
      await db.query(`
        UPDATE TBL_HISTORIAL_MEDICO SET
          ALERGIAS = ?,
          ENFERMEDADES_CRONICAS = ?,
          CIRUGIAS_PREVIAS = ?,
          MEDICAMENTOS_ACTUALES = ?,
          ANTECEDENTES_FAMILIARES = ?,
          HABITOS = ?,
          VACUNAS = ?,
          NOTAS_IMPORTANTES = ?,
          FECHA_ACTUALIZACION = CURRENT_TIMESTAMP,
          USUARIO_MODIFICACION = ?
        WHERE ID_PACIENTE = ?
      `, [
        JSON.stringify(alergiasArray),
        JSON.stringify(enfermedadesArray),
        JSON.stringify(cirugiasArray),
        JSON.stringify(medicamentosArray),
        JSON.stringify(antecedentesArray),
        JSON.stringify(habitosArray),
        JSON.stringify(vacunasArray),
        NOTAS_IMPORTANTES || '',
        USUARIO_MODIFICACION,
        pacienteId
      ]);

      res.json({ success: true, message: "Historial médico actualizado correctamente desde consulta" });
    } else {
      await db.query(`
        INSERT INTO TBL_HISTORIAL_MEDICO
        (ID_PACIENTE, ALERGIAS, ENFERMEDADES_CRONICAS, CIRUGIAS_PREVIAS,
         MEDICAMENTOS_ACTUALES, ANTECEDENTES_FAMILIARES, HABITOS, VACUNAS,
         NOTAS_IMPORTANTES, USUARIO_CREACION, FECHA_ACTUALIZACION)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `, [
        pacienteId,
        JSON.stringify(alergiasArray),
        JSON.stringify(enfermedadesArray),
        JSON.stringify(cirugiasArray),
        JSON.stringify(medicamentosArray),
        JSON.stringify(antecedentesArray),
        JSON.stringify(habitosArray),
        JSON.stringify(vacunasArray),
        NOTAS_IMPORTANTES || '',
        USUARIO_MODIFICACION
      ]);

      res.json({ success: true, message: "Historial médico creado correctamente desde consulta" });
    }

  } catch (err) {
    console.error("❌ Error al guardar historial desde consulta:", err);
    res.status(500).json({ success: false, error: "Error al guardar historial médico desde consulta: " + err.message });
  }
});

// ============================================================
// Obtener historial médico + datos del paciente (para editar)
// ============================================================
router.get("/:pacienteId", async (req, res) => {
  const { pacienteId } = req.params;
  try {
    const [pacienteRows] = await db.query(`
      SELECT * FROM TBL_PACIENTE WHERE ID_PACIENTE = ?
    `, [pacienteId]);

    if (pacienteRows.length === 0) {
      return res.status(404).json({ error: "Paciente no encontrado" });
    }

    const [historialRows] = await db.query(`
      SELECT * FROM TBL_HISTORIAL_MEDICO WHERE ID_PACIENTE = ?
    `, [pacienteId]);

    res.json({
      paciente: pacienteRows[0],
      historial: historialRows[0] || null
    });
  } catch (err) {
    console.error("❌ Error al obtener historial:", err);
    res.status(500).json({ error: "Error al obtener historial" });
  }
});

// ============================================================
// Crear o actualizar historial médico (guardar)
// ============================================================
router.post("/:pacienteId", async (req, res) => {
  const { pacienteId } = req.params;
  const datos = req.body;

  try {
    const [existe] = await db.query(
      "SELECT * FROM TBL_HISTORIAL_MEDICO WHERE ID_PACIENTE = ?",
      [pacienteId]
    );

    const asegurarArray = (valor) => {
      if (Array.isArray(valor)) return valor;
      if (typeof valor === 'string') {
        if (valor.startsWith('[')) {
          try { return JSON.parse(valor); } catch { return []; }
        }
        return valor.split(',').map(item => item.trim()).filter(item => item !== '');
      }
      return [];
    };

    if (existe.length > 0) {
      await db.query(`
        UPDATE TBL_HISTORIAL_MEDICO SET
          ALERGIAS = ?,
          ENFERMEDADES_CRONICAS = ?,
          CIRUGIAS_PREVIAS = ?,
          MEDICAMENTOS_ACTUALES = ?,
          ANTECEDENTES_FAMILIARES = ?,
          HABITOS = ?,
          VACUNAS = ?,
          NOTAS_IMPORTANTES = ?,
          USUARIO_MODIFICACION = ?
        WHERE ID_PACIENTE = ?
      `, [
        JSON.stringify(asegurarArray(datos.ALERGIAS)),
        JSON.stringify(asegurarArray(datos.ENFERMEDADES_CRONICAS)),
        JSON.stringify(asegurarArray(datos.CIRUGIAS_PREVIAS)),
        JSON.stringify(asegurarArray(datos.MEDICAMENTOS_ACTUALES)),
        JSON.stringify(asegurarArray(datos.ANTECEDENTES_FAMILIARES)),
        JSON.stringify(asegurarArray(datos.HABITOS)),
        JSON.stringify(asegurarArray(datos.VACUNAS)),
        datos.NOTAS_IMPORTANTES || '',
        datos.USUARIO_MODIFICACION || 'admin',
        pacienteId
      ]);

      res.json({ success: true, message: "Historial actualizado correctamente" });
    } else {
      await db.query(`
        INSERT INTO TBL_HISTORIAL_MEDICO
        (ID_PACIENTE, ALERGIAS, ENFERMEDADES_CRONICAS, CIRUGIAS_PREVIAS, MEDICAMENTOS_ACTUALES,
         ANTECEDENTES_FAMILIARES, HABITOS, VACUNAS, NOTAS_IMPORTANTES, USUARIO_CREACION)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        pacienteId,
        JSON.stringify(asegurarArray(datos.ALERGIAS)),
        JSON.stringify(asegurarArray(datos.ENFERMEDADES_CRONICAS)),
        JSON.stringify(asegurarArray(datos.CIRUGIAS_PREVIAS)),
        JSON.stringify(asegurarArray(datos.MEDICAMENTOS_ACTUALES)),
        JSON.stringify(asegurarArray(datos.ANTECEDENTES_FAMILIARES)),
        JSON.stringify(asegurarArray(datos.HABITOS)),
        JSON.stringify(asegurarArray(datos.VACUNAS)),
        datos.NOTAS_IMPORTANTES || '',
        datos.USUARIO_CREACION || 'admin'
      ]);

      res.json({ success: true, message: "Historial creado correctamente" });
    }
  } catch (err) {
    console.error("❌ Error al guardar historial:", err);
    res.status(500).json({ error: "Error al guardar historial: " + err.message });
  }
});

// ============================================================
// EXPORTAR PDF DEL HISTORIAL (CORREGIDO - v.trim fix)
// ============================================================
router.get("/:pacienteId/exportar-pdf", async (req, res) => {
  const { pacienteId } = req.params;

  try {
    // 1. OBTENER DATOS DEL PACIENTE
    const [pacienteRows] = await db.query(`
      SELECT ID_PACIENTE, NOMBRES, APELLIDOS, FECHA_NACIMIENTO, GENERO, TELEFONO,
             CORREO_ELECTRONICO, DIRECCION, ESTADO, RTN_PACIENTE, OCUPACION, ESTADO_CIVIL,
             FECHA_REGISTRO, NUMERO_DOCUMENTO_IDENTIDAD
      FROM TBL_PACIENTE WHERE ID_PACIENTE = ?
    `, [pacienteId]);

    if (pacienteRows.length === 0) {
      return res.status(404).json({ error: "Paciente no encontrado" });
    }
    const paciente = pacienteRows[0];

    // 2. HISTORIAL
    const [historialRows] = await db.query(`
      SELECT ALERGIAS, ENFERMEDADES_CRONICAS, CIRUGIAS_PREVIAS, MEDICAMENTOS_ACTUALES,
             ANTECEDENTES_FAMILIARES, HABITOS, VACUNAS, NOTAS_IMPORTANTES, FECHA_ACTUALIZACION
      FROM TBL_HISTORIAL_MEDICO WHERE ID_PACIENTE = ?
    `, [pacienteId]);
    const historial = historialRows.length > 0 ? historialRows[0] : null;

    // 3. CONSULTAS
    const [consultas] = await db.query(`
      SELECT cm.FECHA_CONSULTA, cm.MOTIVO_CONSULTA, cm.DIAGNOSTICO_PRINCIPAL, cm.TRATAMIENTO,
             cm.RECOMENDACIONES, cm.OBSERVACIONES, cm.TIPO_CONSULTA, u.NOMBRE_USUARIO AS DOCTOR
      FROM TBL_CONSULTA_MEDICA cm
      INNER JOIN TBL_MS_USUARIO u ON cm.ID_DOCTOR = u.ID_USUARIO
      WHERE cm.ID_PACIENTE = ? ORDER BY cm.FECHA_CONSULTA DESC LIMIT 10
    `, [pacienteId]);

    // 4. PRECLÍNICAS
    const [preclinicas] = await db.query(`
      SELECT pr.FECHA_REGISTRO, pr.TEMPERATURA, pr.PRESION_SISTOLICA, pr.PRESION_DIASTOLICA,
             pr.FRECUENCIA_CARDIACA, pr.FRECUENCIA_RESPIRATORIA, pr.SATURACION_OXIGENO,
             pr.PESO, pr.TALLA, pr.IMC, pr.GLUCOSA, pr.ESTADO_GENERAL, pr.OBSERVACIONES,
             u.NOMBRE_USUARIO AS ENFERMERA
      FROM TBL_PRECLINICA pr
      INNER JOIN TBL_MS_USUARIO u ON pr.ID_USUARIO_ENFERMERIA = u.ID_USUARIO
      WHERE pr.ID_CITA IN (SELECT ID_CITA FROM TBL_CITAS WHERE ID_PACIENTE = ?)
      ORDER BY pr.FECHA_REGISTRO DESC LIMIT 10
    `, [pacienteId]);

    // 5. MEDICAMENTOS
    const [medicamentos] = await db.query(`
      SELECT pr.FECHA_PRESCRIPCION, m.NOMBRE_MEDICAMENTO, pr.DOSIS, pr.FRECUENCIA,
             pr.DURACION, pr.ESTADO
      FROM TBL_PRESCRIPCION pr
      INNER JOIN TBL_INVENTARIO_MEDICAMENTOS m ON pr.ID_MEDICAMENTO = m.ID_MEDICAMENTO
      INNER JOIN TBL_CONSULTA_MEDICA cm ON pr.ID_CONSULTA = cm.ID_CONSULTA
      WHERE cm.ID_PACIENTE = ? ORDER BY pr.FECHA_PRESCRIPCION DESC LIMIT 10
    `, [pacienteId]);

    // 6. CREAR EL PDF
    const generarPDF = () => {
      return new Promise((resolve, reject) => {
        try {
          const doc = new PDFDocument({ margin: 40, size: "A4" });
          const azul = "#2c5aa0";
          const gris = "#6c757d";

          // Encabezado
          doc.fillColor(azul).fontSize(18).font("Helvetica-Bold").text("Clínicas Roca Maya", { align: "left" });
          doc.fillColor("#000").fontSize(14).text("Historial Médico del Paciente", { align: "left" });
          doc.moveDown(0.5);
          doc.strokeColor(azul).lineWidth(1).moveTo(40, doc.y).lineTo(555, doc.y).stroke();
          doc.moveDown();

          // Datos del paciente
          doc.fontSize(13).fillColor(azul).font("Helvetica-Bold").text(`${paciente.NOMBRES} ${paciente.APELLIDOS}`);
          doc.fontSize(10).fillColor("#000").font("Helvetica");
          const edadTexto = paciente.FECHA_NACIMIENTO
            ? `${Math.floor((Date.now() - new Date(paciente.FECHA_NACIMIENTO)) / (365.25 * 24 * 3600 * 1000))} años`
            : 'N/A';
          doc.text(`ID: ${paciente.ID_PACIENTE}   |   Edad: ${edadTexto}   |   Género: ${paciente.GENERO || 'N/A'}   |   Estado: ${paciente.ESTADO || 'N/A'}`);
          doc.text(`Teléfono: ${paciente.TELEFONO || 'N/A'}   |   Correo: ${paciente.CORREO_ELECTRONICO || 'N/A'}`);
          doc.text(`Dirección: ${paciente.DIRECCION || 'N/A'}`);
          doc.text(`RTN: ${paciente.RTN_PACIENTE || 'N/A'}   |   Ocupación: ${paciente.OCUPACION || 'N/A'}   |   Estado Civil: ${paciente.ESTADO_CIVIL || 'N/A'}`);
          doc.text(`Registrado el: ${paciente.FECHA_REGISTRO ? new Date(paciente.FECHA_REGISTRO).toLocaleDateString() : 'N/A'}`);
          doc.moveDown();

          const seccion = (titulo) => {
            if (doc.y > 720) doc.addPage();
            doc.moveDown(0.3);
            doc.fontSize(12).fillColor(azul).font("Helvetica-Bold").text(titulo);
            doc.strokeColor("#e9ecef").lineWidth(0.5).moveTo(40, doc.y).lineTo(555, doc.y).stroke();
            doc.moveDown(0.3);
            doc.fontSize(9.5).fillColor("#000").font("Helvetica");
          };

          // ============================================================
          // FUNCIÓN PARA MOSTRAR CAMPOS DEL HISTORIAL (CORREGIDA)
          // ============================================================
          const campo = (label, valor) => {
            // Si el valor es null o undefined, mostrar N/A
            if (valor === null || valor === undefined) {
              doc.text(`${label}: N/A`);
              return;
            }

            let v = valor;

            // Si es un array, unirlo con comas
            if (Array.isArray(v)) {
              v = v.join(', ');
            }

            // Si es un string que parece JSON (empieza con '['), parsearlo y unirlo
            if (typeof v === 'string' && v.startsWith('[')) {
              try {
                const parsed = JSON.parse(v);
                if (Array.isArray(parsed)) {
                  v = parsed.join(', ');
                } else {
                  v = String(parsed);
                }
              } catch {
                // Si falla el parseo, mantener el string original
              }
            }

            // Asegurarnos de que v sea string
            if (typeof v !== 'string') {
              v = String(v);
            }

            // Mostrar el valor o 'N/A' si está vacío
            const texto = v.trim() !== '' ? v : 'N/A';
            doc.text(`${label}: ${texto}`);
          };

          // Información general del historial
          seccion("Información General del Historial");
          if (historial) {
            campo("Alergias", historial.ALERGIAS);
            campo("Enfermedades Crónicas", historial.ENFERMEDADES_CRONICAS);
            campo("Cirugías Previas", historial.CIRUGIAS_PREVIAS);
            campo("Medicamentos Actuales", historial.MEDICAMENTOS_ACTUALES);
            campo("Antecedentes Familiares", historial.ANTECEDENTES_FAMILIARES);
            campo("Hábitos", historial.HABITOS);
            campo("Vacunas", historial.VACUNAS);
            campo("Notas Importantes", historial.NOTAS_IMPORTANTES);
          } else {
            doc.fillColor(gris).text("No hay información general de historial registrada para este paciente.");
          }

          // Consultas
          seccion(`Consultas Médicas (${consultas.length})`);
          if (consultas.length > 0) {
            consultas.forEach(c => {
              doc.font("Helvetica-Bold").text(`${new Date(c.FECHA_CONSULTA).toLocaleDateString()} — Dr(a). ${c.DOCTOR || 'N/A'} (${c.TIPO_CONSULTA || 'GENERAL'})`);
              doc.font("Helvetica").text(`Motivo: ${c.MOTIVO_CONSULTA || 'N/A'}`);
              doc.text(`Diagnóstico: ${c.DIAGNOSTICO_PRINCIPAL || 'N/A'}`);
              doc.text(`Tratamiento: ${c.TRATAMIENTO || 'N/A'}`);
              if (c.RECOMENDACIONES) doc.text(`Recomendaciones: ${c.RECOMENDACIONES}`);
              if (c.OBSERVACIONES) doc.text(`Exámenes Complementarios: ${c.OBSERVACIONES}`);
              doc.moveDown(0.4);
            });
          } else {
            doc.fillColor(gris).text("No hay consultas registradas.");
          }

          // Preclínicas
          seccion(`Registros Preclínicos (${preclinicas.length})`);
          if (preclinicas.length > 0) {
            preclinicas.forEach(p => {
              doc.font("Helvetica-Bold").text(`${new Date(p.FECHA_REGISTRO).toLocaleDateString()} — Enfermera: ${p.ENFERMERA || 'N/A'}`);
              doc.font("Helvetica").text(
                `T°: ${p.TEMPERATURA || 'N/A'}°C   Presión: ${p.PRESION_SISTOLICA || 'N/A'}/${p.PRESION_DIASTOLICA || 'N/A'}   FC: ${p.FRECUENCIA_CARDIACA || 'N/A'}   FR: ${p.FRECUENCIA_RESPIRATORIA || 'N/A'}`
              );
              doc.text(
                `Sat. O2: ${p.SATURACION_OXIGENO || 'N/A'}%   Peso: ${p.PESO || 'N/A'} kg   Talla: ${p.TALLA || 'N/A'} cm   IMC: ${p.IMC || 'N/A'}   Glucosa: ${p.GLUCOSA || 'N/A'}`
              );
              doc.text(`Estado general: ${p.ESTADO_GENERAL || 'N/A'}`);
              if (p.OBSERVACIONES) doc.text(`Observaciones: ${p.OBSERVACIONES}`);
              doc.moveDown(0.4);
            });
          } else {
            doc.fillColor(gris).text("No hay registros preclínicos.");
          }

          // Medicamentos
          seccion(`Medicamentos Prescritos (${medicamentos.length})`);
          if (medicamentos.length > 0) {
            medicamentos.forEach(m => {
              doc.font("Helvetica-Bold").text(`${m.NOMBRE_MEDICAMENTO || 'N/A'}`);
              doc.font("Helvetica").text(
                `Fecha: ${m.FECHA_PRESCRIPCION ? new Date(m.FECHA_PRESCRIPCION).toLocaleDateString() : 'N/A'}   Dosis: ${m.DOSIS || 'N/A'}   Frecuencia: ${m.FRECUENCIA || 'N/A'}   Duración: ${m.DURACION || 'N/A'}   Estado: ${m.ESTADO || 'N/A'}`
              );
              doc.moveDown(0.3);
            });
          } else {
            doc.fillColor(gris).text("No hay medicamentos prescritos.");
          }

          doc.moveDown();
          doc.fontSize(8).fillColor(gris).text(`Documento generado el ${new Date().toLocaleString()}`, { align: "right" });

          // Finalizar el PDF
          doc.end();

          // Resolver la promesa con el documento
          resolve(doc);
        } catch (error) {
          reject(error);
        }
      });
    };

    // 7. GENERAR EL PDF Y ENVIARLO
    const doc = await generarPDF();

    const nombreArchivo = `historial_${pacienteId}_${new Date().toISOString().split('T')[0]}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${nombreArchivo}"`);

    // Manejar errores del stream
    doc.on('error', (err) => {
      console.error('Error en el stream del PDF:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Error al generar el PDF' });
      }
      if (!doc.destroyed) doc.destroy();
    });

    doc.pipe(res);

  } catch (err) {
    console.error("❌ Error al generar PDF:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Error al generar PDF: " + err.message });
    } else {
      res.end();
    }
  }
});

// ============================================================
// EXPORTAR EXCEL DEL HISTORIAL - CON ANTECEDENTES FAMILIARES Y HÁBITOS
// ============================================================
router.get("/excel/historial/:pacienteId", async (req, res) => {
    const { pacienteId } = req.params;
    const xl = require('excel4node');

    try {
        // 1. DATOS DEL PACIENTE
        const [pacienteRows] = await db.query(`
            SELECT ID_PACIENTE, NOMBRES, APELLIDOS, FECHA_NACIMIENTO, GENERO, TELEFONO,
                   CORREO_ELECTRONICO, DIRECCION, ESTADO, RTN_PACIENTE, OCUPACION, ESTADO_CIVIL,
                   FECHA_REGISTRO, NUMERO_DOCUMENTO_IDENTIDAD
            FROM TBL_PACIENTE WHERE ID_PACIENTE = ?
        `, [pacienteId]);

        if (pacienteRows.length === 0) {
            return res.status(404).json({ error: "Paciente no encontrado" });
        }
        const paciente = pacienteRows[0];

        // 2. HISTORIAL (incluyendo ANTECEDENTES_FAMILIARES y HABITOS)
        const [historialRows] = await db.query(`
            SELECT ALERGIAS, ENFERMEDADES_CRONICAS, CIRUGIAS_PREVIAS, MEDICAMENTOS_ACTUALES,
                   VACUNAS, ANTECEDENTES_FAMILIARES, HABITOS, NOTAS_IMPORTANTES, FECHA_ACTUALIZACION
            FROM TBL_HISTORIAL_MEDICO WHERE ID_PACIENTE = ?
        `, [pacienteId]);
        const historial = historialRows.length > 0 ? historialRows[0] : null;

        // 3. CONSULTAS
        const [consultas] = await db.query(`
            SELECT cm.FECHA_CONSULTA, cm.MOTIVO_CONSULTA, cm.DIAGNOSTICO_PRINCIPAL, 
                   cm.TRATAMIENTO, cm.RECOMENDACIONES, 
                   cm.TIPO_CONSULTA, u.NOMBRE_USUARIO AS DOCTOR
            FROM TBL_CONSULTA_MEDICA cm
            INNER JOIN TBL_MS_USUARIO u ON cm.ID_DOCTOR = u.ID_USUARIO
            WHERE cm.ID_PACIENTE = ? ORDER BY cm.FECHA_CONSULTA DESC
        `, [pacienteId]);

        // 4. PRECLÍNICAS (Signos Vitales)
        const [preclinicas] = await db.query(`
            SELECT pr.FECHA_REGISTRO, pr.TEMPERATURA, pr.PRESION_SISTOLICA, pr.PRESION_DIASTOLICA,
                   pr.FRECUENCIA_CARDIACA, pr.SATURACION_OXIGENO,
                   pr.PESO, pr.TALLA, pr.IMC, pr.GLUCOSA, pr.ESTADO_GENERAL,
                   u.NOMBRE_USUARIO AS ENFERMERA
            FROM TBL_PRECLINICA pr
            INNER JOIN TBL_MS_USUARIO u ON pr.ID_USUARIO_ENFERMERIA = u.ID_USUARIO
            WHERE pr.ID_CITA IN (SELECT ID_CITA FROM TBL_CITAS WHERE ID_PACIENTE = ?)
            ORDER BY pr.FECHA_REGISTRO DESC
        `, [pacienteId]);

        // 5. MEDICAMENTOS
        const [medicamentos] = await db.query(`
            SELECT pr.FECHA_PRESCRIPCION, m.NOMBRE_MEDICAMENTO, pr.DOSIS, pr.FRECUENCIA,
                   pr.DURACION, pr.ESTADO
            FROM TBL_PRESCRIPCION pr
            INNER JOIN TBL_INVENTARIO_MEDICAMENTOS m ON pr.ID_MEDICAMENTO = m.ID_MEDICAMENTO
            INNER JOIN TBL_CONSULTA_MEDICA cm ON pr.ID_CONSULTA = cm.ID_CONSULTA
            WHERE cm.ID_PACIENTE = ? ORDER BY pr.FECHA_PRESCRIPCION DESC
        `, [pacienteId]);

        // ============================================================
        // DEFINICIÓN DE ESTILOS
        // ============================================================
        const wb = new xl.Workbook();

        const titleStyle = wb.createStyle({
            font: { bold: true, color: '#0B3051', size: 15, name: 'Calibri' },
            alignment: { horizontal: 'left', vertical: 'center' }
        });

        const labelStyle = wb.createStyle({
            font: { bold: true, color: '#0B3051', size: 11, name: 'Calibri' },
            fill: { type: 'pattern', patternType: 'solid', fgColor: '#EBF3FA' },
            alignment: { horizontal: 'left', vertical: 'center' }
        });

        const valueStyle = wb.createStyle({
            font: { name: 'Calibri', size: 11, color: '#000000' },
            fill: { type: 'pattern', patternType: 'solid', fgColor: '#FFFFFF' },
            alignment: { horizontal: 'left', vertical: 'center' },
            border: {
                bottom: { style: 'thin', color: '#000000' },
                left: { style: 'thin', color: '#000000' },
                right: { style: 'thin', color: '#000000' }
            }
        });

        const headerStyle = wb.createStyle({
            font: { bold: true, color: '#FFFFFF', size: 11, name: 'Calibri' },
            fill: { type: 'pattern', patternType: 'solid', fgColor: '#0B3051' },
            alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
            border: {
                left: { style: 'thin', color: '#000000' }, right: { style: 'thin', color: '#000000' },
                top: { style: 'thin', color: '#000000' }, bottom: { style: 'thin', color: '#000000' }
            }
        });

        const cellStyle = wb.createStyle({
            font: { name: 'Calibri', size: 10 },
            alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
            border: {
                left: { style: 'thin', color: '#CCCCCC' }, right: { style: 'thin', color: '#CCCCCC' },
                top: { style: 'thin', color: '#CCCCCC' }, bottom: { style: 'thin', color: '#CCCCCC' }
            }
        });

        const numberStyle = wb.createStyle({
            font: { name: 'Calibri', size: 10 },
            alignment: { horizontal: 'right', vertical: 'center' },
            border: {
                left: { style: 'thin', color: '#CCCCCC' }, right: { style: 'thin', color: '#CCCCCC' },
                top: { style: 'thin', color: '#CCCCCC' }, bottom: { style: 'thin', color: '#CCCCCC' }
            }
        });

        // ============================================================
        // HOJA 1: DATOS DEL PACIENTE
        // ============================================================
        const wsPaciente = wb.addWorksheet('1. Datos Paciente');

        wsPaciente.cell(1, 1).string('HISTORIAL MÉDICO COMPLETO').style(titleStyle);
        wsPaciente.row(1).setHeight(25);

        const datosPaciente = [
            ['ID Paciente:', paciente.ID_PACIENTE],
            ['Nombre Completo:', `${paciente.NOMBRES || ''} ${paciente.APELLIDOS || ''}`.trim()],
            ['Nombres:', paciente.NOMBRES],
            ['Apellidos:', paciente.APELLIDOS],
            ['Fecha de Nacimiento:', paciente.FECHA_NACIMIENTO ? new Date(paciente.FECHA_NACIMIENTO).toLocaleDateString('es-HN') : 'N/A'],
            ['Edad:', paciente.FECHA_NACIMIENTO ? `${Math.floor((Date.now() - new Date(paciente.FECHA_NACIMIENTO)) / (365.25 * 24 * 3600 * 1000))} años` : 'N/A'],
            ['Género:', paciente.GENERO || 'N/A'],
            ['Teléfono:', paciente.TELEFONO || 'N/A'],
            ['Correo Electrónico:', paciente.CORREO_ELECTRONICO || 'N/A'],
            ['Dirección:', paciente.DIRECCION || 'N/A'],
            ['RTN:', paciente.RTN_PACIENTE || 'N/A'],
            ['Ocupación:', paciente.OCUPACION || 'N/A'],
            ['Estado Civil:', paciente.ESTADO_CIVIL || 'N/A'],
            ['Tipo Documento:', 'DNI'],
            ['Número Documento:', paciente.NUMERO_DOCUMENTO_IDENTIDAD || 'N/A'],
            ['Estado:', paciente.ESTADO || 'N/A']
        ];

        datosPaciente.forEach((fila, idx) => {
            const row = idx + 3;
            wsPaciente.row(row).setHeight(20);
            wsPaciente.cell(row, 1).string(fila[0]).style(labelStyle);
            
            const valorTexto = fila[1] !== null && fila[1] !== undefined ? String(fila[1]) : 'N/A';
            wsPaciente.cell(row, 2).string(valorTexto).style(valueStyle);
        });

        wsPaciente.column(1).setWidth(28);
        wsPaciente.column(2).setWidth(45);

        // ============================================================
        // HOJA 2: HISTORIAL MÉDICO (CON ANTECEDENTES FAMILIARES Y HÁBITOS)
        // ============================================================
        const wsHistorial = wb.addWorksheet('2. Historial Médico');
        wsHistorial.cell(1, 1).string('HISTORIAL MÉDICO').style(titleStyle);
        wsHistorial.row(1).setHeight(25);

        // Se agregaron los dos nuevos campos al array
        const camposHistorial = [
            ['Alergias:', historial ? historial.ALERGIAS : ''],
            ['Enfermedades Crónicas:', historial ? historial.ENFERMEDADES_CRONICAS : ''],
            ['Cirugías Previas:', historial ? historial.CIRUGIAS_PREVIAS : ''],
            ['Medicamentos Actuales:', historial ? historial.MEDICAMENTOS_ACTUALES : ''],
            ['Vacunas:', historial ? historial.VACUNAS : ''],
            ['Antecedentes Familiares:', historial ? historial.ANTECEDENTES_FAMILIARES : ''],   // NUEVO
            ['Hábitos:', historial ? historial.HABITOS : ''],                                     // NUEVO
            ['Notas Importantes:', historial ? historial.NOTAS_IMPORTANTES : ''],
            ['Última Actualización:', historial && historial.FECHA_ACTUALIZACION ? new Date(historial.FECHA_ACTUALIZACION).toLocaleString('es-HN') : '']
        ];

        camposHistorial.forEach((item, idx) => {
            const row = idx + 3;
            wsHistorial.row(row).setHeight(20);
            wsHistorial.cell(row, 1).string(item[0]).style(labelStyle);
            let valor = item[1] || 'Ninguno';
            if (typeof valor === 'string' && valor.startsWith('[')) {
                try {
                    const parsed = JSON.parse(valor);
                    valor = parsed.join(', ');
                } catch {}
            }
            wsHistorial.cell(row, 2).string(String(valor)).style(valueStyle);
        });

        wsHistorial.column(1).setWidth(28);
        wsHistorial.column(2).setWidth(50);

        // ============================================================
        // HOJA 3: CONSULTAS MÉDICAS
        // ============================================================
        const wsConsultas = wb.addWorksheet('3. Consultas Médicas');
        wsConsultas.cell(1, 1).string('CONSULTAS MÉDICAS').style(titleStyle);
        wsConsultas.row(1).setHeight(25);

        const cHeaders = ['Fecha', 'Motivo', 'Diagnóstico', 'Tratamiento', 'Recomendaciones', 'Tipo', 'Doctor'];
        cHeaders.forEach((h, i) => {
            wsConsultas.cell(2, i + 1).string(h).style(headerStyle);
        });
        wsConsultas.row(2).setHeight(25);

        if (consultas.length === 0) {
            wsConsultas.cell(3, 1, 3, 7).string('No hay consultas registradas.').style(cellStyle);
        } else {
            consultas.forEach((c, idx) => {
                const row = idx + 3;
                wsConsultas.cell(row, 1).string(c.FECHA_CONSULTA ? new Date(c.FECHA_CONSULTA).toLocaleDateString('es-HN') : '').style(cellStyle);
                wsConsultas.cell(row, 2).string(c.MOTIVO_CONSULTA || '').style(cellStyle);
                wsConsultas.cell(row, 3).string(c.DIAGNOSTICO_PRINCIPAL || '').style(cellStyle);
                wsConsultas.cell(row, 4).string(c.TRATAMIENTO || '').style(cellStyle);
                wsConsultas.cell(row, 5).string(c.RECOMENDACIONES || '').style(cellStyle);
                wsConsultas.cell(row, 6).string(c.TIPO_CONSULTA || '').style(cellStyle);
                wsConsultas.cell(row, 7).string(c.DOCTOR || '').style(cellStyle);
            });
        }
        [1,2,3,4,5,6,7].forEach(c => wsConsultas.column(c).setWidth(20));

        // ============================================================
        // HOJA 4: SIGNOS VITALES
        // ============================================================
        const wsVitales = wb.addWorksheet('4. Signos Vitales');
        wsVitales.cell(1, 1).string('SIGNOS VITALES').style(titleStyle);
        wsVitales.row(1).setHeight(25);

        const vHeaders = ['Fecha', 'Temp °C', 'P. Sist.', 'P. Diast.', 'F.C.', 'Sat O₂ %', 'Peso (kg)', 'Talla (cm)', 'IMC', 'Glucosa', 'Estado General', 'Enfermera'];
        vHeaders.forEach((h, i) => {
            wsVitales.cell(2, i + 1).string(h).style(headerStyle);
        });
        wsVitales.row(2).setHeight(25);

        if (preclinicas.length === 0) {
            wsVitales.cell(3, 1, 3, 12).string('No hay registros de signos vitales.').style(cellStyle);
        } else {
            preclinicas.forEach((p, idx) => {
                const row = idx + 3;
                wsVitales.cell(row, 1).string(p.FECHA_REGISTRO ? new Date(p.FECHA_REGISTRO).toLocaleDateString('es-HN') : '').style(cellStyle);
                wsVitales.cell(row, 2).number(parseFloat(p.TEMPERATURA) || 0).style(numberStyle);
                wsVitales.cell(row, 3).number(parseFloat(p.PRESION_SISTOLICA) || 0).style(numberStyle);
                wsVitales.cell(row, 4).number(parseFloat(p.PRESION_DIASTOLICA) || 0).style(numberStyle);
                wsVitales.cell(row, 5).number(parseFloat(p.FRECUENCIA_CARDIACA) || 0).style(numberStyle);
                wsVitales.cell(row, 6).number(parseFloat(p.SATURACION_OXIGENO) || 0).style(numberStyle);
                wsVitales.cell(row, 7).number(parseFloat(p.PESO) || 0).style(numberStyle);
                wsVitales.cell(row, 8).number(parseFloat(p.TALLA) || 0).style(numberStyle);
                wsVitales.cell(row, 9).number(parseFloat(p.IMC) || 0).style(numberStyle);
                wsVitales.cell(row, 10).number(parseFloat(p.GLUCOSA) || 0).style(numberStyle);
                wsVitales.cell(row, 11).string(p.ESTADO_GENERAL || '').style(cellStyle);
                wsVitales.cell(row, 12).string(p.ENFERMERA || '').style(cellStyle);
            });
        }
        [1,2,3,4,5,6,7,8,9,10,11,12].forEach(c => wsVitales.column(c).setWidth(15));

        // ============================================================
        // HOJA 5: MEDICAMENTOS
        // ============================================================
        const wsMedicamentos = wb.addWorksheet('5. Medicamentos');
        wsMedicamentos.cell(1, 1).string('MEDICAMENTOS PRESCRITOS').style(titleStyle);
        wsMedicamentos.row(1).setHeight(25);

        const mHeaders = ['Fecha', 'Medicamento', 'Dosis', 'Frecuencia', 'Duración', 'Estado'];
        mHeaders.forEach((h, i) => {
            wsMedicamentos.cell(2, i + 1).string(h).style(headerStyle);
        });
        wsMedicamentos.row(2).setHeight(25);

        if (medicamentos.length === 0) {
            wsMedicamentos.cell(3, 1, 3, 6).string('No hay medicamentos prescritos.').style(cellStyle);
        } else {
            medicamentos.forEach((m, idx) => {
                const row = idx + 3;
                wsMedicamentos.cell(row, 1).string(m.FECHA_PRESCRIPCION ? new Date(m.FECHA_PRESCRIPCION).toLocaleDateString('es-HN') : '').style(cellStyle);
                wsMedicamentos.cell(row, 2).string(m.NOMBRE_MEDICAMENTO || '').style(cellStyle);
                wsMedicamentos.cell(row, 3).string(m.DOSIS || '').style(cellStyle);
                wsMedicamentos.cell(row, 4).string(m.FRECUENCIA || '').style(cellStyle);
                wsMedicamentos.cell(row, 5).string(m.DURACION || '').style(cellStyle);
                wsMedicamentos.cell(row, 6).string(m.ESTADO || '').style(cellStyle);
            });
        }
        [1,2,3,4,5,6].forEach(c => wsMedicamentos.column(c).setWidth(20));

        // ============================================================
        // ENVIAR ARCHIVO
        // ============================================================
        const fecha = new Date().toISOString().split('T')[0];
        const fileName = `Historial_${paciente.NOMBRES}_${paciente.APELLIDOS}_${fecha}.xlsx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
        wb.write(fileName, res);

    } catch (err) {
        console.error("❌ Error al generar Excel:", err);
        res.status(500).json({ error: "Error al generar Excel: " + err.message });
    }
});

module.exports = router;