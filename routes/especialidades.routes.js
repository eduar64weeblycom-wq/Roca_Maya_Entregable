// routes/especialidades.routes.js

const express = require("express");
const router = express.Router();

const pool = require("../database/db");
const xl = require("excel4node");
const {
  registrarBitacora
} = require("../services/bitacora.service");

/* ============================================================
    FUNCIONES AUXILIARES
============================================================ */

function getUsuario(req) {
  return (
    req.user?.USUARIO ||
    req.user?.NOMBRE_USUARIO ||
    req.user?.nombre ||
    "SISTEMA"
  );
}

function convertirId(valor) {
  const id = Number(valor);

  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }

  return id;
}

function normalizarTexto(valor) {
  return String(valor ?? "").trim();
}

function obtenerTerminosBusqueda(valor) {
  return normalizarTexto(valor)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .split(" ")
    .filter(Boolean);
}

function normalizarColor(valor) {
  const color = String(valor ?? "").trim();

  if (/^#[0-9A-Fa-f]{6}$/.test(color)) {
    return color.toUpperCase();
  }

  return "#3498DB";
}

function normalizarIcono(valor) {
  const icono = String(valor ?? "").trim();

  if (!icono) {
    return "fas fa-stethoscope";
  }

  if (!/^[a-zA-Z0-9\s-]+$/.test(icono)) {
    return "fas fa-stethoscope";
  }

  return icono;
}

function normalizarEstado(valor) {
  const estado = String(valor ?? "")
    .trim()
    .toUpperCase();

  return estado === "INACTIVA"
    ? "INACTIVA"
    : "ACTIVA";
}

async function registrarEventoBitacora(datos) {
  try {
    await registrarBitacora(datos);
  } catch (error) {
    console.error(
      "Error registrando evento en bitácora:",
      error
    );
  }
}

async function registrarErrorBitacora({
  req,
  accion,
  error,
  idRegistro = null
}) {
  await registrarEventoBitacora({
    usuario: getUsuario(req),
    accion,
    descripcion: error.message,
    modulo: "ESPECIALIDADES",
    idRegistro,
    tabla: "tbl_especialidades",
    estado: "ERROR",
    detalleError: error.message,
    req
  });
}

/* ============================================================
   GET /especialidades
   MOSTRAR VISTA PRINCIPAL
============================================================ */

router.get("/", async (req, res) => {
  try {
    await registrarEventoBitacora({
      usuario: getUsuario(req),
      accion: "ACCESO_ESPECIALIDADES",
      descripcion:
        "Acceso a la vista de especialidades médicas",
      modulo: "ESPECIALIDADES",
      tabla: "tbl_especialidades",
      estado: "EXITO",
      req
    });

    res.render("especialidades", {
      title: "Especialidades Médicas"
    });
  } catch (error) {
    console.error(
      "GET /especialidades error:",
      error
    );

    res.status(500).send(
      "Error interno del servidor."
    );
  }
});

/* ============================================================
   GET /especialidades/api/datos
============================================================ */

router.get("/api/datos", async (req, res) => {
  try {
    console.log(
      "✅ Ejecutando API de especialidades V5"
    );

    const [databaseRows] = await pool.query(`
      SELECT DATABASE() AS BASE_DATOS
    `);

    const baseDatos =
      databaseRows[0]?.BASE_DATOS ||
      "DESCONOCIDA";

    const [rows] = await pool.query(`
      SELECT
        e.ID_ESPECIALIDAD,
        e.NOMBRE_ESPECIALIDAD,
        e.DESCRIPCION,

        COALESCE(
          e.COLOR_HEXADECIMAL,
          '#3498DB'
        ) AS COLOR_HEXADECIMAL,

        COALESCE(
          e.ICONO,
          'fas fa-stethoscope'
        ) AS ICONO,

        e.ESTADO AS ESTADO_ESPECIALIDAD,

        de.ID_DOCTOR,

        COALESCE(
          de_total.TOTAL_ESPECIALIDADES_DOCTOR,
          1
        ) AS TOTAL_ESPECIALIDADES_DOCTOR,

        COALESCE(
          de_total.ESPECIALIDADES_DOCTOR,
          e.NOMBRE_ESPECIALIDAD
        ) AS ESPECIALIDADES_DOCTOR,

        u.NOMBRE_USUARIO AS NOMBRE_DOCTOR,

        COALESCE(
          u.CORREO_ELECTRONICO,
          ''
        ) AS CORREO_DOCTOR,

        COALESCE(
          u.TELEFONO_PROFESIONAL,
          ''
        ) AS TELEFONO_DOCTOR,

        COALESCE(
          u.ESTADO,
          'INACTIVO'
        ) AS ESTADO_DOCTOR,

        p.ID_PACIENTE,
        p.NOMBRES,
        p.APELLIDOS,

        TRIM(
          CONCAT(
            COALESCE(p.NOMBRES, ''),
            ' ',
            COALESCE(p.APELLIDOS, '')
          )
        ) AS NOMBRE_COMPLETO,

        COALESCE(
          p.CORREO_ELECTRONICO,
          ''
        ) AS CORREO_PACIENTE,

        COALESCE(
          p.TELEFONO,
          ''
        ) AS TELEFONO_PACIENTE,

        COALESCE(
          p.NUMERO_DOCUMENTO_IDENTIDAD,
          ''
        ) AS IDENTIDAD_PACIENTE,

        COALESCE(
          p.ESTADO,
          ''
        ) AS ESTADO_PACIENTE

      FROM tbl_especialidades e

      LEFT JOIN tbl_doctor_especialidad de
        ON de.ID_ESPECIALIDAD =
           e.ID_ESPECIALIDAD

      LEFT JOIN (
        SELECT
          de_resumen.ID_DOCTOR,
          COUNT(DISTINCT de_resumen.ID_ESPECIALIDAD)
            AS TOTAL_ESPECIALIDADES_DOCTOR,
          GROUP_CONCAT(
            DISTINCT e_resumen.NOMBRE_ESPECIALIDAD
            ORDER BY e_resumen.NOMBRE_ESPECIALIDAD
            SEPARATOR ' | '
          ) AS ESPECIALIDADES_DOCTOR
        FROM tbl_doctor_especialidad de_resumen
        INNER JOIN tbl_especialidades e_resumen
          ON e_resumen.ID_ESPECIALIDAD =
             de_resumen.ID_ESPECIALIDAD
        GROUP BY de_resumen.ID_DOCTOR
      ) de_total
        ON de_total.ID_DOCTOR =
           de.ID_DOCTOR

      LEFT JOIN tbl_ms_usuario u
        ON u.ID_USUARIO =
           de.ID_DOCTOR

      LEFT JOIN (
        SELECT DISTINCT
          ID_DOCTOR,
          ID_PACIENTE
        FROM tbl_citas
        WHERE ESTADO NOT IN (
          'CANCELADA',
          'NO_ASISTIO'
        )
      ) citas
        ON citas.ID_DOCTOR =
           de.ID_DOCTOR

      LEFT JOIN tbl_paciente p
        ON p.ID_PACIENTE =
           citas.ID_PACIENTE
        AND p.ESTADO = 'ACTIVO'

      ORDER BY
        CASE
          WHEN e.ESTADO = 'ACTIVA'
            THEN 1
          ELSE 2
        END,

        e.NOMBRE_ESPECIALIDAD ASC,
        u.NOMBRE_USUARIO ASC,
        p.APELLIDOS ASC,
        p.NOMBRES ASC
    `);

    const especialidadesMap = new Map();

    for (const row of rows) {
      const idEspecialidad = Number(row.ID_ESPECIALIDAD);
      const especialidadKey = String(idEspecialidad);

      if (!especialidadesMap.has(especialidadKey)) {
        especialidadesMap.set(
          especialidadKey,
          {
            ID_ESPECIALIDAD: idEspecialidad,
            NOMBRE_ESPECIALIDAD: row.NOMBRE_ESPECIALIDAD || "Especialidad sin nombre",
            DESCRIPCION: row.DESCRIPCION || "",
            COLOR_HEXADECIMAL: row.COLOR_HEXADECIMAL || "#3498DB",
            ICONO: row.ICONO || "fas fa-stethoscope",
            ESTADO: row.ESTADO_ESPECIALIDAD || "ACTIVA",
            CANTIDAD_MEDICOS: 0,
            CANTIDAD_PACIENTES: 0,
            medicos: [],
            _medicosMap: new Map(),
            _pacientesUnicos: new Set()
          }
        );
      }

      const especialidad = especialidadesMap.get(especialidadKey);

      if (row.ID_DOCTOR === null || row.ID_DOCTOR === undefined) {
        continue;
      }

      const idDoctor = Number(row.ID_DOCTOR);
      const doctorKey = String(idDoctor);

      if (!especialidad._medicosMap.has(doctorKey)) {
        const nuevoDoctor = {
          ID_DOCTOR: idDoctor,
          NOMBRE_DOCTOR: row.NOMBRE_DOCTOR || "Médico sin nombre",
          CORREO_DOCTOR: row.CORREO_DOCTOR || "",
          TELEFONO_DOCTOR: row.TELEFONO_DOCTOR || "",
          ESTADO_DOCTOR: row.ESTADO_DOCTOR || "INACTIVO",
          TOTAL_ESPECIALIDADES_DOCTOR: Number(row.TOTAL_ESPECIALIDADES_DOCTOR || 1),
          ESPECIALIDADES_DOCTOR: row.ESPECIALIDADES_DOCTOR || row.NOMBRE_ESPECIALIDAD || "",
          CANTIDAD_PACIENTES: 0,
          pacientes: [],
          _pacientesMap: new Set()
        };

        especialidad._medicosMap.set(doctorKey, nuevoDoctor);
        especialidad.medicos.push(nuevoDoctor);
      }

      const doctor = especialidad._medicosMap.get(doctorKey);

      if (row.ID_PACIENTE === null || row.ID_PACIENTE === undefined) {
        continue;
      }

      const idPaciente = Number(row.ID_PACIENTE);
      const pacienteKey = String(idPaciente);

      if (!doctor._pacientesMap.has(pacienteKey)) {
        doctor._pacientesMap.add(pacienteKey);
        especialidad._pacientesUnicos.add(pacienteKey);

        doctor.pacientes.push({
          ID_PACIENTE: idPaciente,
          NOMBRES: row.NOMBRES || "",
          APELLIDOS: row.APELLIDOS || "",
          NOMBRE_COMPLETO: row.NOMBRE_COMPLETO || "Paciente sin nombre",
          CORREO_ELECTRONICO: row.CORREO_PACIENTE || "",
          TELEFONO: row.TELEFONO_PACIENTE || "",
          NUMERO_DOCUMENTO_IDENTIDAD: row.IDENTIDAD_PACIENTE || "",
          ESTADO: row.ESTADO_PACIENTE || "ACTIVO",
          ID_ESPECIALIDAD_CLASIFICACION: idEspecialidad,
          NOMBRE_ESPECIALIDAD_CLASIFICACION: row.NOMBRE_ESPECIALIDAD || "",
          ESPECIALIDADES_DOCTOR: row.ESPECIALIDADES_DOCTOR || row.NOMBRE_ESPECIALIDAD || "",
          ESPECIALIDAD_CITA_DETERMINADA: Number(row.TOTAL_ESPECIALIDADES_DOCTOR || 1) === 1
        });
      }
    }

    const especialidades = Array.from(especialidadesMap.values()).map((especialidad) => {
      especialidad.medicos.sort((doctorA, doctorB) =>
        String(doctorA.NOMBRE_DOCTOR).localeCompare(String(doctorB.NOMBRE_DOCTOR), "es", { sensitivity: "base" })
      );

      especialidad.medicos.forEach((doctor) => {
        doctor.pacientes.sort((pacienteA, pacienteB) => {
          const comparacionApellidos = String(pacienteA.APELLIDOS).localeCompare(String(pacienteB.APELLIDOS), "es", { sensitivity: "base" });
          if (comparacionApellidos !== 0) return comparacionApellidos;
          return String(pacienteA.NOMBRES).localeCompare(String(pacienteB.NOMBRES), "es", { sensitivity: "base" });
        });

        doctor.CANTIDAD_PACIENTES = doctor.pacientes.length;
        delete doctor._pacientesMap;
      });

      especialidad.CANTIDAD_MEDICOS = especialidad.medicos.length;
      especialidad.CANTIDAD_PACIENTES = especialidad._pacientesUnicos.size;

      delete especialidad._medicosMap;
      delete especialidad._pacientesUnicos;

      return especialidad;
    });

    const referenciaPorDoctor = new Map();
    const totalEspecialidadesPorDoctor = new Map();

    especialidades.forEach((especialidad) => {
      especialidad.medicos.forEach((doctor) => {
        const doctorKey = String(doctor.ID_DOCTOR);
        totalEspecialidadesPorDoctor.set(
          doctorKey,
          (totalEspecialidadesPorDoctor.get(doctorKey) || 0) + 1
        );

        const referenciaActual = referenciaPorDoctor.get(doctorKey);
        if (!referenciaActual || Number(especialidad.ID_ESPECIALIDAD) < Number(referenciaActual.ID_ESPECIALIDAD)) {
          referenciaPorDoctor.set(doctorKey, {
            ID_ESPECIALIDAD: especialidad.ID_ESPECIALIDAD,
            NOMBRE_ESPECIALIDAD: especialidad.NOMBRE_ESPECIALIDAD
          });
        }
      });
    });

    especialidades.forEach((especialidad) => {
      const pacientesEspecialidad = new Set();

      especialidad.medicos.forEach((doctor) => {
        const doctorKey = String(doctor.ID_DOCTOR);
        const referencia = referenciaPorDoctor.get(doctorKey);
        const totalEspecialidades = totalEspecialidadesPorDoctor.get(doctorKey) || 1;

        doctor.TOTAL_ESPECIALIDADES_DOCTOR = totalEspecialidades;
        doctor.ID_ESPECIALIDAD_REFERENCIA = referencia?.ID_ESPECIALIDAD || especialidad.ID_ESPECIALIDAD;
        doctor.NOMBRE_ESPECIALIDAD_REFERENCIA = referencia?.NOMBRE_ESPECIALIDAD || especialidad.NOMBRE_ESPECIALIDAD;
        doctor.ES_ESPECIALIDAD_REFERENCIA = Number(especialidad.ID_ESPECIALIDAD) === Number(doctor.ID_ESPECIALIDAD_REFERENCIA);
        doctor.PACIENTES_EN_ESPECIALIDAD_REFERENCIA = totalEspecialidades > 1 && !doctor.ES_ESPECIALIDAD_REFERENCIA;

        if (doctor.PACIENTES_EN_ESPECIALIDAD_REFERENCIA) {
          doctor.pacientes = [];
          doctor.CANTIDAD_PACIENTES = 0;
          return;
        }

        doctor.pacientes.forEach((paciente) => {
          pacientesEspecialidad.add(String(paciente.ID_PACIENTE));
        });
      });

      especialidad.CANTIDAD_PACIENTES = pacientesEspecialidad.size;
    });

    const doctoresUnicos = new Set();
    const pacientesUnicos = new Set();

    especialidades.forEach((especialidad) => {
      especialidad.medicos.forEach((doctor) => {
        doctoresUnicos.add(String(doctor.ID_DOCTOR));
        doctor.pacientes.forEach((paciente) => {
          pacientesUnicos.add(String(paciente.ID_PACIENTE));
        });
      });
    });

    res.json({
      success: true,
      version: "ESPECIALIDADES-V5",
      baseDatos,
      especialidades,
      resumen: {
        totalEspecialidades: especialidades.length,
        especialidadesActivas: especialidades.filter((e) => e.ESTADO === "ACTIVA").length,
        totalDoctores: doctoresUnicos.size,
        totalPacientes: pacientesUnicos.size
      }
    });
  } catch (error) {
    console.error("❌ Error GET /especialidades/api/datos:", error);
    await registrarErrorBitacora({ req, accion: "ERROR_CONSULTA_ESPECIALIDADES", error });

    res.status(500).json({
      success: false,
      version: "ESPECIALIDADES-V5",
      especialidades: [],
      message: "Error al consultar las especialidades, médicos y pacientes.",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
});

/* ============================================================
   GET /especialidades/excel
============================================================ */

router.get("/excel", async (req, res) => {
  try {
    const condiciones = [];
    const parametros = [];

    const terminosEspecialidad = obtenerTerminosBusqueda(req.query.especialidad);
    const terminosDoctor = obtenerTerminosBusqueda(req.query.doctor);
    const estado = String(req.query.estado || "").trim().toUpperCase();

    terminosEspecialidad.forEach((termino) => {
      condiciones.push(`LOWER(CONCAT_WS(' ', e.NOMBRE_ESPECIALIDAD, COALESCE(e.DESCRIPCION, ''))) LIKE ?`);
      parametros.push(`%${termino}%`);
    });

    terminosDoctor.forEach((termino) => {
      condiciones.push(`LOWER(CONCAT_WS(' ', COALESCE(de.ID_DOCTOR, ''), COALESCE(u.NOMBRE_USUARIO, ''), COALESCE(u.CORREO_ELECTRONICO, ''), COALESCE(u.TELEFONO_PROFESIONAL, ''))) LIKE ?`);
      parametros.push(`%${termino}%`);
    });

    if (["ACTIVA", "INACTIVA"].includes(estado)) {
      condiciones.push("e.ESTADO = ?");
      parametros.push(estado);
    }

    const whereSql = condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "";

    const [rows] = await pool.query(
      `
        SELECT
          e.ID_ESPECIALIDAD,
          e.NOMBRE_ESPECIALIDAD,
          e.ESTADO AS ESTADO_ESPECIALIDAD,
          de.ID_DOCTOR,
          u.NOMBRE_USUARIO AS NOMBRE_DOCTOR,
          COALESCE(u.CORREO_ELECTRONICO, '') AS CORREO_DOCTOR,
          COALESCE(u.TELEFONO_PROFESIONAL, '') AS TELEFONO_DOCTOR,
          COALESCE(u.ESTADO, '') AS ESTADO_DOCTOR,
          COALESCE(de_total.TOTAL_ESPECIALIDADES_DOCTOR, 0) AS TOTAL_ESPECIALIDADES_DOCTOR,
          COALESCE(de_total.ESPECIALIDADES_DOCTOR, e.NOMBRE_ESPECIALIDAD) AS ESPECIALIDADES_DOCTOR,
          p.ID_PACIENTE,
          TRIM(CONCAT(COALESCE(p.NOMBRES, ''), ' ', COALESCE(p.APELLIDOS, ''))) AS NOMBRE_PACIENTE,
          COALESCE(p.NUMERO_DOCUMENTO_IDENTIDAD, '') AS IDENTIDAD_PACIENTE,
          COALESCE(p.CORREO_ELECTRONICO, '') AS CORREO_PACIENTE,
          COALESCE(p.TELEFONO, '') AS TELEFONO_PACIENTE
        FROM tbl_especialidades e
        LEFT JOIN tbl_doctor_especialidad de
          ON de.ID_ESPECIALIDAD = e.ID_ESPECIALIDAD
        LEFT JOIN (
          SELECT
            de_resumen.ID_DOCTOR,
            COUNT(DISTINCT de_resumen.ID_ESPECIALIDAD) AS TOTAL_ESPECIALIDADES_DOCTOR,
            GROUP_CONCAT(DISTINCT e_resumen.NOMBRE_ESPECIALIDAD ORDER BY e_resumen.NOMBRE_ESPECIALIDAD SEPARATOR ' | ') AS ESPECIALIDADES_DOCTOR
          FROM tbl_doctor_especialidad de_resumen
          INNER JOIN tbl_especialidades e_resumen
            ON e_resumen.ID_ESPECIALIDAD = de_resumen.ID_ESPECIALIDAD
          GROUP BY de_resumen.ID_DOCTOR
        ) de_total
          ON de_total.ID_DOCTOR = de.ID_DOCTOR
        LEFT JOIN tbl_ms_usuario u
          ON u.ID_USUARIO = de.ID_DOCTOR
        LEFT JOIN (
          SELECT DISTINCT ID_DOCTOR, ID_PACIENTE
          FROM tbl_citas
          WHERE ESTADO NOT IN ('CANCELADA', 'NO_ASISTIO')
        ) citas
          ON citas.ID_DOCTOR = de.ID_DOCTOR
        LEFT JOIN tbl_paciente p
          ON p.ID_PACIENTE = citas.ID_PACIENTE
          AND p.ESTADO = 'ACTIVO'
        ${whereSql}
        ORDER BY
          CASE WHEN e.ESTADO = 'ACTIVA' THEN 1 ELSE 2 END,
          e.NOMBRE_ESPECIALIDAD ASC,
          u.NOMBRE_USUARIO ASC,
          p.APELLIDOS ASC,
          p.NOMBRES ASC
      `,
      parametros
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No hay información de especialidades que coincida con los filtros seleccionados."
      });
    }

    const workbook = new xl.Workbook({
      defaultFont: { name: "Segoe UI", size: 10, color: "#253347" }
    });

    workbook.addWorksheet("Resumen");
    workbook.addWorksheet("Directorio");

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=reporte_especialidades.xlsx");

    await workbook.writeToBuffer().then(buffer => {
      res.send(buffer);
    });

  } catch (error) {
    console.error("❌ Error GET /especialidades/excel:", error);
    await registrarErrorBitacora({ req, accion: "ERROR_EXPORTAR_EXCEL_ESPECIALIDADES", error });
    res.status(500).json({ success: false, message: "Error al generar el archivo Excel." });
  }
});

module.exports = router;