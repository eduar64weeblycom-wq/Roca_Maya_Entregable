const express = require('express');
const router = express.Router();
const pool = require('../database/db');
const { registrarBitacora } = require('../services/bitacora.service');

// ============================================================
// RUTAS GET
// ============================================================

router.get("/", async (req, res) => {
  try {
    const usuario = req.user || null;
    let citas = [];

    if (usuario && usuario.ROL === 'ADMINISTRADOR') {
      const [rows] = await pool.query(`
        SELECT 
          c.ID_CITA,
          CONCAT(p.NOMBRES, ' ', p.APELLIDOS) AS NOMBRE_PACIENTE,
          p.ID_PACIENTE,
          u.NOMBRE_USUARIO AS NOMBRE_DOCTOR,
          c.FECHA_CITA,
          c.ESTADO,
          c.MOTIVO_CONSULTA,
          c.PRIORIDAD,
          c.TIPO_CITA
        FROM tbl_citas c
        INNER JOIN tbl_paciente p ON c.ID_PACIENTE = p.ID_PACIENTE
        INNER JOIN tbl_ms_usuario u ON c.ID_DOCTOR = u.ID_USUARIO
        WHERE c.ESTADO IN ('CONSULTA_MEDICA', 'PRECLINICA')
        ORDER BY c.FECHA_CITA DESC
      `);
      citas = rows;
    } else if (usuario && usuario.ROL === 'DOCTOR') {
      const [rows] = await pool.query(`
        SELECT 
          c.ID_CITA,
          CONCAT(p.NOMBRES, ' ', p.APELLIDOS) AS NOMBRE_PACIENTE,
          p.ID_PACIENTE,
          u.NOMBRE_USUARIO AS NOMBRE_DOCTOR,
          c.FECHA_CITA,
          c.ESTADO,
          c.MOTIVO_CONSULTA,
          c.PRIORIDAD,
          c.TIPO_CITA
        FROM tbl_citas c
        INNER JOIN tbl_paciente p ON c.ID_PACIENTE = p.ID_PACIENTE
        INNER JOIN tbl_ms_usuario u ON c.ID_DOCTOR = u.ID_USUARIO
        WHERE c.ESTADO IN ('CONSULTA_MEDICA', 'PRECLINICA')
          AND c.ID_DOCTOR = ?
        ORDER BY c.FECHA_CITA DESC
      `, [usuario.ID_USUARIO]);
      citas = rows;
    }

    const [doctores] = await pool.query(`
      SELECT 
        u.ID_USUARIO, 
        u.NOMBRE_USUARIO 
      FROM tbl_ms_usuario u
      WHERE u.ESTADO = 'ACTIVO' 
        AND u.ID_ROL = (SELECT ID_ROL FROM tbl_ms_roles WHERE ROL = 'DOCTOR')
      GROUP BY u.ID_USUARIO, u.NOMBRE_USUARIO
      ORDER BY u.NOMBRE_USUARIO
    `);

    res.render("consultaMedica", {
      citas: citas || [],
      doctores: doctores || [],
      user: usuario,
      nombreUsuario: usuario ? usuario.NOMBRE_USUARIO : 'Usuario',
      rol: usuario ? usuario.ROL : 'DOCTOR',
      title: "Consulta Médica - Clínicas Roca Maya"
    });

  } catch (err) {
    console.error(" Error en GET /consultaMedica:", err);
    res.status(500).render("consultaMedica", {
      citas: [],
      doctores: [],
      user: null,
      nombreUsuario: 'Usuario',
      rol: 'DOCTOR',
      error: "Error al cargar los datos de consulta médica",
      title: "Consulta Médica - Clínicas Roca Maya"
    });
  }
});

router.get("/api/calendario", async (req, res) => {
  try {
    const usuario = req.user || null;
    let citas = [];

    if (usuario && usuario.ROL === 'ADMINISTRADOR') {
      const [rows] = await pool.query(`
        SELECT 
          c.ID_CITA,
          CONCAT(p.NOMBRES, ' ', p.APELLIDOS) AS NOMBRE_PACIENTE,
          p.ID_PACIENTE,
          p.TELEFONO AS TELEFONO_PACIENTE,
          p.CORREO_ELECTRONICO AS CORREO_PACIENTE,
          u.ID_USUARIO AS ID_DOCTOR,
          u.NOMBRE_USUARIO AS NOMBRE_DOCTOR,
          c.FECHA_CITA,
          DATE_FORMAT(c.FECHA_CITA, '%H:%i') AS HORA_CITA,
          c.ESTADO,
          c.MOTIVO_CONSULTA,
          c.PRIORIDAD,
          c.TIPO_CITA,
          c.DURACION_ESTIMADA_MIN
        FROM tbl_citas c
        INNER JOIN tbl_paciente p ON c.ID_PACIENTE = p.ID_PACIENTE
        INNER JOIN tbl_ms_usuario u ON c.ID_DOCTOR = u.ID_USUARIO
        WHERE c.ESTADO IN ('CONSULTA_MEDICA', 'PRECLINICA')
        ORDER BY c.FECHA_CITA ASC
      `);
      citas = rows;
    } else if (usuario && usuario.ROL === 'DOCTOR') {
      const [rows] = await pool.query(`
        SELECT 
          c.ID_CITA,
          CONCAT(p.NOMBRES, ' ', p.APELLIDOS) AS NOMBRE_PACIENTE,
          p.ID_PACIENTE,
          p.TELEFONO AS TELEFONO_PACIENTE,
          p.CORREO_ELECTRONICO AS CORREO_PACIENTE,
          u.ID_USUARIO AS ID_DOCTOR,
          u.NOMBRE_USUARIO AS NOMBRE_DOCTOR,
          c.FECHA_CITA,
          DATE_FORMAT(c.FECHA_CITA, '%H:%i') AS HORA_CITA,
          c.ESTADO,
          c.MOTIVO_CONSULTA,
          c.PRIORIDAD,
          c.TIPO_CITA,
          c.DURACION_ESTIMADA_MIN
        FROM tbl_citas c
        INNER JOIN tbl_paciente p ON c.ID_PACIENTE = p.ID_PACIENTE
        INNER JOIN tbl_ms_usuario u ON c.ID_DOCTOR = u.ID_USUARIO
        WHERE c.ESTADO IN ('CONSULTA_MEDICA', 'PRECLINICA')
          AND c.ID_DOCTOR = ?
        ORDER BY c.FECHA_CITA ASC
      `, [usuario.ID_USUARIO]);
      citas = rows;
    }

    const [doctores] = await pool.query(`
      SELECT 
        u.ID_USUARIO AS ID_DOCTOR,
        u.NOMBRE_USUARIO AS NOMBRE,
        GROUP_CONCAT(DISTINCT COALESCE(e.NOMBRE_ESPECIALIDAD, 'Medicina General') SEPARATOR ', ') AS ESPECIALIDAD,
        u.CORREO_ELECTRONICO
      FROM tbl_ms_usuario u
      LEFT JOIN tbl_doctor_especialidad de ON u.ID_USUARIO = de.ID_DOCTOR
      LEFT JOIN tbl_especialidades e ON de.ID_ESPECIALIDAD = e.ID_ESPECIALIDAD
      WHERE u.ESTADO = 'ACTIVO' 
        AND u.ID_ROL = (SELECT ID_ROL FROM tbl_ms_roles WHERE ROL = 'DOCTOR')
      GROUP BY u.ID_USUARIO, u.NOMBRE_USUARIO, u.CORREO_ELECTRONICO
      ORDER BY u.NOMBRE_USUARIO
    `);
    res.json({
      success: true,
      citas: citas || [],
      doctores: doctores || []
    });

  } catch (err) {
    console.error(" Error en GET /consultaMedica/api/calendario:", err);
    res.status(500).json({
      success: false,
      error: "Error al obtener datos del calendario: " + err.message,
      citas: [],
      doctores: []
    });
  }
});

router.get("/api/cita-detalle/:idCita", async (req, res) => {
  const { idCita } = req.params;

  try {
    const [citaRows] = await pool.query(`
      SELECT 
        c.ID_CITA,
        c.ID_PACIENTE,
        c.ID_DOCTOR,
        c.FECHA_CITA,
        c.ESTADO,
        c.MOTIVO_CONSULTA,
        c.PRIORIDAD,
        c.TIPO_CITA,
        c.DURACION_ESTIMADA_MIN,
        c.OBSERVACIONES,
        CONCAT(p.NOMBRES, ' ', p.APELLIDOS) AS NOMBRE_PACIENTE,
        p.TELEFONO,
        p.CORREO_ELECTRONICO,
        u.NOMBRE_USUARIO AS NOMBRE_DOCTOR
      FROM tbl_citas c
      INNER JOIN tbl_paciente p ON c.ID_PACIENTE = p.ID_PACIENTE
      INNER JOIN tbl_ms_usuario u ON c.ID_DOCTOR = u.ID_USUARIO
      WHERE c.ID_CITA = ?
    `, [idCita]);

    if (citaRows.length === 0) {
      return res.status(404).json({ success: false, error: "Cita no encontrada" });
    }

    const cita = citaRows[0];

    const usuario = req.user || null;
    if (usuario && usuario.ROL === 'DOCTOR' && String(cita.ID_DOCTOR) !== String(usuario.ID_USUARIO)) {
      return res.status(403).json({ success: false, error: "No tienes permiso para ver esta cita" });
    }

    res.json({
      success: true,
      cita: cita
    });

  } catch (err) {
    console.error(" Error en GET /consultaMedica/api/cita-detalle/:idCita:", err);
    res.status(500).json({ success: false, error: "Error al obtener detalle de la cita" });
  }
});

router.get("/api/historial-rapido/:idPaciente", async (req, res) => {
  const { idPaciente } = req.params;

  try {
    const [consultas] = await pool.query(`
      SELECT 
        cm.ID_CONSULTA,
        cm.FECHA_CONSULTA,
        cm.DIAGNOSTICO_PRINCIPAL,
        cm.TRATAMIENTO,
        cm.OBSERVACIONES,
        cm.TIPO_CONSULTA,
        cm.ID_PACIENTE,
        u.NOMBRE_USUARIO AS DOCTOR
      FROM tbl_consulta_medica cm
      INNER JOIN tbl_ms_usuario u ON cm.ID_DOCTOR = u.ID_USUARIO
      WHERE cm.ID_PACIENTE = ?
      ORDER BY cm.FECHA_CONSULTA DESC
      LIMIT 5
    `, [idPaciente]);

    const [historial] = await pool.query(`
      SELECT 
        ALERGIAS,
        MEDICAMENTOS_ACTUALES,
        ENFERMEDADES_CRONICAS,
        NOTAS_IMPORTANTES
      FROM tbl_especialidades
      WHERE ID_PACIENTE = ?
    `, [idPaciente]);

    res.json({
      success: true,
      consultas: consultas || [],
      historial: historial.length > 0 ? historial[0] : null
    });

  } catch (err) {
    console.error(" Error en GET /consultaMedica/api/historial-rapido/:idPaciente:", err);
    res.status(500).json({
      success: false,
      error: "Error al obtener historial rápido: " + err.message
    });
  }
});

router.get("/api/imprimir-consulta/:idConsulta", async (req, res) => {
  const { idConsulta } = req.params;

  try {
    const [rows] = await pool.query(`
      SELECT 
        cm.*,
        CONCAT(p.NOMBRES, ' ', p.APELLIDOS) AS NOMBRE_PACIENTE,
        p.TELEFONO,
        p.CORREO_ELECTRONICO,
        p.FECHA_NACIMIENTO,
        p.GENERO,
        u.NOMBRE_USUARIO AS NOMBRE_DOCTOR,
        c.FECHA_CITA,
        c.ESTADO AS ESTADO_CITA
      FROM tbl_consulta_medica cm
      INNER JOIN tbl_paciente p ON cm.ID_PACIENTE = p.ID_PACIENTE
      INNER JOIN tbl_ms_usuario u ON cm.ID_DOCTOR = u.ID_USUARIO
      INNER JOIN tbl_citas c ON cm.ID_CITA = c.ID_CITA
      WHERE cm.ID_CONSULTA = ?
    `, [idConsulta]);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: "Consulta no encontrada" });
    }

    const consulta = rows[0];

    if (consulta.SINTOMAS && typeof consulta.SINTOMAS === 'string') {
      try { consulta.SINTOMAS = JSON.parse(consulta.SINTOMAS); } catch (e) { consulta.SINTOMAS = []; }
    }
    if (consulta.EXAMEN_FISICO && typeof consulta.EXAMEN_FISICO === 'string') {
      try { consulta.EXAMEN_FISICO = JSON.parse(consulta.EXAMEN_FISICO); } catch (e) { consulta.EXAMEN_FISICO = []; }
    }

    const [preclinica] = await pool.query(`
      SELECT 
        TEMPERATURA,
        PRESION_SISTOLICA,
        PRESION_DIASTOLICA,
        FRECUENCIA_CARDIACA,
        FRECUENCIA_RESPIRATORIA,
        SATURACION_OXIGENO,
        PESO,
        TALLA,
        IMC,
        GLUCOSA,
        PERIMETRO_ABDOMINAL,
        ESTADO_GENERAL
      FROM tbl_preclinica
      WHERE ID_CITA = ?
      ORDER BY FECHA_REGISTRO DESC
      LIMIT 1
    `, [consulta.ID_CITA]);

    res.json({
      success: true,
      consulta: consulta,
      preclinica: preclinica.length > 0 ? preclinica[0] : null
    });

  } catch (err) {
    console.error(" Error en GET /consultaMedica/api/imprimir-consulta/:idConsulta:", err);
    res.status(500).json({
      success: false,
      error: "Error al obtener datos para imprimir: " + err.message
    });
  }
});

router.get("/api/datos", async (req, res) => {
  try {
    const usuario = req.user || null;
    let citas = [];

    if (usuario && usuario.ROL === 'ADMINISTRADOR') {
      const [rows] = await pool.query(`
        SELECT 
          c.ID_CITA,
          CONCAT(p.NOMBRES, ' ', p.APELLIDOS) AS NOMBRE_PACIENTE,
          p.ID_PACIENTE,
          p.TELEFONO AS TELEFONO_PACIENTE,
          p.CORREO_ELECTRONICO AS CORREO_PACIENTE,
          u.ID_USUARIO AS ID_DOCTOR,
          u.NOMBRE_USUARIO AS NOMBRE_DOCTOR,
          c.FECHA_CITA,
          DATE_FORMAT(c.FECHA_CITA, '%H:%i') AS HORA_CITA,
          c.ESTADO,
          c.MOTIVO_CONSULTA,
          c.PRIORIDAD,
          c.TIPO_CITA,
          c.DURACION_ESTIMADA_MIN,
          c.OBSERVACIONES
        FROM tbl_citas c
        INNER JOIN tbl_paciente p ON c.ID_PACIENTE = p.ID_PACIENTE
        INNER JOIN tbl_ms_usuario u ON c.ID_DOCTOR = u.ID_USUARIO
        WHERE c.ESTADO IN ('CONSULTA_MEDICA', 'PRECLINICA')
        ORDER BY c.FECHA_CITA ASC
      `);
      citas = rows;
    } else if (usuario && usuario.ROL === 'DOCTOR') {
      const [rows] = await pool.query(`
        SELECT 
          c.ID_CITA,
          CONCAT(p.NOMBRES, ' ', p.APELLIDOS) AS NOMBRE_PACIENTE,
          p.ID_PACIENTE,
          p.TELEFONO AS TELEFONO_PACIENTE,
          p.CORREO_ELECTRONICO AS CORREO_PACIENTE,
          u.ID_USUARIO AS ID_DOCTOR,
          u.NOMBRE_USUARIO AS NOMBRE_DOCTOR,
          c.FECHA_CITA,
          DATE_FORMAT(c.FECHA_CITA, '%H:%i') AS HORA_CITA,
          c.ESTADO,
          c.MOTIVO_CONSULTA,
          c.PRIORIDAD,
          c.TIPO_CITA,
          c.DURACION_ESTIMADA_MIN,
          c.OBSERVACIONES
        FROM tbl_citas c
        INNER JOIN tbl_paciente p ON c.ID_PACIENTE = p.ID_PACIENTE
        INNER JOIN tbl_ms_usuario u ON c.ID_DOCTOR = u.ID_USUARIO
        WHERE c.ESTADO IN ('CONSULTA_MEDICA', 'PRECLINICA')
          AND c.ID_DOCTOR = ?
        ORDER BY c.FECHA_CITA ASC
      `, [usuario.ID_USUARIO]);
      citas = rows;
    }

    const [doctores] = await pool.query(`
      SELECT 
        u.ID_USUARIO,
        u.NOMBRE_USUARIO,
        u.CORREO_ELECTRONICO,
        GROUP_CONCAT(DISTINCT COALESCE(e.NOMBRE_ESPECIALIDAD, 'Medicina General') SEPARATOR ', ') AS ESPECIALIDAD
      FROM tbl_ms_usuario u
      LEFT JOIN tbl_doctor_especialidad de ON u.ID_USUARIO = de.ID_DOCTOR
      LEFT JOIN tbl_especialidades e ON de.ID_ESPECIALIDAD = e.ID_ESPECIALIDAD
      WHERE u.ESTADO = 'ACTIVO' 
        AND u.ID_ROL = (SELECT ID_ROL FROM tbl_ms_roles WHERE ROL = 'DOCTOR')
      GROUP BY u.ID_USUARIO, u.NOMBRE_USUARIO, u.CORREO_ELECTRONICO
      ORDER BY u.NOMBRE_USUARIO
    `);

    const [pacientes] = await pool.query(`
      SELECT ID_PACIENTE, NOMBRES, APELLIDOS, TELEFONO, CORREO_ELECTRONICO
      FROM tbl_paciente
      WHERE ESTADO = 'ACTIVO'
      ORDER BY NOMBRES, APELLIDOS
    `);

    const [consultasExistentes] = await pool.query(`
      SELECT ID_CONSULTA, ID_CITA 
      FROM tbl_consulta_medica
    `);

    const tipos = ["PRIMERA_VEZ", "CONTROL", "EMERGENCIA", "PROCEDIMIENTO"];
    const prioridades = ["NORMAL", "URGENTE", "ALTA"];
    const duraciones = [15, 20, 30, 45, 60];

    res.json({
      success: true,
      citas: citas || [],
      doctores: doctores || [],
      pacientes: pacientes || [],
      consultas: consultasExistentes || [],
      metadata: { tipos, prioridades, duraciones }
    });

  } catch (err) {
    console.error(" Error en GET /consultaMedica/api/datos:", err);
    res.status(500).json({
      success: false,
      error: "Error al obtener datos: " + err.message,
      citas: [],
      doctores: [],
      pacientes: [],
      consultas: [],
      metadata: {}
    });
  }
});

// ============================================================
// FUNCIÓN AUXILIAR: OBTENER O CREAR MEDICAMENTO
// ============================================================
async function getOrCreateMedicamento(nombre, usuarioCreacion = 'SISTEMA') {
  if (!nombre || typeof nombre !== 'string' || nombre.trim() === '') return null;
  const nombreLimpio = nombre.trim().toUpperCase();
  const [rows] = await pool.query(
    `SELECT ID_MEDICAMENTO FROM tbl_inventario_medicamentos 
     WHERE NOMBRE_MEDICAMENTO = ? OR NOMBRE_GENERICO = ?`,
    [nombreLimpio, nombreLimpio]
  );
  if (rows.length > 0) return rows[0].ID_MEDICAMENTO;

  console.log(`🆕 Creando nuevo medicamento: "${nombreLimpio}"`);
  const [result] = await pool.query(`
    INSERT INTO tbl_inventario_medicamentos (
      NOMBRE_MEDICAMENTO, NOMBRE_GENERICO,
      STOCK_ACTUAL, STOCK_MINIMO, STOCK_MAXIMO,
      PRECIO_COMPRA, PRECIO_VENTA, ESTADO,
      USUARIO_CREACION, FECHA_REGISTRO
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVO', ?, NOW())
  `, [nombreLimpio, nombreLimpio, 0, 1, 10, 0.00, 0.00, usuarioCreacion]);
  return result.insertId;
}

// ============================================================
// POST /nueva - Crear o actualizar consulta (UPSERT)
// ============================================================
router.post("/nueva", async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const body = req.body;
    console.log("📥 Body recibido en /nueva (UPSERT):", JSON.stringify(body, null, 2));
    console.log("💊 Medicamentos recibidos:", body.medicamentos ? JSON.stringify(body.medicamentos) : 'Ninguno');

    const idCita = body.idCita || body.citaId || body.ID_CITA;
    let idPaciente = body.idPaciente || body.pacienteId || body.ID_PACIENTE;
    let idDoctor = body.idDoctor || body.doctorId || body.ID_DOCTOR;

    if (idCita && (!idPaciente || !idDoctor)) {
      const [citaData] = await connection.query(
        "SELECT ID_PACIENTE, ID_DOCTOR FROM tbl_citas WHERE ID_CITA = ?",
        [idCita]
      );
      if (citaData.length > 0) {
        if (!idPaciente) idPaciente = citaData[0].ID_PACIENTE;
        if (!idDoctor) idDoctor = citaData[0].ID_DOCTOR;
      } else {
        await connection.rollback();
        return res.status(404).json({ success: false, error: "La cita no existe" });
      }
    }

    if (!idCita || !idPaciente || !idDoctor) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        error: "Faltan campos obligatorios: idCita, idPaciente, idDoctor",
        recibido: { idCita, idPaciente, idDoctor }
      });
    }

    const usuarioCreacion = req.user?.USUARIO || 'SISTEMA';

    const [citaExists] = await connection.query(
      "SELECT ID_CITA, ESTADO FROM tbl_citas WHERE ID_CITA = ?",
      [idCita]
    );
    if (citaExists.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, error: "La cita no existe" });
    }
    const estadoCita = String(citaExists[0].ESTADO || "").toUpperCase();
    if (estadoCita === "CANCELADA" || estadoCita === "NO_ASISTIO") {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        error: `No se puede crear/editar consulta para una cita en estado "${estadoCita}".`
      });
    }

    const motivoConsulta = body.motivoConsulta || body.motivo || body.MOTIVO_CONSULTA || null;
    const sintomas = body.sintomas || body.SINTOMAS || [];
    const examenFisico = body.examenFisico || body.EXAMEN_FISICO || [];
    const diagnosticoPrincipal = body.diagnosticoPrincipal || body.diagnostico || body.DIAGNOSTICO_PRINCIPAL || null;
    const codigoCIE10Principal = body.codigoCIE10Principal || body.codigoCIE10 || body.CODIGO_CIE10_PRINCIPAL || null;
    const diagnosticoSecundario = body.diagnosticoSecundario || body.DIAGNOSTICO_SECUNDARIO || null;
    const codigoCIE10Secundario = body.codigoCIE10Secundario || body.CODIGO_CIE10_SECUNDARIO || null;
    const tratamiento = body.tratamiento || body.TRATAMIENTO || null;
    const recomendaciones = body.recomendaciones || body.RECOMENDACIONES || null;
    const observaciones = body.observaciones || body.OBSERVACIONES || body.examenesComplementarios || null;
    const tipoConsulta = body.tipoConsulta || body.TIPO_CONSULTA || 'GENERAL';
    const proximaCita = body.proximaCita || body.PROXIMA_CITA_RECOMENDADA || null;

    const [consultaExistente] = await connection.query(
      "SELECT ID_CONSULTA FROM tbl_consulta_medica WHERE ID_CITA = ?",
      [idCita]
    );
    let idConsulta = null;

    if (consultaExistente.length > 0) {
      idConsulta = consultaExistente[0].ID_CONSULTA;
      await connection.query(
        `UPDATE tbl_consulta_medica SET
          MOTIVO_CONSULTA = ?, SINTOMAS = ?, EXAMEN_FISICO = ?,
          DIAGNOSTICO_PRINCIPAL = ?, CODIGO_CIE10_PRINCIPAL = ?,
          DIAGNOSTICO_SECUNDARIO = ?, CODIGO_CIE10_SECUNDARIO = ?,
          TRATAMIENTO = ?, RECOMENDACIONES = ?, OBSERVACIONES = ?,
          PROXIMA_CITA_RECOMENDADA = ?, TIPO_CONSULTA = ?,
          USUARIO_MODIFICACION = ?
        WHERE ID_CONSULTA = ?`,
        [
          motivoConsulta,
          sintomas && sintomas.length > 0 ? JSON.stringify(sintomas) : null,
          examenFisico && examenFisico.length > 0 ? JSON.stringify(examenFisico) : null,
          diagnosticoPrincipal,
          codigoCIE10Principal,
          diagnosticoSecundario,
          codigoCIE10Secundario,
          tratamiento,
          recomendaciones,
          observaciones,
          proximaCita,
          tipoConsulta,
          usuarioCreacion,
          idConsulta
        ]
      );
      console.log(`✅ Consulta #${idConsulta} actualizada para cita #${idCita}`);
    } else {
      const [result] = await connection.query(
        `INSERT INTO tbl_consulta_medica (
          ID_CITA, ID_PACIENTE, ID_DOCTOR, MOTIVO_CONSULTA, SINTOMAS, EXAMEN_FISICO,
          DIAGNOSTICO_PRINCIPAL, CODIGO_CIE10_PRINCIPAL, DIAGNOSTICO_SECUNDARIO,
          CODIGO_CIE10_SECUNDARIO, TRATAMIENTO, RECOMENDACIONES, OBSERVACIONES,
          FECHA_CONSULTA, PROXIMA_CITA_RECOMENDADA, TIPO_CONSULTA, USUARIO_CREACION
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?)`,
        [
          idCita, idPaciente, idDoctor, motivoConsulta,
          sintomas && sintomas.length > 0 ? JSON.stringify(sintomas) : null,
          examenFisico && examenFisico.length > 0 ? JSON.stringify(examenFisico) : null,
          diagnosticoPrincipal, codigoCIE10Principal, diagnosticoSecundario, codigoCIE10Secundario,
          tratamiento, recomendaciones, observaciones,
          proximaCita, tipoConsulta, usuarioCreacion
        ]
      );
      idConsulta = result.insertId;
      console.log(`✅ Nueva consulta #${idConsulta} creada para cita #${idCita}`);
    }

    if (estadoCita === "PRECLINICA") {
      await connection.query(
        `UPDATE tbl_citas SET ESTADO = 'CONSULTA_MEDICA', USUARIO_MODIFICACION = ?, FECHA_MODIFICACION = NOW() WHERE ID_CITA = ?`,
        [usuarioCreacion, idCita]
      );
      console.log(`🔄 Cita #${idCita} actualizada de PRECLINICA a CONSULTA_MEDICA`);
    } else {
      await connection.query(
        `UPDATE tbl_citas SET USUARIO_MODIFICACION = ?, FECHA_MODIFICACION = NOW() WHERE ID_CITA = ?`,
        [usuarioCreacion, idCita]
      );
    }

    // ============================================================
    // GUARDAR MEDICAMENTOS (borrar y recrear)
    // ============================================================
    await connection.query("DELETE FROM tbl_prescripcion WHERE ID_CONSULTA = ?", [idConsulta]);

    if (body.medicamentos && Array.isArray(body.medicamentos) && body.medicamentos.length > 0) {
      console.log(`💊 Insertando ${body.medicamentos.length} medicamentos...`);
      for (const med of body.medicamentos) {
        if (!med.nombre || med.nombre.trim() === '') {
          console.warn('⚠️ Medicamento sin nombre, omitido');
          continue;
        }
        const idMed = await getOrCreateMedicamento(med.nombre, usuarioCreacion);
        if (idMed) {
          await connection.query(
            `INSERT INTO TBL_PRESCRIPCION (
              ID_CONSULTA, ID_MEDICAMENTO, DOSIS, FRECUENCIA, DURACION,
              INSTRUCCIONES_ADICIONALES, ESTADO, USUARIO_CREACION
            ) VALUES (?, ?, ?, ?, ?, ?, 'ACTIVA', ?)`,
            [
              idConsulta,
              idMed,
              med.dosis || null,
              med.frecuencia || null,
              med.duracion || null,
              med.instrucciones || null,
              usuarioCreacion
            ]
          );
        } else {
          console.warn(`⚠️ No se pudo obtener/crear medicamento: ${med.nombre}`);
        }
      }
    } else {
      console.log(`⏭️ No se recibieron medicamentos para guardar.`);
    }

    // ============================================================
    // GUARDAR HISTORIAL (solo si se envían campos Y tienen contenido)
    // ============================================================
    const camposHistorial = {
      ALERGIAS: body.ALERGIAS,
      ENFERMEDADES_CRONICAS: body.ENFERMEDADES_CRONICAS,
      CIRUGIAS_PREVIAS: body.CIRUGIAS_PREVIAS,
      MEDICAMENTOS_ACTUALES: body.MEDICAMENTOS_ACTUALES,
      ANTECEDENTES_FAMILIARES: body.ANTECEDENTES_FAMILIARES,
      HABITOS: body.HABITOS,
      VACUNAS: body.VACUNAS,
      NOTAS_IMPORTANTES: body.NOTAS_IMPORTANTES
    };

    const toArray = (value) => {
      if (!value) return [];
      if (Array.isArray(value)) return value;
      if (typeof value === 'string') {
        if (value.startsWith('[')) {
          try { return JSON.parse(value); } catch { return []; }
        }
        return value.split(',').map(item => item.trim()).filter(item => item !== '');
      }
      return [];
    };

    const hayDatosHistorial = Object.entries(camposHistorial).some(([key, value]) => {
      if (key === 'NOTAS_IMPORTANTES') {
        return value !== undefined && value !== null && value.trim() !== '';
      }
      return value !== undefined && value !== null && value !== '' && toArray(value).length > 0;
    });

    if (hayDatosHistorial) {
      const historialUpdates = {};
      for (const [key, value] of Object.entries(camposHistorial)) {
        if (value !== undefined && value !== null && value !== '') {
          if (key === 'NOTAS_IMPORTANTES') {
            historialUpdates[key] = value;
          } else {
            historialUpdates[key] = JSON.stringify(toArray(value));
          }
        }
      }

      const [existeHistorial] = await connection.query(
        "SELECT ID_HISTORIAL FROM tbl_especialidades WHERE ID_PACIENTE = ?",
        [idPaciente]
      );

      if (existeHistorial.length > 0) {
        const setClauses = [];
        const values = [];
        for (const [key, val] of Object.entries(historialUpdates)) {
          setClauses.push(`${key} = ?`);
          values.push(val);
        }
        setClauses.push(`FECHA_ACTUALIZACION = CURRENT_TIMESTAMP`);
        setClauses.push(`USUARIO_MODIFICACION = ?`);
        values.push(usuarioCreacion);
        values.push(idPaciente);
        await connection.query(
          `UPDATE tbl_especialidades SET ${setClauses.join(', ')} WHERE ID_PACIENTE = ?`,
          values
        );
        console.log(`📝 Historial actualizado para paciente ${idPaciente}`);
      } else {
        const columnas = ['ID_PACIENTE', ...Object.keys(historialUpdates)];
        const placeholders = columnas.map(() => '?').join(', ');
        const valores = [idPaciente, ...Object.values(historialUpdates)];
        await connection.query(
          `INSERT INTO tbl_especialidades (${columnas.join(', ')}, USUARIO_CREACION, FECHA_ACTUALIZACION)
           VALUES (${placeholders}, ?, CURRENT_TIMESTAMP)`,
          [...valores, usuarioCreacion]
        );
        console.log(`📝 Historial creado para paciente ${idPaciente}`);
      }
    } else {
      console.log(`⏭️ No se enviaron datos de historial, no se modifica.`);
    }

    // ============================================================
    // BITÁCORA
    // ============================================================
    const [pacienteInfo] = await connection.query(
      "SELECT CONCAT(NOMBRES, ' ', APELLIDOS) AS NOMBRE FROM tbl_paciente WHERE ID_PACIENTE = ?",
      [idPaciente]
    );
    const nombrePaciente = pacienteInfo.length > 0 ? pacienteInfo[0].NOMBRE : `ID ${idPaciente}`;

    await registrarBitacora({
      usuario: usuarioCreacion,
      accion: consultaExistente.length > 0 ? "ACTUALIZACION_CONSULTA_MEDICA" : "CREACION_CONSULTA_MEDICA",
      descripcion: `${consultaExistente.length > 0 ? 'Actualizada' : 'Creada'} consulta ID #${idConsulta} para cita #${idCita} (Paciente: ${nombrePaciente})`,
      modulo: "CONSULTA_MEDICA",
      idRegistro: idConsulta,
      tabla: "tbl_consulta_medica",
      estado: "EXITO",
      req: req
    });

    await connection.commit();

    res.json({
      success: true,
      message: consultaExistente.length > 0 ? "Consulta actualizada exitosamente" : "Consulta creada exitosamente",
      idConsulta: idConsulta,
      idCita: idCita,
      idPaciente: idPaciente,
      estadoActualizado: estadoCita === "PRECLINICA" ? 'CONSULTA_MEDICA' : estadoCita,
      actualizada: consultaExistente.length > 0
    });

  } catch (err) {
    await connection.rollback();
    console.error("❌ Error en POST /consultaMedica/nueva:", err);
    try {
      await registrarBitacora({
        usuario: req.user?.USUARIO || 'SISTEMA',
        accion: "ERROR_CREACION_CONSULTA",
        descripcion: `Error al guardar consulta: ${err.message}`,
        modulo: "CONSULTA_MEDICA",
        tabla: "tbl_consulta_medica",
        estado: "ERROR",
        detalleError: err.message,
        req: req
      });
    } catch (bitError) { /* ignorar */ }
    res.status(500).json({
      success: false,
      error: "Error al guardar la consulta médica: " + err.message
    });
  } finally {
    connection.release();
  }
});

// ============================================================
// POST /actualizar - Actualizar consulta médica (con medicamentos)
// ============================================================
router.post("/actualizar", async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const body = req.body;
    const idConsulta = body.idConsulta;

    console.log("📥 Body recibido en /actualizar:", JSON.stringify(body, null, 2));

    if (!idConsulta) {
      await connection.rollback();
      return res.status(400).json({ success: false, error: "ID de consulta requerido" });
    }

    const [consultaExists] = await connection.query(
      "SELECT ID_CONSULTA, ID_CITA FROM tbl_consulta_medica WHERE ID_CONSULTA = ?",
      [idConsulta]
    );

    if (consultaExists.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, error: "La consulta médica no existe" });
    }

    const idCita = consultaExists[0].ID_CITA;

    const [citaData] = await connection.query(
      "SELECT ESTADO FROM tbl_citas WHERE ID_CITA = ?",
      [idCita]
    );

    if (citaData.length > 0) {
      const estadoCita = String(citaData[0].ESTADO || "").toUpperCase();
      if (estadoCita === "CANCELADA" || estadoCita === "NO_ASISTIO") {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          error: `No se puede actualizar la consulta porque la cita está en estado "${estadoCita}".`
        });
      }
    }

    const usuarioModificacion = req.user?.NOMBRE_USUARIO || req.user?.USUARIO || 'SISTEMA';

    await connection.query(`
      UPDATE tbl_consulta_medica SET
        MOTIVO_CONSULTA = ?, SINTOMAS = ?, EXAMEN_FISICO = ?,
        DIAGNOSTICO_PRINCIPAL = ?, CODIGO_CIE10_PRINCIPAL = ?,
        DIAGNOSTICO_SECUNDARIO = ?, CODIGO_CIE10_SECUNDARIO = ?,
        TRATAMIENTO = ?, RECOMENDACIONES = ?, OBSERVACIONES = ?,
        TIPO_CONSULTA = ?, USUARIO_MODIFICACION = ?
      WHERE ID_CONSULTA = ?
    `, [
      body.motivoConsulta || null,
      body.sintomas && body.sintomas.length > 0 ? JSON.stringify(body.sintomas) : null,
      body.examenFisico && body.examenFisico.length > 0 ? JSON.stringify(body.examenFisico) : null,
      body.diagnosticoPrincipal || null,
      body.codigoCIE10Principal || null,
      body.diagnosticoSecundario || null,
      body.codigoCIE10Secundario || null,
      body.tratamiento || null,
      body.recomendaciones || null,
      body.observaciones || body.examenesComplementarios || null,
      body.tipoConsulta || 'GENERAL',
      usuarioModificacion,
      idConsulta
    ]);

    // Medicamentos: borrar y recrear
    await connection.query("DELETE FROM tbl_prescripcion WHERE ID_CONSULTA = ?", [idConsulta]);

    if (body.medicamentos && Array.isArray(body.medicamentos) && body.medicamentos.length > 0) {
      for (const med of body.medicamentos) {
        if (!med.nombre || med.nombre.trim() === '') continue;
        const idMed = await getOrCreateMedicamento(med.nombre, usuarioModificacion);
        if (idMed) {
          await connection.query(`
            INSERT INTO TBL_PRESCRIPCION (
              ID_CONSULTA, ID_MEDICAMENTO, DOSIS, FRECUENCIA, DURACION,
              INSTRUCCIONES_ADICIONALES, ESTADO, USUARIO_CREACION
            ) VALUES (?, ?, ?, ?, ?, ?, 'ACTIVA', ?)
          `, [
            idConsulta,
            idMed,
            med.dosis || null,
            med.frecuencia || null,
            med.duracion || null,
            med.instrucciones || null,
            usuarioModificacion
          ]);
        }
      }
    }

    await connection.query(`
      UPDATE tbl_citas 
      SET USUARIO_MODIFICACION = ?, FECHA_MODIFICACION = NOW()
      WHERE ID_CITA = ?
    `, [usuarioModificacion, idCita]);

    await connection.commit();

    await registrarBitacora({
      usuario: usuarioModificacion,
      accion: "ACTUALIZACION_CONSULTA_MEDICA",
      descripcion: `El usuario ${usuarioModificacion} actualizó la consulta médica ID #${idConsulta} (incluye medicamentos)`,
      modulo: "CONSULTA_MEDICA",
      idRegistro: idConsulta,
      tabla: "tbl_consulta_medica",
      estado: "EXITO",
      req: req
    });

    res.json({
      success: true,
      message: "Consulta médica actualizada exitosamente",
      idConsulta: idConsulta
    });

  } catch (err) {
    await connection.rollback();
    console.error("❌ Error en POST /consultaMedica/actualizar:", err);
    res.status(500).json({
      success: false,
      error: "Error al actualizar la consulta médica: " + err.message
    });
  } finally {
    connection.release();
  }
});

// ============================================================
// GET /por-cita/:idCita - Obtener consulta por ID de cita
// ============================================================
router.get("/por-cita/:idCita", async (req, res) => {
  const { idCita } = req.params;
  try {
    const [consultaRows] = await pool.query(`
      SELECT 
        cm.ID_CONSULTA, cm.ID_CITA, cm.ID_PACIENTE, cm.ID_DOCTOR,
        cm.MOTIVO_CONSULTA, cm.SINTOMAS, cm.EXAMEN_FISICO,
        cm.DIAGNOSTICO_PRINCIPAL, cm.CODIGO_CIE10_PRINCIPAL,
        cm.DIAGNOSTICO_SECUNDARIO, cm.CODIGO_CIE10_SECUNDARIO,
        cm.TRATAMIENTO, cm.RECOMENDACIONES, cm.OBSERVACIONES,
        cm.FECHA_CONSULTA, cm.PROXIMA_CITA_RECOMENDADA, cm.TIPO_CONSULTA,
        CONCAT(p.NOMBRES, ' ', p.APELLIDOS) AS NOMBRE_PACIENTE,
        u.NOMBRE_USUARIO AS NOMBRE_DOCTOR
      FROM tbl_consulta_medica cm
      INNER JOIN tbl_paciente p ON cm.ID_PACIENTE = p.ID_PACIENTE
      INNER JOIN tbl_ms_usuario u ON cm.ID_DOCTOR = u.ID_USUARIO
      WHERE cm.ID_CITA = ?
    `, [idCita]);

    if (consultaRows.length === 0) {
      return res.status(404).json({ success: false, message: "No se encontró consulta para esta cita" });
    }

    const consulta = consultaRows[0];
    if (consulta.SINTOMAS && typeof consulta.SINTOMAS === 'string') {
      try { consulta.SINTOMAS = JSON.parse(consulta.SINTOMAS); } catch (e) { consulta.SINTOMAS = []; }
    }
    if (consulta.EXAMEN_FISICO && typeof consulta.EXAMEN_FISICO === 'string') {
      try { consulta.EXAMEN_FISICO = JSON.parse(consulta.EXAMEN_FISICO); } catch (e) { consulta.EXAMEN_FISICO = []; }
    }

    res.json({ success: true, consulta: consulta });

  } catch (err) {
    console.error(" Error en GET /consultaMedica/por-cita/:idCita:", err);
    res.status(500).json({ success: false, error: "Error al obtener consulta por cita: " + err.message });
  }
});

// ============================================================
// GET /preclinica/por-cita/:idCita - Obtener preclínica
// ============================================================
router.get("/preclinica/por-cita/:idCita", async (req, res) => {
  const { idCita } = req.params;
  try {
    const [preclinicaRows] = await pool.query(`
      SELECT * FROM tbl_preclinica WHERE ID_CITA = ? ORDER BY FECHA_REGISTRO DESC LIMIT 1
    `, [idCita]);

    if (preclinicaRows.length === 0) {
      return res.status(404).json({ success: false, message: "No se encontró preclínica para esta cita" });
    }

    res.json({ success: true, preclinica: preclinicaRows[0] });

  } catch (err) {
    console.error(" Error en GET /consultaMedica/preclinica/por-cita/:idCita:", err);
    res.status(500).json({ success: false, error: "Error al obtener preclínica por cita: " + err.message });
  }
});

// ============================================================
// GET /api/cita/:idCita - Obtener cita con preclínica e historial
// ============================================================
router.get("/api/cita/:idCita", async (req, res) => {
  const { idCita } = req.params;
  try {
    const [citaRows] = await pool.query(`
      SELECT 
        c.ID_CITA, c.ID_PACIENTE, c.ID_DOCTOR, c.FECHA_CITA, c.ESTADO,
        c.MOTIVO_CONSULTA, c.PRIORIDAD, c.TIPO_CITA, c.DURACION_ESTIMADA_MIN,
        c.OBSERVACIONES, CONCAT(p.NOMBRES, ' ', p.APELLIDOS) AS NOMBRE_PACIENTE,
        p.FECHA_NACIMIENTO, p.GENERO, p.TELEFONO, p.CORREO_ELECTRONICO,
        p.DIRECCION, u.NOMBRE_USUARIO AS NOMBRE_DOCTOR
      FROM tbl_citas c
      INNER JOIN tbl_paciente p ON c.ID_PACIENTE = p.ID_PACIENTE
      INNER JOIN tbl_ms_usuario u ON c.ID_DOCTOR = u.ID_USUARIO
      WHERE c.ID_CITA = ?
    `, [idCita]);

    if (citaRows.length === 0) {
      return res.status(404).json({ error: "Cita no encontrada" });
    }

    const cita = citaRows[0];

    const [preclinicaRows] = await pool.query(`
      SELECT * FROM tbl_preclinica WHERE ID_CITA = ? ORDER BY FECHA_REGISTRO DESC LIMIT 1
    `, [idCita]);

    const [historialRows] = await pool.query(`
      SELECT ALERGIAS, ENFERMEDADES_CRONICAS, CIRUGIAS_PREVIAS,
        MEDICAMENTOS_ACTUALES, ANTECEDENTES_FAMILIARES, HABITOS,
        VACUNAS, NOTAS_IMPORTANTES
      FROM tbl_especialidades WHERE ID_PACIENTE = ?
    `, [cita.ID_PACIENTE]);

    const [consultasPrevias] = await pool.query(`
      SELECT ID_CONSULTA, FECHA_CONSULTA, DIAGNOSTICO_PRINCIPAL,
        TRATAMIENTO, u.NOMBRE_USUARIO AS DOCTOR
      FROM tbl_consulta_medica cm
      INNER JOIN tbl_ms_usuario u ON cm.ID_DOCTOR = u.ID_USUARIO
      WHERE cm.ID_PACIENTE = ?
      ORDER BY cm.FECHA_CONSULTA DESC LIMIT 5
    `, [cita.ID_PACIENTE]);

    res.json({
      success: true,
      cita: cita,
      preclinica: preclinicaRows.length > 0 ? preclinicaRows[0] : null,
      historial: historialRows.length > 0 ? historialRows[0] : null,
      consultasPrevias: consultasPrevias || []
    });

  } catch (err) {
    console.error(" Error en GET /api/cita/:idCita:", err);
    res.status(500).json({ error: "Error al obtener datos de la cita" });
  }
});

// ============================================================
// GET /api/consulta/:idConsulta - Obtener consulta específica CON PRECLÍNICA
// ============================================================
router.get("/api/consulta/:idConsulta", async (req, res) => {
  const { idConsulta } = req.params;
  try {
    const [rows] = await pool.query(`
      SELECT cm.*, 
             CONCAT(p.NOMBRES, ' ', p.APELLIDOS) AS NOMBRE_PACIENTE,
             u.NOMBRE_USUARIO AS NOMBRE_DOCTOR,
             pre.TEMPERATURA, pre.PRESION_SISTOLICA, pre.PRESION_DIASTOLICA,
             pre.FRECUENCIA_CARDIACA, pre.FRECUENCIA_RESPIRATORIA,
             pre.SATURACION_OXIGENO, pre.PESO, pre.TALLA, pre.GLUCOSA,
             pre.PERIMETRO_ABDOMINAL, pre.ESTADO_GENERAL,
             pre.OBSERVACIONES AS PRECLINICA_OBSERVACIONES
      FROM tbl_consulta_medica cm
      INNER JOIN tbl_paciente p ON cm.ID_PACIENTE = p.ID_PACIENTE
      INNER JOIN tbl_ms_usuario u ON cm.ID_DOCTOR = u.ID_USUARIO
      LEFT JOIN tbl_preclinica pre ON cm.ID_CITA = pre.ID_CITA
      WHERE cm.ID_CONSULTA = ?
    `, [idConsulta]);

    if (rows.length === 0) {
      return res.status(404).json({ error: "Consulta no encontrada" });
    }

    const consulta = rows[0];
    if (consulta.SINTOMAS && typeof consulta.SINTOMAS === 'string') {
      try { consulta.SINTOMAS = JSON.parse(consulta.SINTOMAS); } catch (e) { consulta.SINTOMAS = []; }
    }
    if (consulta.EXAMEN_FISICO && typeof consulta.EXAMEN_FISICO === 'string') {
      try { consulta.EXAMEN_FISICO = JSON.parse(consulta.EXAMEN_FISICO); } catch (e) { consulta.EXAMEN_FISICO = []; }
    }

    consulta.preclinica = {
      temperatura: consulta.TEMPERATURA,
      presionSistolica: consulta.PRESION_SISTOLICA,
      presionDiastolica: consulta.PRESION_DIASTOLICA,
      frecuenciaCardiaca: consulta.FRECUENCIA_CARDIACA,
      frecuenciaRespiratoria: consulta.FRECUENCIA_RESPIRATORIA,
      saturacionOxigeno: consulta.SATURACION_OXIGENO,
      peso: consulta.PESO,
      talla: consulta.TALLA,
      glucosa: consulta.GLUCOSA,
      perimetroAbdominal: consulta.PERIMETRO_ABDOMINAL,
      estadoGeneral: consulta.ESTADO_GENERAL,
      observaciones: consulta.PRECLINICA_OBSERVACIONES
    };

    delete consulta.TEMPERATURA;
    delete consulta.PRESION_SISTOLICA;
    delete consulta.PRESION_DIASTOLICA;
    delete consulta.FRECUENCIA_CARDIACA;
    delete consulta.FRECUENCIA_RESPIRATORIA;
    delete consulta.SATURACION_OXIGENO;
    delete consulta.PESO;
    delete consulta.TALLA;
    delete consulta.GLUCOSA;
    delete consulta.PERIMETRO_ABDOMINAL;
    delete consulta.ESTADO_GENERAL;
    delete consulta.PRECLINICA_OBSERVACIONES;

    res.json(consulta);

  } catch (err) {
    console.error(" Error en GET /api/consulta/:idConsulta:", err);
    res.status(500).json({ error: "Error al obtener consulta" });
  }
});

// ============================================================
// PUT /api/consulta/:idConsulta - Actualizar consulta (API REST)
// ============================================================
router.put("/api/consulta/:idConsulta", async (req, res) => {
  const { idConsulta } = req.params;
  const datos = req.body;

  try {
    const usuarioModificacion = req.user?.USUARIO || 'SISTEMA';

    await pool.query(`
      UPDATE tbl_consulta_medica SET
        MOTIVO_CONSULTA = ?, SINTOMAS = ?, EXAMEN_FISICO = ?,
        DIAGNOSTICO_PRINCIPAL = ?, CODIGO_CIE10_PRINCIPAL = ?,
        DIAGNOSTICO_SECUNDARIO = ?, CODIGO_CIE10_SECUNDARIO = ?,
        TRATAMIENTO = ?, RECOMENDACIONES = ?, OBSERVACIONES = ?,
        PROXIMA_CITA_RECOMENDADA = ?, TIPO_CONSULTA = ?,
        USUARIO_MODIFICACION = ?
      WHERE ID_CONSULTA = ?
    `, [
      datos.MOTIVO_CONSULTA || null,
      datos.SINTOMAS ? JSON.stringify(datos.SINTOMAS) : null,
      datos.EXAMEN_FISICO ? JSON.stringify(datos.EXAMEN_FISICO) : null,
      datos.DIAGNOSTICO_PRINCIPAL || null,
      datos.CODIGO_CIE10_PRINCIPAL || null,
      datos.DIAGNOSTICO_SECUNDARIO || null,
      datos.CODIGO_CIE10_SECUNDARIO || null,
      datos.TRATAMIENTO || null,
      datos.RECOMENDACIONES || null,
      datos.OBSERVACIONES || null,
      datos.PROXIMA_CITA_RECOMENDADA || null,
      datos.TIPO_CONSULTA || 'GENERAL',
      usuarioModificacion,
      idConsulta
    ]);

    res.json({ success: true, message: "Consulta médica actualizada exitosamente" });

  } catch (err) {
    console.error(" Error en PUT /api/consulta/:idConsulta:", err);
    res.status(500).json({ error: "Error al actualizar consulta" });
  }
});

// ============================================================
// GET /api/historial/:idPaciente - Obtener historial médico
// ============================================================
router.get("/api/historial/:idPaciente", async (req, res) => {
  const { idPaciente } = req.params;
  try {
    const [historialRows] = await pool.query(`
      SELECT ALERGIAS, ENFERMEDADES_CRONICAS, CIRUGIAS_PREVIAS,
        MEDICAMENTOS_ACTUALES, ANTECEDENTES_FAMILIARES, HABITOS,
        VACUNAS, NOTAS_IMPORTANTES, FECHA_ACTUALIZACION
      FROM tbl_especialidades WHERE ID_PACIENTE = ?
    `, [idPaciente]);

    res.json({
      success: true,
      historial: historialRows.length > 0 ? historialRows[0] : null
    });

  } catch (err) {
    console.error(" Error en GET /api/historial/:idPaciente:", err);
    res.status(500).json({ error: "Error al obtener historial" });
  }
});

// ============================================================
// POST /api/historial/:idPaciente - Guardar/actualizar historial
// ============================================================
router.post("/api/historial/:idPaciente", async (req, res) => {
  const { idPaciente } = req.params;
  const datos = req.body;

  try {
    const usuarioModificacion = req.user?.USUARIO || 'SISTEMA';

    const [existe] = await pool.query(
      "SELECT ID_HISTORIAL FROM tbl_especialidades WHERE ID_PACIENTE = ?",
      [idPaciente]
    );

    const toArray = (value) => {
      if (!value) return [];
      if (Array.isArray(value)) return value;
      if (typeof value === 'string') {
        if (value.startsWith('[')) {
          try { return JSON.parse(value); } catch { return []; }
        }
        return value.split(',').map(item => item.trim()).filter(item => item !== '');
      }
      return [];
    };

    if (existe.length > 0) {
      await pool.query(`
        UPDATE tbl_especialidades SET
          ALERGIAS = ?, ENFERMEDADES_CRONICAS = ?, CIRUGIAS_PREVIAS = ?,
          MEDICAMENTOS_ACTUALES = ?, ANTECEDENTES_FAMILIARES = ?,
          HABITOS = ?, VACUNAS = ?, NOTAS_IMPORTANTES = ?,
          FECHA_ACTUALIZACION = CURRENT_TIMESTAMP, USUARIO_MODIFICACION = ?
        WHERE ID_PACIENTE = ?
      `, [
        JSON.stringify(toArray(datos.ALERGIAS)),
        JSON.stringify(toArray(datos.ENFERMEDADES_CRONICAS)),
        JSON.stringify(toArray(datos.CIRUGIAS_PREVIAS)),
        JSON.stringify(toArray(datos.MEDICAMENTOS_ACTUALES)),
        JSON.stringify(toArray(datos.ANTECEDENTES_FAMILIARES)),
        JSON.stringify(toArray(datos.HABITOS)),
        JSON.stringify(toArray(datos.VACUNAS)),
        datos.NOTAS_IMPORTANTES || '',
        usuarioModificacion,
        idPaciente
      ]);
    } else {
      await pool.query(`
        INSERT INTO tbl_especialidades (
          ID_PACIENTE, ALERGIAS, ENFERMEDADES_CRONICAS, CIRUGIAS_PREVIAS,
          MEDICAMENTOS_ACTUALES, ANTECEDENTES_FAMILIARES, HABITOS, VACUNAS,
          NOTAS_IMPORTANTES, USUARIO_CREACION, FECHA_ACTUALIZACION
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `, [
        idPaciente,
        JSON.stringify(toArray(datos.ALERGIAS)),
        JSON.stringify(toArray(datos.ENFERMEDADES_CRONICAS)),
        JSON.stringify(toArray(datos.CIRUGIAS_PREVIAS)),
        JSON.stringify(toArray(datos.MEDICAMENTOS_ACTUALES)),
        JSON.stringify(toArray(datos.ANTECEDENTES_FAMILIARES)),
        JSON.stringify(toArray(datos.HABITOS)),
        JSON.stringify(toArray(datos.VACUNAS)),
        datos.NOTAS_IMPORTANTES || '',
        usuarioModificacion
      ]);
    }

    res.json({ success: true, message: "Historial médico actualizado correctamente" });

  } catch (err) {
    console.error(" Error en POST /api/historial/:idPaciente:", err);
    res.status(500).json({ error: "Error al guardar historial: " + err.message });
  }
});

// ============================================================
// GET /api/preclinica/:idCita - Obtener preclínica por cita
// ============================================================
router.get("/api/preclinica/:idCita", async (req, res) => {
  const { idCita } = req.params;
  try {
    const [rows] = await pool.query(`
      SELECT * FROM tbl_preclinica WHERE ID_CITA = ? ORDER BY FECHA_REGISTRO DESC LIMIT 1
    `, [idCita]);

    res.json({ success: true, preclinica: rows.length > 0 ? rows[0] : null });

  } catch (err) {
    console.error(" Error en GET /api/preclinica/:idCita:", err);
    res.status(500).json({ error: "Error al obtener preclínica" });
  }
});

// ============================================================
// POST /api/cambiar-estado - Cambiar estado de la cita
// ============================================================
router.post("/api/cambiar-estado", async (req, res) => {
  const { idCita, nuevoEstado } = req.body;

  if (!idCita || !nuevoEstado) {
    return res.status(400).json({ success: false, error: "Faltan parámetros: idCita, nuevoEstado" });
  }

  try {
    const usuarioModificacion = req.user?.USUARIO || 'SISTEMA';

    await pool.query(`
      UPDATE tbl_citas SET 
        ESTADO = ?,
        USUARIO_MODIFICACION = ?,
        FECHA_MODIFICACION = NOW()
      WHERE ID_CITA = ?
    `, [nuevoEstado, usuarioModificacion, idCita]);

    await registrarBitacora({
      usuario: usuarioModificacion,
      accion: "CAMBIO_ESTADO_CITA",
      descripcion: `El usuario ${usuarioModificacion} actualizó el estado de la cita #${idCita} a: '${nuevoEstado}' desde Consulta Médica`,
      modulo: "CONSULTA_MEDICA",
      idRegistro: idCita,
      tabla: "tbl_citas",
      estado: "EXITO",
      req: req
    });

    res.json({ success: true, message: `Cita cambiada a estado: ${nuevoEstado}` });

  } catch (err) {
    console.error(" Error en POST /api/cambiar-estado:", err);
    res.status(500).json({ error: "Error al cambiar estado de la cita" });
  }
});

// ============================================================
// POST /auto-cerrar - Ejecutar auto-cierre manualmente (CON LOGS)
// ============================================================
router.post("/auto-cerrar", async (req, res) => {
  try {
    const usuario = req.user || null;
    if (!usuario || usuario.ROL !== 'ADMINISTRADOR') {
      return res.status(403).json({ success: false, error: "No tienes permiso para ejecutar esta acción" });
    }

    const { horasInactividad = 1 } = req.body;
    const scheduler = require('../services/scheduler.service');
    const resultado = await scheduler.ejecutarManual({
      horasInactividad: Number(horasInactividad),
      cerrarAlFinalDelDia: false
    });

    res.json(resultado);
  } catch (err) {
    console.error(" Error en POST /consultaMedica/auto-cerrar:", err);
    res.status(500).json({ success: false, error: "Error al ejecutar auto-cierre: " + err.message });
  }
});

// ============================================================
// GET /test-auto-cerrar - Ruta de prueba (SIN autenticación)
// ============================================================
router.get("/test-auto-cerrar", async (req, res) => {
  try {
    const scheduler = require('../services/scheduler.service');
    const resultado = await scheduler.ejecutarManual({
      horasInactividad: 1,
      cerrarAlFinalDelDia: false
    });
    res.json(resultado);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// API: OBTENER MEDICAMENTOS DE CONSULTA
// ============================================================
router.get("/api/medicamentos/:idConsulta", async (req, res) => {
    try {
        const { idConsulta } = req.params;
        const [rows] = await pool.query(`
            SELECT pr.*, m.NOMBRE_MEDICAMENTO, m.NOMBRE_GENERICO, m.PRESENTACION
            FROM TBL_PRESCRIPCION pr
            INNER JOIN tbl_inventario_medicamentos m ON pr.ID_MEDICAMENTO = m.ID_MEDICAMENTO
            WHERE pr.ID_CONSULTA = ? AND pr.ESTADO = 'ACTIVA'
            ORDER BY pr.FECHA_PRESCRIPCION DESC
        `, [idConsulta]);
        res.json({ success: true, medicamentos: rows });
    } catch (err) {
        console.error("Error en /api/medicamentos:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;