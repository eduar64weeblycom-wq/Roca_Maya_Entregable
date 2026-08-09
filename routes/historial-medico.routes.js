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
      FROM tbl_paciente
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
      FROM tbl_paciente
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
      FROM tbl_paciente p
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
        FROM tbl_ms_bitacora
        WHERE ACCION = 'CREACION_PACIENTE'
          AND TABLA_AFECTADA = 'tbl_paciente'
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
      FROM tbl_historial_medico h
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
      FROM tbl_consulta_medica cm
      INNER JOIN tbl_ms_usuario u ON cm.ID_DOCTOR = u.ID_USUARIO
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
      FROM tbl_preclinica pr
      INNER JOIN tbl_ms_usuario u ON pr.ID_USUARIO_ENFERMERIA = u.ID_USUARIO
      WHERE pr.ID_CITA IN (
        SELECT ID_CITA FROM tbl_citas WHERE ID_PACIENTE = ?
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
      FROM tbl_citas c
      INNER JOIN tbl_ms_usuario u ON c.ID_DOCTOR = u.ID_USUARIO
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
      INNER JOIN tbl_inventario_medicamentos m ON pr.ID_MEDICAMENTO = m.ID_MEDICAMENTO
      INNER JOIN tbl_consulta_medica cm ON pr.ID_CONSULTA = cm.ID_CONSULTA
      WHERE cm.ID_PACIENTE = ?
      ORDER BY pr.FECHA_PRESCRIPCION DESC
      LIMIT 10
    `, [pacienteId]);

    // 7. TOTALES
    const [countRows] = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM tbl_consulta_medica WHERE ID_PACIENTE = ?) AS TOTAL_CONSULTAS,
        (SELECT COUNT(*) FROM tbl_citas WHERE ID_PACIENTE = ?) AS TOTAL_CITAS
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
      "SELECT ID_PACIENTE FROM tbl_paciente WHERE ID_PACIENTE = ?",
      [pacienteId]
    );
    if (paciente.length === 0) {
      return res.status(404).json({ success: false, error: "Paciente no encontrado" });
    }

    const [existe] = await db.query(
      "SELECT ID_HISTORIAL FROM tbl_historial_medico WHERE ID_PACIENTE = ?",
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
        UPDATE FROM tbl_historial_medico SET
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
        INSERT INTO FROM tbl_historial_medico
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
      SELECT * FROM tbl_paciente WHERE ID_PACIENTE = ?
    `, [pacienteId]);

    if (pacienteRows.length === 0) {
      return res.status(404).json({ error: "Paciente no encontrado" });
    }

    const [historialRows] = await db.query(`
      SELECT * FROM tbl_historial_medico WHERE ID_PACIENTE = ?
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
      "SELECT * FROM tbl_historial_medico WHERE ID_PACIENTE = ?",
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
        UPDATE FROM tbl_historial_medico SET
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
        INSERT INTO FROM tbl_historial_medico
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
      FROM tbl_paciente WHERE ID_PACIENTE = ?
    `, [pacienteId]);

    if (pacienteRows.length === 0) {
      return res.status(404).json({ error: "Paciente no encontrado" });
    }
    const paciente = pacienteRows[0];

    // 2. HISTORIAL
    const [historialRows] = await db.query(`
      SELECT ALERGIAS, ENFERMEDADES_CRONICAS, CIRUGIAS_PREVIAS, MEDICAMENTOS_ACTUALES,
             ANTECEDENTES_FAMILIARES, HABITOS, VACUNAS, NOTAS_IMPORTANTES, FECHA_ACTUALIZACION
      FROM tbl_historial_medico WHERE ID_PACIENTE = ?
    `, [pacienteId]);
    const historial = historialRows.length > 0 ? historialRows[0] : null;

    // 3. CONSULTAS
    const [consultas] = await db.query(`
      SELECT cm.FECHA_CONSULTA, cm.MOTIVO_CONSULTA, cm.DIAGNOSTICO_PRINCIPAL, cm.TRATAMIENTO,
             cm.RECOMENDACIONES, cm.OBSERVACIONES, cm.TIPO_CONSULTA, u.NOMBRE_USUARIO AS DOCTOR
      FROM tbl_consulta_medica cm
      INNER JOIN tbl_ms_usuario u ON cm.ID_DOCTOR = u.ID_USUARIO
      WHERE cm.ID_PACIENTE = ? ORDER BY cm.FECHA_CONSULTA DESC LIMIT 10
    `, [pacienteId]);

    // 4. PRECLÍNICAS
    const [preclinicas] = await db.query(`
      SELECT pr.FECHA_REGISTRO, pr.TEMPERATURA, pr.PRESION_SISTOLICA, pr.PRESION_DIASTOLICA,
             pr.FRECUENCIA_CARDIACA, pr.FRECUENCIA_RESPIRATORIA, pr.SATURACION_OXIGENO,
             pr.PESO, pr.TALLA, pr.IMC, pr.GLUCOSA, pr.ESTADO_GENERAL, pr.OBSERVACIONES,
             u.NOMBRE_USUARIO AS ENFERMERA
      FROM tbl_preclinica pr
      INNER JOIN tbl_ms_usuario u ON pr.ID_USUARIO_ENFERMERIA = u.ID_USUARIO
      WHERE pr.ID_CITA IN (SELECT ID_CITA FROM tbl_citas WHERE ID_PACIENTE = ?)
      ORDER BY pr.FECHA_REGISTRO DESC LIMIT 10
    `, [pacienteId]);

    // 5. MEDICAMENTOS
    const [medicamentos] = await db.query(`
      SELECT pr.FECHA_PRESCRIPCION, m.NOMBRE_MEDICAMENTO, pr.DOSIS, pr.FRECUENCIA,
             pr.DURACION, pr.ESTADO
      FROM TBL_PRESCRIPCION pr
      INNER JOIN tbl_inventario_medicamentos m ON pr.ID_MEDICAMENTO = m.ID_MEDICAMENTO
      INNER JOIN tbl_consulta_medica cm ON pr.ID_CONSULTA = cm.ID_CONSULTA
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
            FROM tbl_paciente WHERE ID_PACIENTE = ?
        `, [pacienteId]);

        if (pacienteRows.length === 0) {
            return res.status(404).json({ error: "Paciente no encontrado" });
        }
        const paciente = pacienteRows[0];

        // 2. HISTORIAL (incluyendo ANTECEDENTES_FAMILIARES y HABITOS)
        const [historialRows] = await db.query(`
            SELECT ALERGIAS, ENFERMEDADES_CRONICAS, CIRUGIAS_PREVIAS, MEDICAMENTOS_ACTUALES,
                   VACUNAS, ANTECEDENTES_FAMILIARES, HABITOS, NOTAS_IMPORTANTES, FECHA_ACTUALIZACION
            FROM tbl_historial_medico WHERE ID_PACIENTE = ?
        `, [pacienteId]);
        const historial = historialRows.length > 0 ? historialRows[0] : null;

        // 3. CONSULTAS
        const [consultas] = await db.query(`
            SELECT cm.FECHA_CONSULTA, cm.MOTIVO_CONSULTA, cm.DIAGNOSTICO_PRINCIPAL, 
                   cm.TRATAMIENTO, cm.RECOMENDACIONES, 
                   cm.TIPO_CONSULTA, u.NOMBRE_USUARIO AS DOCTOR
            FROM tbl_consulta_medica cm
            INNER JOIN tbl_ms_usuario u ON cm.ID_DOCTOR = u.ID_USUARIO
            WHERE cm.ID_PACIENTE = ? ORDER BY cm.FECHA_CONSULTA DESC
        `, [pacienteId]);

        // 4. PRECLÍNICAS (Signos Vitales)
        const [preclinicas] = await db.query(`
            SELECT pr.FECHA_REGISTRO, pr.TEMPERATURA, pr.PRESION_SISTOLICA, pr.PRESION_DIASTOLICA,
                   pr.FRECUENCIA_CARDIACA, pr.SATURACION_OXIGENO,
                   pr.PESO, pr.TALLA, pr.IMC, pr.GLUCOSA, pr.ESTADO_GENERAL,
                   u.NOMBRE_USUARIO AS ENFERMERA
            FROM tbl_preclinica pr
            INNER JOIN tbl_ms_usuario u ON pr.ID_USUARIO_ENFERMERIA = u.ID_USUARIO
            WHERE pr.ID_CITA IN (SELECT ID_CITA FROM tbl_citas WHERE ID_PACIENTE = ?)
            ORDER BY pr.FECHA_REGISTRO DESC
        `, [pacienteId]);

        // 5. MEDICAMENTOS
        const [medicamentos] = await db.query(`
            SELECT pr.FECHA_PRESCRIPCION, m.NOMBRE_MEDICAMENTO, pr.DOSIS, pr.FRECUENCIA,
                   pr.DURACION, pr.ESTADO
            FROM TBL_PRESCRIPCION pr
            INNER JOIN tbl_inventario_medicamentos m ON pr.ID_MEDICAMENTO = m.ID_MEDICAMENTO
            INNER JOIN tbl_consulta_medica cm ON pr.ID_CONSULTA = cm.ID_CONSULTA
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
           ['Fecha de Nacimiento:', paciente.FECHA_NACIMIENTO ? new Date(paciente.FECHA_NACIMIENTO).toISOString().split('T')[0] : 'N/A'],
            ['Género:', paciente.GENERO],
            ['Teléfono:', paciente.TELEFONO],
            ['Correo Electrónico:', paciente.CORREO_ELECTRONICO],
            ['Dirección:', paciente.DIRECCION],
            ['Estado:', paciente.ESTADO],
            ['RTN:', paciente.RTN_PACIENTE],
            ['Ocupación:', paciente.OCUPACION],
            ['Estado Civil:', paciente.ESTADO_CIVIL],
            ['Número de Documento:', paciente.NUMERO_DOCUMENTO_IDENTIDAD],
            ['Fecha de Registro:', paciente.FECHA_REGISTRO ? new Date(paciente.FECHA_REGISTRO).toLocaleString() : 'N/A']
        ];

        let currentRow = 3;
        wsPaciente.cell(currentRow, 1).string('INFORMACIÓN GENERAL DEL PACIENTE').style(titleStyle);
        currentRow++;

        datosPaciente.forEach(([label, value]) => {
            wsPaciente.cell(currentRow, 1).string(label).style(labelStyle);
            wsPaciente.cell(currentRow, 2).string(value !== null && value !== undefined ? String(value) : 'N/A').style(valueStyle);
            currentRow++;
        });

        // ============================================================
        // HOJA 2: HISTORIAL CLÍNICO (Alergias, Antecedentes, etc.)
        // ============================================================
        const wsHistorial = wb.addWorksheet('2. Historial Clínico');
        wsHistorial.cell(1, 1).string('ANTECEDENTES Y CONDICIONES MÉDICAS').style(titleStyle);

        const formatearArrayExcel = (valor) => {
            if (!valor) return 'N/A';
            if (Array.isArray(valor)) return valor.join(', ');
            if (typeof valor === 'string' && valor.startsWith('[')) {
                try {
                    const parsed = JSON.parse(valor);
                    if (Array.isArray(parsed)) return parsed.join(', ');
                    return String(parsed);
                } catch {
                    return valor;
                }
            }
            return String(valor);
        };

        const datosHistorial = historial ? [
            ['Alergias:', formatearArrayExcel(historial.ALERGIAS)],
            ['Enfermedades Crónicas:', formatearArrayExcel(historial.ENFERMEDADES_CRONICAS)],
            ['Cirugías Previas:', formatearArrayExcel(historial.CIRUGIAS_PREVIAS)],
            ['Medicamentos Actuales:', formatearArrayExcel(historial.MEDICAMENTOS_ACTUALES)],
            ['Vacunas:', formatearArrayExcel(historial.VACUNAS)],
            ['Antecedentes Familiares:', formatearArrayExcel(historial.ANTECEDENTES_FAMILIARES)],
            ['Hábitos:', formatearArrayExcel(historial.HABITOS)],
            ['Notas Importantes:', historial.NOTAS_IMPORTANTES || 'N/A'],
            ['Última Actualización:', historial.FECHA_ACTUALIZACION ? new Date(historial.FECHA_ACTUALIZACION).toLocaleString() : 'N/A']
        ] : [['Estado', 'No hay información de historial registrada']];

        currentRow = 3;
        datosHistorial.forEach(([label, value]) => {
            wsHistorial.cell(currentRow, 1).string(label).style(labelStyle);
            wsHistorial.cell(currentRow, 2).string(value).style(valueStyle);
            currentRow++;
        });

        // ============================================================
        // HOJA 3: CONSULTAS MÉDICAS
        // ============================================================
        const wsConsultas = wb.addWorksheet('3. Consultas Médicas');
        wsConsultas.cell(1, 1).string('HISTORIAL DE CONSULTAS MÉDICAS').style(titleStyle);

        const headersConsultas = ['Fecha', 'Tipo', 'Doctor', 'Motivo', 'Diagnóstico Principal', 'Tratamiento', 'Recomendaciones'];
        headersConsultas.forEach((h, idx) => {
            wsConsultas.cell(3, idx + 1).string(h).style(headerStyle);
        });

        if (consultas.length > 0) {
            consultas.forEach((c, idx) => {
                const r = 4 + idx;
                wsConsultas.cell(r, 1).string(c.FECHA_CONSULTA ? new Date(c.FECHA_CONSULTA).toLocaleDateString() : 'N/A').style(cellStyle);
                wsConsultas.cell(r, 2).string(c.TIPO_CONSULTA || 'GENERAL').style(cellStyle);
                wsConsultas.cell(r, 3).string(c.DOCTOR || 'N/A').style(cellStyle);
                wsConsultas.cell(r, 4).string(c.MOTIVO_CONSULTA || 'N/A').style(cellStyle);
                wsConsultas.cell(r, 5).string(c.DIAGNOSTICO_PRINCIPAL || 'N/A').style(cellStyle);
                wsConsultas.cell(r, 6).string(c.TRATAMIENTO || 'N/A').style(cellStyle);
                wsConsultas.cell(r, 7).string(c.RECOMENDACIONES || 'N/A').style(cellStyle);
            });
        }

        // ============================================================
        // HOJA 4: PRECLÍNICAS (Signos Vitales)
        // ============================================================
        const wsPreclinica = wb.addWorksheet('4. Preclínicas');
        wsPreclinica.cell(1, 1).string('REGISTROS PRECLÍNICOS Y SIGNOS VITALES').style(titleStyle);

        const headersPreclinica = ['Fecha', 'Enfermera(o)', 'Temp (°C)', 'Presión', 'FC (bpm)', 'Sat O2 (%)', 'Peso (kg)', 'Talla (cm)', 'IMC', 'Glucosa', 'Estado General', 'Observaciones'];
        headersPreclinica.forEach((h, idx) => {
            wsPreclinica.cell(3, idx + 1).string(h).style(headerStyle);
        });

        if (preclinicas.length > 0) {
            preclinicas.forEach((p, idx) => {
                const r = 4 + idx;
                wsPreclinica.cell(r, 1).string(p.FECHA_REGISTRO ? new Date(p.FECHA_REGISTRO).toLocaleString() : 'N/A').style(cellStyle);
                wsPreclinica.cell(r, 2).string(p.ENFERMERA || 'N/A').style(cellStyle);
                wsPreclinica.cell(r, 3).string(p.TEMPERATURA ? String(p.TEMPERATURA) : 'N/A').style(numberStyle);
                wsPreclinica.cell(r, 4).string(`${p.PRESION_SISTOLICA || '0'}/${p.PRESION_DIASTOLICA || '0'}`).style(cellStyle);
                wsPreclinica.cell(r, 5).string(p.FRECUENCIA_CARDIACA ? String(p.FRECUENCIA_CARDIACA) : 'N/A').style(numberStyle);
                wsPreclinica.cell(r, 6).string(p.SATURACION_OXIGENO ? String(p.SATURACION_OXIGENO) : 'N/A').style(numberStyle);
                wsPreclinica.cell(r, 7).string(p.PESO ? String(p.PESO) : 'N/A').style(numberStyle);
                wsPreclinica.cell(r, 8).string(p.TALLA ? String(p.TALLA) : 'N/A').style(numberStyle);
                wsPreclinica.cell(r, 9).string(p.IMC ? String(p.IMC) : 'N/A').style(numberStyle);
                wsPreclinica.cell(r, 10).string(p.GLUCOSA ? String(p.GLUCOSA) : 'N/A').style(numberStyle);
                wsPreclinica.cell(r, 11).string(p.ESTADO_GENERAL || 'N/A').style(cellStyle);
                wsPreclinica.cell(r, 12).string(p.OBSERVACIONES || 'N/A').style(cellStyle);
            });
        }

        // ============================================================
        // HOJA 5: MEDICAMENTOS PRESCRITOS
        // ============================================================
        const wsMedicamentos = wb.addWorksheet('5. Medicamentos');
        wsMedicamentos.cell(1, 1).string('HISTORIAL DE MEDICAMENTOS PRESCRITOS').style(titleStyle);

        const headersMedicamentos = ['Fecha', 'Medicamento', 'Dosis', 'Frecuencia', 'Duración', 'Estado'];
        headersMedicamentos.forEach((h, idx) => {
            wsMedicamentos.cell(3, idx + 1).string(h).style(headerStyle);
        });

        if (medicamentos.length > 0) {
            medicamentos.forEach((m, idx) => {
                const r = 4 + idx;
                wsMedicamentos.cell(r, 1).string(m.FECHA_PRESCRIPCION ? new Date(m.FECHA_PRESCRIPCION).toLocaleDateString() : 'N/A').style(cellStyle);
                wsMedicamentos.cell(r, 2).string(m.NOMBRE_MEDICAMENTO || 'N/A').style(cellStyle);
                wsMedicamentos.cell(r, 3).string(m.DOSIS || 'N/A').style(cellStyle);
                wsMedicamentos.cell(r, 4).string(m.FRECUENCIA || 'N/A').style(cellStyle);
                wsMedicamentos.cell(r, 5).string(m.DURACION || 'N/A').style(cellStyle);
                wsMedicamentos.cell(r, 6).string(m.ESTADO || 'N/A').style(cellStyle);
            });
        }

        // Ajustar anchos automáticos básicos o fijos seguros para las hojas
        [wsPaciente, wsHistorial].forEach(ws => {
            ws.column(1).setWidth(30);
            ws.column(2).setWidth(50);
        });

        [wsConsultas, wsPreclinica, wsMedicamentos].forEach(ws => {
            for (let i = 1; i <= 15; i++) {
                ws.column(i).setWidth(20);
            }
        });

        const nombreArchivo = `historial_completo_${pacienteId}_${new Date().toISOString().split('T')[0]}.xlsx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);

        wb.write(nombreArchivo, res);

    } catch (err) {
        console.error("❌ Error al exportar Excel del historial:", err);
        if (!res.headersSent) {
            res.status(500).json({ error: "Error al generar el archivo Excel: " + err.message });
        }
    }
});

module.exports = router;