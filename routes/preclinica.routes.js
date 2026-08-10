const express = require("express");
const router = express.Router();
const pool = require("../database/db");
const {
  registrarBitacora,
} = require("../services/bitacora.service");

router.use(express.json());

router.use((req, res, next) => {
  try {
    if (
      req.body &&
      typeof req.body === "object"
    ) {
      delete req.body.IMC;
      delete req.body.imc;
    }
  } catch (e) {
    console.warn(
      "preclinica.routes sanitizar body fallo:",
      e
    );
  }

  next();
});

function tieneInfoMinima(pre) {
  const peso = Number(
    pre?.PESO ??
    pre?.peso ??
    0
  );

  const talla = Number(
    pre?.TALLA ??
    pre?.talla ??
    0
  );

  return peso > 0 && talla > 0;
}

// ------------------------------------------------------------
// Corrige: "Out of range value for column 'IMC'"
// ------------------------------------------------------------
function validarPesoTallaParaIMC(peso, talla) {
  const tieneValorPeso =
    peso !== undefined && peso !== null && String(peso).trim() !== "";
  const tieneValorTalla =
    talla !== undefined && talla !== null && String(talla).trim() !== "";

  if (!tieneValorPeso && !tieneValorTalla) {
    return { valido: true };
  }

  const pesoNum = Number(peso);
  const tallaNum = Number(talla);

  if (
    (tieneValorPeso && !(pesoNum > 0)) ||
    (tieneValorTalla && !(tallaNum > 0))
  ) {
    return {
      valido: false,
      mensaje:
        "El peso y la talla deben ser valores numéricos mayores que 0 " +
        "para poder calcular el IMC. Verifica los datos antes de guardar " +
        "la preclínica.",
    };
  }

  return { valido: true };
}

const CAMPOS_ESPERADOS_CONSULTA = [
  { key: "temperatura", label: "Temperatura" },
  { key: "presionSistolica", label: "Presión sistólica" },
  { key: "presionDiastolica", label: "Presión diastólica" },
  { key: "frecuenciaCardiaca", label: "Frecuencia cardíaca" },
  { key: "frecuenciaRespiratoria", label: "Frecuencia respiratoria" },
  { key: "saturacionOxigeno", label: "Saturación de oxígeno" },
  { key: "peso", label: "Peso" },
  { key: "talla", label: "Talla" },
];

function normalizarBooleano(value) {
  return value === true ||
    value === "true" ||
    value === 1 ||
    value === "1";
}

function tieneValor(value) {
  return !(
    value === null ||
    value === undefined ||
    String(value).trim() === ""
  );
}

function obtenerCamposPendientes(datos = {}) {
  return CAMPOS_ESPERADOS_CONSULTA
    .filter((campo) => !tieneValor(datos[campo.key]))
    .map((campo) => campo.label);
}

function convertirSignosJson(signosVitalesJson) {
  if (!signosVitalesJson) return {};

  if (
    typeof signosVitalesJson === "object" &&
    !Array.isArray(signosVitalesJson)
  ) {
    return { ...signosVitalesJson };
  }

  if (typeof signosVitalesJson === "string") {
    try {
      const parsed = JSON.parse(signosVitalesJson);
      return parsed && typeof parsed === "object"
        ? parsed
        : {};
    } catch (error) {
      console.warn(
        "No se pudo convertir signosVitalesJson:",
        error.message
      );
    }
  }

  return {};
}

function construirSignosJson({
  signosVitalesJson,
  datos,
  enviarAConsulta,
}) {
  const base = convertirSignosJson(signosVitalesJson);
  const camposPendientes = obtenerCamposPendientes(datos);
  const incompleta = camposPendientes.length > 0;

  return {
    ...base,
    temperatura: datos.temperatura ?? null,
    presionSistolica: datos.presionSistolica ?? null,
    presionDiastolica: datos.presionDiastolica ?? null,
    frecuenciaCardiaca: datos.frecuenciaCardiaca ?? null,
    frecuenciaRespiratoria: datos.frecuenciaRespiratoria ?? null,
    saturacionOxigeno: datos.saturacionOxigeno ?? null,
    peso: datos.peso ?? null,
    talla: datos.talla ?? null,
    glucosa: datos.glucosa ?? null,
    perimetroAbdominal: datos.perimetroAbdominal ?? null,
    controlConsulta: {
      ...(base.controlConsulta || {}),
      incompleta,
      camposPendientes,
      alertaActiva: Boolean(enviarAConsulta && incompleta),
      mensaje: incompleta
        ? "La preclínica tiene datos pendientes de registrar."
        : "Preclínica completa.",
      fechaActualizacion: new Date().toISOString(),
    },
  };
}

// ============================================================
// GET /preclinica
// ============================================================
router.get("/", async (req, res) => {
  try {
    await registrarBitacora({
      usuario: req.user ? req.user.USUARIO : "SISTEMA",
      accion: "ACCESO_PRECLINICA",
      descripcion: "Acceso a la vista de preclínica",
      modulo: "PRECLINICA",
      tabla: "tbl_preclinica",
      estado: "EXITO",
      req,
    });

    res.render("preclinica", {
      title: "Preclínica - Roca Maya",
    });
  } catch (err) {
    console.error("GET /preclinica error:", err);
    res.status(500).send("Error interno");
  }
});

// ============================================================
// GET /preclinica/api/datos
// ============================================================
router.get("/api/datos", async (req, res) => {
  try {
    const [citas] = await pool.query(`
      SELECT
        c.ID_CITA,
        c.ID_DOCTOR,
        CONCAT(p.NOMBRES, ' ', p.APELLIDOS) AS NOMBRE_PACIENTE,
        p.TELEFONO,
        p.CORREO_ELECTRONICO,
        u.NOMBRE_USUARIO AS NOMBRE_DOCTOR,
        c.FECHA_CITA,
        c.ESTADO
      FROM tbl_citas c
      INNER JOIN tbl_paciente p ON c.ID_PACIENTE = p.ID_PACIENTE
      LEFT JOIN tbl_ms_usuario u ON c.ID_DOCTOR = u.ID_USUARIO
      WHERE c.ESTADO IN ('PRECLINICA', 'CONSULTA_MEDICA', 'CANCELADA', 'NO_ASISTIO')
      ORDER BY c.FECHA_CITA DESC
    `);

    const [preclinicas] = await pool.query(`
      SELECT
        ID_PRECLINICA,
        ID_CITA,
        PESO,
        TALLA,
        TEMPERATURA,
        ESTADO_GENERAL,
        FECHA_REGISTRO,
        OBSERVACIONES,
        PRESION_SISTOLICA,
        PRESION_DIASTOLICA,
        FRECUENCIA_CARDIACA,
        FRECUENCIA_RESPIRATORIA,
        SATURACION_OXIGENO,
        GLUCOSA,
        PERIMETRO_ABDOMINAL,
        SIGNOS_VITALES_JSON
      FROM tbl_preclinica
    `);

    res.json({ citas, preclinicas });
  } catch (err) {
    console.error("GET /preclinica/api/datos error:", err);
    res.status(500).json({ citas: [], preclinicas: [], error: err.message });
  }
});

// ============================================================
// GET /preclinica/por-cita/:idCita
// ============================================================
router.get("/por-cita/:idCita", async (req, res) => {
  try {
    const id = Number(req.params.idCita || 0);

    if (!id) {
      return res.status(400).json({ success: false, message: "ID de cita inválido" });
    }

    const [rows] = await pool.query(
      `SELECT * FROM tbl_preclinica WHERE ID_CITA = ? LIMIT 1`,
      [id]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({ success: false, message: "No existe preclínica para esa cita" });
    }

    const preclinica = rows[0];

    try {
      if (preclinica.SIGNOS_VITALES_JSON && typeof preclinica.SIGNOS_VITALES_JSON === "string") {
        preclinica.SIGNOS_VITALES_JSON = JSON.parse(preclinica.SIGNOS_VITALES_JSON);
      }
    } catch (errorJson) {
      console.warn("No se pudo convertir SIGNOS_VITALES_JSON:", errorJson);
    }

    res.json({ success: true, preclinica });
  } catch (err) {
    console.error("GET /preclinica/por-cita error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================================
// POST /preclinica/nueva
// ============================================================
router.post("/nueva", async (req, res) => {
  let connection;

  try {
    const {
      idCita,
      temperatura,
      presionSistolica,
      presionDiastolica,
      frecuenciaCardiaca,
      frecuenciaRespiratoria,
      saturacionOxigeno,
      peso,
      talla,
      glucosa,
      perimetroAbdominal,
      observaciones,
      estadoGeneral,
      signosVitalesJson,
      enviarAConsulta,
    } = req.body;

    const idCitaNum = Number(idCita || 0);

    if (!idCitaNum) {
      return res.status(400).json({ success: false, message: "Falta ID de cita" });
    }

    const validacionIMC = validarPesoTallaParaIMC(peso, talla);
    if (!validacionIMC.valido) {
      return res.status(400).json({ success: false, message: validacionIMC.mensaje });
    }

    const debeEnviarAConsulta = normalizarBooleano(enviarAConsulta);
    const datosClinicos = {
      temperatura,
      presionSistolica,
      presionDiastolica,
      frecuenciaCardiaca,
      frecuenciaRespiratoria,
      saturacionOxigeno,
      peso,
      talla,
      glucosa,
      perimetroAbdominal,
    };
    const camposPendientes = obtenerCamposPendientes(datosClinicos);

    if (camposPendientes.length === CAMPOS_ESPERADOS_CONSULTA.length) {
      return res.status(400).json({
        success: false,
        message: "No se recibió ningún dato clínico para registrar la preclínica.",
        camposPendientes,
      });
    }

    const signosJsonStr = JSON.stringify(
      construirSignosJson({
        signosVitalesJson,
        datos: datosClinicos,
        enviarAConsulta: debeEnviarAConsulta,
      })
    );

    const usuarioCreacion = req.user && req.user.USUARIO ? req.user.USUARIO : "SISTEMA";

    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [exists] = await connection.query(
      `SELECT ID_PRECLINICA FROM tbl_preclinica WHERE ID_CITA = ? FOR UPDATE`,
      [idCitaNum]
    );

    if (exists && exists.length > 0) {
      await connection.rollback();
      return res.status(409).json({ success: false, message: "Ya existe una preclínica asociada a esa cita" });
    }

    const [result] = await connection.query(
      `
        INSERT INTO tbl_preclinica (
          ID_CITA, ID_USUARIO_ENFERMERIA, TEMPERATURA, PRESION_SISTOLICA,
          PRESION_DIASTOLICA, FRECUENCIA_CARDIACA, FRECUENCIA_RESPIRATORIA,
          SATURACION_OXIGENO, PESO, TALLA, GLUCOSA, PERIMETRO_ABDOMINAL,
          OBSERVACIONES, ESTADO_GENERAL, SIGNOS_VITALES_JSON, USUARIO_CREACION
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        idCitaNum,
        req.user && req.user.ID_USUARIO ? req.user.ID_USUARIO : 1,
        temperatura ?? null,
        presionSistolica ?? null,
        presionDiastolica ?? null,
        frecuenciaCardiaca ?? null,
        frecuenciaRespiratoria ?? null,
        saturacionOxigeno ?? null,
        peso ?? null,
        talla ?? null,
        glucosa ?? null,
        perimetroAbdominal ?? null,
        observaciones || null,
        estadoGeneral || "BUENO",
        signosJsonStr,
        usuarioCreacion,
      ]
    );

    if (!result || !result.affectedRows) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: "No se pudo crear la preclínica" });
    }

    const idPre = result.insertId;

    if (debeEnviarAConsulta) {
      await connection.query(
        `
          UPDATE tbl_citas
          SET ESTADO = 'CONSULTA_MEDICA', FECHA_MODIFICACION = CURRENT_TIMESTAMP, USUARIO_MODIFICACION = ?
          WHERE ID_CITA = ?
        `,
        [usuarioCreacion, idCitaNum]
      );
    }

    await connection.commit();

    await registrarBitacora({
      usuario: usuarioCreacion,
      accion: "CREACION_PRECLINICA",
      descripcion: `Creada preclínica ID ${idPre} para cita ${idCitaNum}` + (camposPendientes.length ? ` con ${camposPendientes.length} dato(s) pendiente(s)` : ""),
      modulo: "PRECLINICA",
      idRegistro: idPre,
      tabla: "tbl_preclinica",
      estado: "EXITO",
      req,
    });

    if (debeEnviarAConsulta) {
      await registrarBitacora({
        usuario: usuarioCreacion,
        accion: "CAMBIO_ESTADO_CITA_POR_PRECLINICA",
        descripcion: `Cita ${idCitaNum} -> CONSULTA_MEDICA tras crear preclínica ${idPre}`,
        modulo: "CITAS",
        idRegistro: idCitaNum,
        tabla: "tbl_citas",
        estado: "EXITO",
        req,
      });
    }

    const alertaConsulta = debeEnviarAConsulta && camposPendientes.length > 0;

    return res.json({
      success: true,
      message: debeEnviarAConsulta
        ? alertaConsulta
          ? "Preclínica guardada y enviada a Consulta Médica con una alerta por datos pendientes."
          : "Preclínica guardada y enviada a Consulta Médica correctamente."
        : "Preclínica guardada correctamente. La cita permanece en Preclínica.",
      idPreclinica: idPre,
      enviadoAConsulta: debeEnviarAConsulta,
      alertaConsulta,
      camposPendientes,
    });
  } catch (err) {
    if (connection) {
      try { await connection.rollback(); } catch (e) {}
    }
    console.error("POST /preclinica/nueva error:", err);
    return res.status(500).json({ success: false, message: "Error creando preclínica: " + err.message });
  } finally {
    if (connection) connection.release();
  }
});

// ============================================================
// POST /preclinica/actualizar
// ============================================================
router.post("/actualizar", async (req, res) => {
  let connection;

  try {
    const {
      idPreclinica,
      idCita,
      temperatura,
      presionSistolica,
      presionDiastolica,
      frecuenciaCardiaca,
      frecuenciaRespiratoria,
      saturacionOxigeno,
      peso,
      talla,
      glucosa,
      perimetroAbdominal,
      observaciones,
      estadoGeneral,
      signosVitalesJson,
      enviarAConsulta,
    } = req.body;

    const idPre = Number(idPreclinica || 0);

    if (!idPre) {
      return res.status(400).json({ success: false, message: "Falta ID preclínica" });
    }

    const validacionIMC = validarPesoTallaParaIMC(peso, talla);
    if (!validacionIMC.valido) {
      return res.status(400).json({ success: false, message: validacionIMC.mensaje });
    }

    const datosClinicos = {
      temperatura,
      presionSistolica,
      presionDiastolica,
      frecuenciaCardiaca,
      frecuenciaRespiratoria,
      saturacionOxigeno,
      peso,
      talla,
      glucosa,
      perimetroAbdominal,
    };
    const camposPendientes = obtenerCamposPendientes(datosClinicos);

    if (camposPendientes.length === CAMPOS_ESPERADOS_CONSULTA.length) {
      return res.status(400).json({
        success: false,
        message: "No se recibió ningún dato clínico para actualizar la preclínica.",
        camposPendientes,
      });
    }

    const usuarioMod = req.user && req.user.USUARIO ? req.user.USUARIO : "SISTEMA";
    const debeEnviarAConsulta = normalizarBooleano(enviarAConsulta);

    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [registroActual] = await connection.query(
      `SELECT ID_CITA, SIGNOS_VITALES_JSON FROM tbl_preclinica WHERE ID_PRECLINICA = ? LIMIT 1 FOR UPDATE`,
      [idPre]
    );

    if (!registroActual || registroActual.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Preclínica no encontrada" });
    }

    const idCitaNum = Number(idCita || registroActual[0].ID_CITA || 0);

    const signosJsonStr = JSON.stringify(
      construirSignosJson({
        signosVitalesJson: signosVitalesJson ?? registroActual[0].SIGNOS_VITALES_JSON,
        datos: datosClinicos,
        enviarAConsulta: debeEnviarAConsulta,
      })
    );

    const [result] = await connection.query(
      `
        UPDATE tbl_preclinica
        SET
          TEMPERATURA = ?, PRESION_SISTOLICA = ?, PRESION_DIASTOLICA = ?,
          FRECUENCIA_CARDIACA = ?, FRECUENCIA_RESPIRATORIA = ?, SATURACION_OXIGENO = ?,
          PESO = ?, TALLA = ?, GLUCOSA = ?, PERIMETRO_ABDOMINAL = ?,
          OBSERVACIONES = ?, ESTADO_GENERAL = ?, SIGNOS_VITALES_JSON = ?, USUARIO_MODIFICACION = ?
        WHERE ID_PRECLINICA = ?
      `,
      [
        temperatura ?? null,
        presionSistolica ?? null,
        presionDiastolica ?? null,
        frecuenciaCardiaca ?? null,
        frecuenciaRespiratoria ?? null,
        saturacionOxigeno ?? null,
        peso ?? null,
        talla ?? null,
        glucosa ?? null,
        perimetroAbdominal ?? null,
        observaciones || null,
        estadoGeneral || "BUENO",
        signosJsonStr,
        usuarioMod,
        idPre,
      ]
    );

    if (result.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Preclínica no encontrada" });
    }

    if (debeEnviarAConsulta && idCitaNum) {
      await connection.query(
        `
          UPDATE tbl_citas
          SET ESTADO = 'CONSULTA_MEDICA', FECHA_MODIFICACION = CURRENT_TIMESTAMP, USUARIO_MODIFICACION = ?
          WHERE ID_CITA = ?
        `,
        [usuarioMod, idCitaNum]
      );
    }

    let estadoActual = "PRECLINICA";
    if (idCitaNum) {
      const [estadoRows] = await connection.query(`SELECT ESTADO FROM tbl_citas WHERE ID_CITA = ? LIMIT 1`, [idCitaNum]);
      if (estadoRows && estadoRows.length) {
        estadoActual = estadoRows[0].ESTADO || estadoActual;
      }
    }

    await connection.commit();

    await registrarBitacora({
      usuario: usuarioMod,
      accion: "ACTUALIZACION_PRECLINICA",
      descripcion: `Actualizada preclínica ID ${idPre}`,
      modulo: "PRECLINICA",
      idRegistro: idPre,
      tabla: "tbl_preclinica",
      estado: "EXITO",
      req,
    });

    const alertaConsulta = debeEnviarAConsulta && camposPendientes.length > 0;

    return res.json({
      success: true,
      message: "Preclínica actualizada correctamente.",
      enviadoAConsulta: debeEnviarAConsulta,
      alertaConsulta,
      camposPendientes,
      nota_estado_actualizado: estadoActual,
    });
  } catch (err) {
    if (connection) {
      try { await connection.rollback(); } catch (e) {}
    }
    console.error("POST /preclinica/actualizar error:", err);
    return res.status(500).json({ success: false, message: "Error actualizando preclínica: " + err.message });
  } finally {
    if (connection) connection.release();
  }
});

// ============================================================
// DELETE /preclinica/eliminar/:idCita
// ============================================================
router.delete("/eliminar/:idCita", async (req, res) => {
  let connection;

  try {
    const idCita = Number(req.params.idCita || 0);

    if (!idCita || !Number.isInteger(idCita)) {
      return res.status(400).json({ success: false, message: "El ID de la cita no es válido" });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [rows] = await connection.query(
      `
        SELECT p.ID_PRECLINICA, p.ID_CITA, c.ESTADO AS ESTADO_CITA
        FROM tbl_preclinica p
        INNER JOIN tbl_citas c ON c.ID_CITA = p.ID_CITA
        WHERE p.ID_CITA = ?
        LIMIT 1
        FOR UPDATE
      `,
      [idCita]
    );

    if (!rows || rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "No existe una preclínica asociada a esta cita" });
    }

    const preclinica = rows[0];
    const idPreclinica = Number(preclinica.ID_PRECLINICA);
    const estadoAnterior = String(preclinica.ESTADO_CITA || "").toUpperCase();

    const [resultado] = await connection.query(
      `DELETE FROM tbl_preclinica WHERE ID_PRECLINICA = ? AND ID_CITA = ?`,
      [idPreclinica, idCita]
    );

    if (!resultado || resultado.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "No se encontró la preclínica para eliminar" });
    }

    const usuario = req.user && req.user.USUARIO ? req.user.USUARIO : "SISTEMA";
    let nuevoEstado = estadoAnterior;

    if (estadoAnterior === "CONSULTA_MEDICA") {
      nuevoEstado = "PRECLINICA";
      await connection.query(
        `
          UPDATE tbl_citas
          SET ESTADO = 'PRECLINICA', FECHA_MODIFICACION = CURRENT_TIMESTAMP, USUARIO_MODIFICACION = ?
          WHERE ID_CITA = ?
        `,
        [usuario, idCita]
      );
    }

    await connection.commit();

    await registrarBitacora({
      usuario,
      accion: "ELIMINACION_PRECLINICA",
      descripcion: `Eliminada preclínica ID ${idPreclinica} asociada a la cita ${idCita}`,
      modulo: "PRECLINICA",
      idRegistro: idPreclinica,
      tabla: "tbl_preclinica",
      estado: "EXITO",
      req,
    });

    return res.status(200).json({
      success: true,
      message: "Preclínica eliminada correctamente",
      idPreclinica,
      idCita,
      estadoAnterior,
      nuevoEstado,
    });
  } catch (err) {
    if (connection) {
      try { await connection.rollback(); } catch (e) {}
    }
    console.error("DELETE /preclinica/eliminar/:idCita error:", err);
    return res.status(500).json({ success: false, message: "Error eliminando preclínica: " + err.message });
  } finally {
    if (connection) connection.release();
  }
});

// ============================================================
// POST /preclinica/pasar-a-consulta
// ============================================================
router.post("/pasar-a-consulta", async (req, res) => {
  let connection;

  try {
    const id = Number(req.body.idCita || 0);

    if (!id) {
      return res.status(400).json({ success: false, message: "ID de cita inválido" });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [rows] = await connection.query(
      `
        SELECT
          ID_PRECLINICA, TEMPERATURA, PRESION_SISTOLICA, PRESION_DIASTOLICA,
          FRECUENCIA_CARDIACA, FRECUENCIA_RESPIRATORIA, SATURACION_OXIGENO,
          PESO, TALLA, GLUCOSA, PERIMETRO_ABDOMINAL, SIGNOS_VITALES_JSON
        FROM tbl_preclinica
        WHERE ID_CITA = ?
        LIMIT 1
        FOR UPDATE
      `,
      [id]
    );

    if (!rows || rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "No existe preclínica para esta cita" });
    }

    const registro = rows[0];
    const datosClinicos = {
      temperatura: registro.TEMPERATURA,
      presionSistolica: registro.PRESION_SISTOLICA,
      presionDiastolica: registro.PRESION_DIASTOLICA,
      frecuenciaCardiaca: registro.FRECUENCIA_CARDIACA,
      frecuenciaRespiratoria: registro.FRECUENCIA_RESPIRATORIA,
      saturacionOxigeno: registro.SATURACION_OXIGENO,
      peso: registro.PESO,
      talla: registro.TALLA,
      glucosa: registro.GLUCOSA,
      perimetroAbdominal: registro.PERIMETRO_ABDOMINAL,
    };
    const camposPendientes = obtenerCamposPendientes(datosClinicos);
    const signosJsonStr = JSON.stringify(
      construirSignosJson({
        signosVitalesJson: registro.SIGNOS_VITALES_JSON,
        datos: datosClinicos,
        enviarAConsulta: true,
      })
    );
    const usuario = req.user && req.user.USUARIO ? req.user.USUARIO : "SISTEMA";

    await connection.query(
      `UPDATE tbl_preclinica SET SIGNOS_VITALES_JSON = ?, USUARIO_MODIFICACION = ? WHERE ID_PRECLINICA = ?`,
      [signosJsonStr, usuario, registro.ID_PRECLINICA]
    );

    await connection.query(
      `UPDATE tbl_citas SET ESTADO = 'CONSULTA_MEDICA', FECHA_MODIFICACION = CURRENT_TIMESTAMP, USUARIO_MODIFICACION = ? WHERE ID_CITA = ?`,
      [usuario, id]
    );

    await connection.commit();

    await registrarBitacora({
      usuario,
      accion: "PASAR_PRECLINICA_A_CONSULTA",
      descripcion: `Cita ${id} pasada a CONSULTA_MEDICA`,
      modulo: "CITAS",
      idRegistro: id,
      tabla: "tbl_citas",
      estado: "EXITO",
      req,
    });

    return res.json({
      success: true,
      message: "Cita enviada a Consulta Médica correctamente.",
      alertaConsulta: camposPendientes.length > 0,
      camposPendientes,
      nuevoEstado: "CONSULTA_MEDICA",
    });
  } catch (err) {
    if (connection) {
      try { await connection.rollback(); } catch (e) {}
    }
    console.error("POST /preclinica/pasar-a-consulta error:", err);
    return res.status(500).json({ success: false, message: "Error: " + err.message });
  } finally {
    if (connection) connection.release();
  }
});

// ============================================================
// GET /preclinica/alertas-consulta/:idCita
// ============================================================
router.get("/alertas-consulta/:idCita", async (req, res) => {
  try {
    const idCita = Number(req.params.idCita || 0);

    if (!idCita) {
      return res.status(400).json({ success: false, message: "ID de cita inválido" });
    }

    const [rows] = await pool.query(
      `
        SELECT
          TEMPERATURA, PRESION_SISTOLICA, PRESION_DIASTOLICA, FRECUENCIA_CARDIACA,
          FRECUENCIA_RESPIRATORIA, SATURACION_OXIGENO, PESO, TALLA, GLUCOSA,
          PERIMETRO_ABDOMINAL, SIGNOS_VITALES_JSON
        FROM tbl_preclinica
        WHERE ID_CITA = ?
        LIMIT 1
      `,
      [idCita]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({ success: false, message: "No existe preclínica para esta cita" });
    }

    const registro = rows[0];
    const datosClinicos = {
      temperatura: registro.TEMPERATURA,
      presionSistolica: registro.PRESION_SISTOLICA,
      presionDiastolica: registro.PRESION_DIASTOLICA,
      frecuenciaCardiaca: registro.FRECUENCIA_CARDIACA,
      frecuenciaRespiratoria: registro.FRECUENCIA_RESPIRATORIA,
      saturacionOxigeno: registro.SATURACION_OXIGENO,
      peso: registro.PESO,
      talla: registro.TALLA,
      glucosa: registro.GLUCOSA,
      perimetroAbdominal: registro.PERIMETRO_ABDOMINAL,
    };
    const camposPendientes = obtenerCamposPendientes(datosClinicos);
    const signosJson = convertirSignosJson(registro.SIGNOS_VITALES_JSON);
    const alertasClinicas = Array.isArray(signosJson?.controlConsulta?.alertasClinicas)
      ? signosJson.controlConsulta.alertasClinicas
      : [];
    const alertaActiva = camposPendientes.length > 0 || alertasClinicas.length > 0;

    return res.json({
      success: true,
      idCita,
      alertaActiva,
      preclinicaIncompleta: camposPendientes.length > 0,
      camposPendientes,
      alertasClinicas,
      message: camposPendientes.length ? `Faltan datos de preclínica: ${camposPendientes.join(", ")}.` : "Completa.",
    });
  } catch (err) {
    console.error("GET /preclinica/alertas-consulta/:idCita error:", err);
    return res.status(500).json({ success: false, message: "Error consultando alertas: " + err.message });
  }
});

// ============================================================
// GET /preclinica/excel
// ============================================================
router.get("/excel", async (req, res) => {
  try {
    const [preclinicas] = await pool.query(`
      SELECT
        p.ID_PRECLINICA, c.ID_CITA, CONCAT(pa.NOMBRES, ' ', pa.APELLIDOS) AS NOMBRE_PACIENTE,
        pa.NUMERO_DOCUMENTO_IDENTIDAD AS IDENTIDAD_PACIENTE, pa.TELEFONO, p.FECHA_REGISTRO,
        p.TEMPERATURA, p.PRESION_SISTOLICA, p.PRESION_DIASTOLICA, p.FRECUENCIA_CARDIACA,
        p.FRECUENCIA_RESPIRATORIA, p.SATURACION_OXIGENO, p.PESO, p.TALLA, p.IMC,
        p.GLUCOSA, p.PERIMETRO_ABDOMINAL, p.ESTADO_GENERAL, p.OBSERVACIONES,
        u.NOMBRE_USUARIO AS ENFERMERA, c.ESTADO AS ESTADO_CITA
      FROM tbl_preclinica p
      INNER JOIN tbl_citas c ON p.ID_CITA = c.ID_CITA
      INNER JOIN tbl_paciente pa ON c.ID_PACIENTE = pa.ID_PACIENTE
      LEFT JOIN tbl_ms_usuario u ON p.ID_USUARIO_ENFERMERIA = u.ID_USUARIO
      ORDER BY p.FECHA_REGISTRO DESC
    `);

    if (!preclinicas || preclinicas.length === 0) {
      return res.status(404).json({ success: false, message: "No hay registros de preclínica para exportar" });
    }

    const { generarExcelPreclinica } = require("../services/excel.service");
    await generarExcelPreclinica(preclinicas, res);
  } catch (error) {
    console.error("Error exportando Excel de preclínica:", error);
    res.status(500).json({ success: false, message: "Error al generar el archivo Excel: " + error.message });
  }
});

// ============================================================
// DELETE /citas/eliminar/:idCita
// ============================================================
router.delete("/citas/eliminar/:idCita", async (req, res) => {
  let connection;

  try {
    const idCita = Number(req.params.idCita || 0);

    if (!idCita || !Number.isInteger(idCita)) {
      return res.status(400).json({ success: false, message: "El ID de la cita no es válido" });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [citaCheck] = await connection.query(
      `SELECT ID_CITA FROM tbl_citas WHERE ID_CITA = ? LIMIT 1 FOR UPDATE`,
      [idCita]
    );

    if (!citaCheck || citaCheck.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "No se encontró la cita para eliminar." });
    }

    await connection.query(`DELETE FROM tbl_preclinica WHERE ID_CITA = ?`, [idCita]);

    const [resultado] = await connection.query(`DELETE FROM tbl_citas WHERE ID_CITA = ?`, [idCita]);

    if (!resultado || resultado.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "No se pudo eliminar la cita." });
    }

    await connection.commit();

    const usuario = req.user && req.user.USUARIO ? req.user.USUARIO : "SISTEMA";

    await registrarBitacora({
      usuario,
      accion: "ELIMINACION_CITA",
      descripcion: `Eliminada la cita ID ${idCita} junto con sus preclínicas asociadas`,
      modulo: "CITAS",
      idRegistro: idCita,
      tabla: "tbl_citas",
      estado: "EXITO",
      req,
    });

    return res.status(200).json({
      success: true,
      message: "Cita y sus registros asociados eliminados correctamente.",
      idCita,
    });
  } catch (err) {
    if (connection) {
      try { await connection.rollback(); } catch (e) {}
    }
    console.error("DELETE /citas/eliminar/:idCita error:", err);
    return res.status(500).json({ success: false, message: "Error eliminando la cita: " + err.message });
  } finally {
    if (connection) connection.release();
  }
});

module.exports = router;