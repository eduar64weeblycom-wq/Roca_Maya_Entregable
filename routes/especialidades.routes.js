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
    tabla: "tbl_especialidade",
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
      tabla: "tbl_especialidade",
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

   RELACIÓN UTILIZADA:

   tbl_especialidade
          ↓
   tbl_doctor_especialidad
          ↓
   tbl_ms_usuario
          ↓
   tbl_citas
          ↓
   tbl_paciente

   IMPORTANTE:
   tbl_citas no contiene ID_ESPECIALIDAD. Por eso, cuando un
   doctor tenga varias especialidades, sus pacientes aparecerán
   dentro de cada especialidad asignada a ese doctor.
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

    console.log(
      "📦 Base de datos conectada:",
      baseDatos
    );

    /*
      La subconsulta de citas usa DISTINCT para evitar que un
      paciente aparezca repetido cuando tiene varias citas con
      el mismo médico.
    */
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

      FROM tbl_especialidade e

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
        INNER JOIN tbl_especialidade e_resumen
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

    console.log(
      "📋 Filas obtenidas:",
      rows.length
    );

    const especialidadesMap =
      new Map();

    for (const row of rows) {
      const idEspecialidad =
        Number(row.ID_ESPECIALIDAD);

      const especialidadKey =
        String(idEspecialidad);

      /*
        Crear la especialidad una sola vez.
      */
      if (
        !especialidadesMap.has(
          especialidadKey
        )
      ) {
        especialidadesMap.set(
          especialidadKey,
          {
            ID_ESPECIALIDAD:
              idEspecialidad,

            NOMBRE_ESPECIALIDAD:
              row.NOMBRE_ESPECIALIDAD ||
              "Especialidad sin nombre",

            DESCRIPCION:
              row.DESCRIPCION || "",

            COLOR_HEXADECIMAL:
              row.COLOR_HEXADECIMAL ||
              "#3498DB",

            ICONO:
              row.ICONO ||
              "fas fa-stethoscope",

            ESTADO:
              row.ESTADO_ESPECIALIDAD ||
              "ACTIVA",

            CANTIDAD_MEDICOS: 0,
            CANTIDAD_PACIENTES: 0,

            medicos: [],

            /*
              Propiedades temporales para evitar registros
              duplicados durante la agrupación.
            */
            _medicosMap: new Map(),
            _pacientesUnicos: new Set()
          }
        );
      }

      const especialidad =
        especialidadesMap.get(
          especialidadKey
        );

      /*
        Una especialidad puede existir sin médicos.
      */
      if (
        row.ID_DOCTOR === null ||
        row.ID_DOCTOR === undefined
      ) {
        continue;
      }

      const idDoctor =
        Number(row.ID_DOCTOR);

      const doctorKey =
        String(idDoctor);

      /*
        Crear el médico una sola vez dentro de cada
        especialidad.
      */
      if (
        !especialidad._medicosMap.has(
          doctorKey
        )
      ) {
        const nuevoDoctor = {
          ID_DOCTOR:
            idDoctor,

          NOMBRE_DOCTOR:
            row.NOMBRE_DOCTOR ||
            "Médico sin nombre",

          CORREO_DOCTOR:
            row.CORREO_DOCTOR || "",

          TELEFONO_DOCTOR:
            row.TELEFONO_DOCTOR || "",

          ESTADO_DOCTOR:
            row.ESTADO_DOCTOR ||
            "INACTIVO",

          TOTAL_ESPECIALIDADES_DOCTOR:
            Number(
              row.TOTAL_ESPECIALIDADES_DOCTOR || 1
            ),

          ESPECIALIDADES_DOCTOR:
            row.ESPECIALIDADES_DOCTOR ||
            row.NOMBRE_ESPECIALIDAD ||
            "",

          CANTIDAD_PACIENTES: 0,

          pacientes: [],

          _pacientesMap: new Set()
        };

        especialidad._medicosMap.set(
          doctorKey,
          nuevoDoctor
        );

        especialidad.medicos.push(
          nuevoDoctor
        );
      }

      const doctor =
        especialidad._medicosMap.get(
          doctorKey
        );

      /*
        El médico puede existir sin pacientes asociados.
      */
      if (
        row.ID_PACIENTE === null ||
        row.ID_PACIENTE === undefined
      ) {
        continue;
      }

      const idPaciente =
        Number(row.ID_PACIENTE);

      const pacienteKey =
        String(idPaciente);

      /*
        Evitar repetir al mismo paciente cuando tiene varias
        citas con el médico.
      */
      if (
        !doctor._pacientesMap.has(
          pacienteKey
        )
      ) {
        doctor._pacientesMap.add(
          pacienteKey
        );

        especialidad._pacientesUnicos.add(
          pacienteKey
        );

        doctor.pacientes.push({
          ID_PACIENTE:
            idPaciente,

          NOMBRES:
            row.NOMBRES || "",

          APELLIDOS:
            row.APELLIDOS || "",

          NOMBRE_COMPLETO:
            row.NOMBRE_COMPLETO ||
            "Paciente sin nombre",

          CORREO_ELECTRONICO:
            row.CORREO_PACIENTE || "",

          TELEFONO:
            row.TELEFONO_PACIENTE || "",

          NUMERO_DOCUMENTO_IDENTIDAD:
            row.IDENTIDAD_PACIENTE || "",

          ESTADO:
            row.ESTADO_PACIENTE ||
            "ACTIVO",

          ID_ESPECIALIDAD_CLASIFICACION:
            idEspecialidad,

          NOMBRE_ESPECIALIDAD_CLASIFICACION:
            row.NOMBRE_ESPECIALIDAD ||
            "",

          ESPECIALIDADES_DOCTOR:
            row.ESPECIALIDADES_DOCTOR ||
            row.NOMBRE_ESPECIALIDAD ||
            "",

          ESPECIALIDAD_CITA_DETERMINADA:
            Number(
              row.TOTAL_ESPECIALIDADES_DOCTOR || 1
            ) === 1
        });
      }
    }

    /*
      Convertir los mapas a un arreglo que pueda enviarse
      como JSON.
    */
    const especialidades = Array.from(
      especialidadesMap.values()
    ).map((especialidad) => {
      /*
        Ordenar médicos alfabéticamente.
      */
      especialidad.medicos.sort(
        (doctorA, doctorB) =>
          String(
            doctorA.NOMBRE_DOCTOR
          ).localeCompare(
            String(
              doctorB.NOMBRE_DOCTOR
            ),
            "es",
            {
              sensitivity: "base"
            }
          )
      );

      /*
        Ordenar pacientes por apellido y después por nombre.
      */
      especialidad.medicos.forEach(
        (doctor) => {
          doctor.pacientes.sort(
            (pacienteA, pacienteB) => {
              const comparacionApellidos =
                String(
                  pacienteA.APELLIDOS
                ).localeCompare(
                  String(
                    pacienteB.APELLIDOS
                  ),
                  "es",
                  {
                    sensitivity: "base"
                  }
                );

              if (
                comparacionApellidos !== 0
              ) {
                return comparacionApellidos;
              }

              return String(
                pacienteA.NOMBRES
              ).localeCompare(
                String(
                  pacienteB.NOMBRES
                ),
                "es",
                {
                  sensitivity: "base"
                }
              );
            }
          );

          doctor.CANTIDAD_PACIENTES =
            doctor.pacientes.length;

          delete doctor._pacientesMap;
        }
      );

      especialidad.CANTIDAD_MEDICOS =
        especialidad.medicos.length;

      especialidad.CANTIDAD_PACIENTES =
        especialidad
          ._pacientesUnicos
          .size;

      delete especialidad._medicosMap;
      delete especialidad._pacientesUnicos;

      return especialidad;
    });

    /*
      CLASIFICACIÓN DE PACIENTES SIN DUPLICADOS:
      tbl_citas no guarda ID_ESPECIALIDAD. Cuando un médico tiene
      varias especialidades, se conserva el médico en todas ellas,
      pero sus pacientes se muestran una sola vez en la especialidad
      de referencia (la de menor ID). Esto evita combinar y repetir
      la misma información en varias tarjetas.
    */
    const referenciaPorDoctor = new Map();
    const totalEspecialidadesPorDoctor = new Map();

    especialidades.forEach((especialidad) => {
      especialidad.medicos.forEach((doctor) => {
        const doctorKey = String(doctor.ID_DOCTOR);
        const referenciaActual = referenciaPorDoctor.get(doctorKey);

        totalEspecialidadesPorDoctor.set(
          doctorKey,
          (totalEspecialidadesPorDoctor.get(doctorKey) || 0) + 1
        );

        if (
          !referenciaActual ||
          Number(especialidad.ID_ESPECIALIDAD) <
            Number(referenciaActual.ID_ESPECIALIDAD)
        ) {
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
        const totalEspecialidades =
          totalEspecialidadesPorDoctor.get(doctorKey) || 1;

        doctor.TOTAL_ESPECIALIDADES_DOCTOR = totalEspecialidades;
        doctor.ID_ESPECIALIDAD_REFERENCIA =
          referencia?.ID_ESPECIALIDAD || especialidad.ID_ESPECIALIDAD;
        doctor.NOMBRE_ESPECIALIDAD_REFERENCIA =
          referencia?.NOMBRE_ESPECIALIDAD ||
          especialidad.NOMBRE_ESPECIALIDAD;
        doctor.ES_ESPECIALIDAD_REFERENCIA =
          Number(especialidad.ID_ESPECIALIDAD) ===
          Number(doctor.ID_ESPECIALIDAD_REFERENCIA);
        doctor.PACIENTES_EN_ESPECIALIDAD_REFERENCIA =
          totalEspecialidades > 1 &&
          !doctor.ES_ESPECIALIDAD_REFERENCIA;

        if (doctor.PACIENTES_EN_ESPECIALIDAD_REFERENCIA) {
          doctor.pacientes = [];
          doctor.CANTIDAD_PACIENTES = 0;
          return;
        }

        doctor.pacientes = doctor.pacientes.map(
          (paciente) => ({
            ...paciente,

            ID_ESPECIALIDAD_CLASIFICACION:
              especialidad.ID_ESPECIALIDAD,

            NOMBRE_ESPECIALIDAD_CLASIFICACION:
              especialidad.NOMBRE_ESPECIALIDAD,

            ESPECIALIDADES_DOCTOR:
              doctor.ESPECIALIDADES_DOCTOR ||
              especialidad.NOMBRE_ESPECIALIDAD,

            ESPECIALIDAD_CITA_DETERMINADA:
              totalEspecialidades === 1,

            TIPO_CLASIFICACION_ESPECIALIDAD:
              totalEspecialidades === 1
                ? "ESPECIALIDAD_UNICA_DEL_MEDICO"
                : "REFERENCIA_TECNICA"
          })
        );

        doctor.pacientes.forEach((paciente) => {
          pacientesEspecialidad.add(String(paciente.ID_PACIENTE));
        });
      });

      especialidad.CANTIDAD_PACIENTES = pacientesEspecialidad.size;
    });

    /*
      Calcular estadísticas generales sin duplicar médicos
      ni pacientes.
    */
    const doctoresUnicos =
      new Set();

    const pacientesUnicos =
      new Set();

    especialidades.forEach(
      (especialidad) => {
        especialidad.medicos.forEach(
          (doctor) => {
            doctoresUnicos.add(
              String(
                doctor.ID_DOCTOR
              )
            );

            doctor.pacientes.forEach(
              (paciente) => {
                pacientesUnicos.add(
                  String(
                    paciente.ID_PACIENTE
                  )
                );
              }
            );
          }
        );
      }
    );

    console.log(
      "👨‍⚕️ Médicos enviados:",
      doctoresUnicos.size
    );

    console.log(
      "👥 Pacientes enviados:",
      pacientesUnicos.size
    );

    res.json({
      success: true,

      version:
        "ESPECIALIDADES-V5",

      baseDatos,

      especialidades,

      resumen: {
        totalEspecialidades:
          especialidades.length,

        especialidadesActivas:
          especialidades.filter(
            (especialidad) =>
              especialidad.ESTADO ===
              "ACTIVA"
          ).length,

        totalDoctores:
          doctoresUnicos.size,

        totalPacientes:
          pacientesUnicos.size
      }
    });
  } catch (error) {
    console.error(
      "❌ Error GET /especialidades/api/datos:",
      error
    );

    await registrarErrorBitacora({
      req,
      accion:
        "ERROR_CONSULTA_ESPECIALIDADES",
      error
    });

    res.status(500).json({
      success: false,
      version:
        "ESPECIALIDADES-V5",
      especialidades: [],
      message:
        "Error al consultar las especialidades, médicos y pacientes.",
      error:
        process.env.NODE_ENV ===
        "development"
          ? error.message
          : undefined
    });
  }
});

/* ============================================================
   GET /especialidades/excel
   DESCARGAR ESPECIALIDADES, MÉDICOS Y PACIENTES
============================================================ */

router.get("/excel", async (req, res) => {
  try {
    const condiciones = [];
    const parametros = [];

    const terminosEspecialidad =
      obtenerTerminosBusqueda(
        req.query.especialidad
      );

    const terminosDoctor =
      obtenerTerminosBusqueda(
        req.query.doctor
      );

    const estado = String(
      req.query.estado || ""
    )
      .trim()
      .toUpperCase();

    terminosEspecialidad.forEach(
      (termino) => {
        condiciones.push(`
          LOWER(
            CONCAT_WS(
              ' ',
              e.NOMBRE_ESPECIALIDAD,
              COALESCE(e.DESCRIPCION, '')
            )
          ) LIKE ?
        `);

        parametros.push(
          `%${termino}%`
        );
      }
    );

    terminosDoctor.forEach(
      (termino) => {
        condiciones.push(`
          LOWER(
            CONCAT_WS(
              ' ',
              COALESCE(de.ID_DOCTOR, ''),
              COALESCE(u.NOMBRE_USUARIO, ''),
              COALESCE(u.CORREO_ELECTRONICO, ''),
              COALESCE(u.TELEFONO_PROFESIONAL, '')
            )
          ) LIKE ?
        `);

        parametros.push(
          `%${termino}%`
        );
      }
    );

    if (
      [
        "ACTIVA",
        "INACTIVA"
      ].includes(estado)
    ) {
      condiciones.push(
        "e.ESTADO = ?"
      );

      parametros.push(estado);
    }

    const whereSql = condiciones.length
      ? `WHERE ${condiciones.join(" AND ")}`
      : "";

    const [rows] = await pool.query(
      `
        SELECT
          e.ID_ESPECIALIDAD,
          e.NOMBRE_ESPECIALIDAD,
          e.ESTADO AS ESTADO_ESPECIALIDAD,
          de.ID_DOCTOR,
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
            ''
          ) AS ESTADO_DOCTOR,
          COALESCE(
            de_total.TOTAL_ESPECIALIDADES_DOCTOR,
            0
          ) AS TOTAL_ESPECIALIDADES_DOCTOR,
          COALESCE(
            de_total.ESPECIALIDADES_DOCTOR,
            e.NOMBRE_ESPECIALIDAD
          ) AS ESPECIALIDADES_DOCTOR,
          p.ID_PACIENTE,
          TRIM(
            CONCAT(
              COALESCE(p.NOMBRES, ''),
              ' ',
              COALESCE(p.APELLIDOS, '')
            )
          ) AS NOMBRE_PACIENTE,
          COALESCE(
            p.NUMERO_DOCUMENTO_IDENTIDAD,
            ''
          ) AS IDENTIDAD_PACIENTE,
          COALESCE(
            p.CORREO_ELECTRONICO,
            ''
          ) AS CORREO_PACIENTE,
          COALESCE(
            p.TELEFONO,
            ''
          ) AS TELEFONO_PACIENTE
        FROM tbl_especialidade e
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
          INNER JOIN tbl_especialidade e_resumen
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
        ${whereSql}
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
      `,
      parametros
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({
        success: false,
        message:
          "No hay información de especialidades que coincida con los filtros seleccionados."
      });
    }

    const referenciaExcel = new Map();

    rows.forEach((row) => {
      if (!row.ID_DOCTOR) return;

      const key = String(row.ID_DOCTOR);
      const actual = referenciaExcel.get(key);

      if (
        !actual ||
        Number(row.ID_ESPECIALIDAD) < Number(actual.ID_ESPECIALIDAD)
      ) {
        referenciaExcel.set(key, {
          ID_ESPECIALIDAD: row.ID_ESPECIALIDAD,
          NOMBRE_ESPECIALIDAD: row.NOMBRE_ESPECIALIDAD
        });
      }
    });

    const filasExcel = [];
    const secundariosAgregados = new Set();

    rows.forEach((row) => {
      if (!row.ID_DOCTOR) {
        filasExcel.push(row);
        return;
      }

      const referencia = referenciaExcel.get(String(row.ID_DOCTOR));
      const esReferencia =
        Number(row.ID_ESPECIALIDAD) ===
        Number(referencia?.ID_ESPECIALIDAD);

      if (esReferencia) {
        filasExcel.push({
          ...row,
          ES_ESPECIALIDAD_REFERENCIA: true,
          NOMBRE_ESPECIALIDAD_REFERENCIA:
            referencia?.NOMBRE_ESPECIALIDAD || row.NOMBRE_ESPECIALIDAD
        });
        return;
      }

      const keySecundario =
        `${row.ID_ESPECIALIDAD}|${row.ID_DOCTOR}`;

      if (secundariosAgregados.has(keySecundario)) {
        return;
      }

      secundariosAgregados.add(keySecundario);

      filasExcel.push({
        ...row,
        ID_PACIENTE: null,
        NOMBRE_PACIENTE: "",
        IDENTIDAD_PACIENTE: "",
        CORREO_PACIENTE: "",
        TELEFONO_PACIENTE: "",
        ES_ESPECIALIDAD_REFERENCIA: false,
        NOMBRE_ESPECIALIDAD_REFERENCIA:
          referencia?.NOMBRE_ESPECIALIDAD || ""
      });
    });

    /*
      Preparar un resumen por especialidad para presentar el
      archivo en dos hojas: Resumen y Directorio.
    */
    const resumenMap = new Map();
    const doctoresGlobales = new Set();
    const pacientesGlobales = new Set();
    const doctoresMultiples = new Set();

    filasExcel.forEach((row) => {
      const idEspecialidad = Number(
        row.ID_ESPECIALIDAD || 0
      );

      const keyEspecialidad =
        String(idEspecialidad);

      if (!resumenMap.has(keyEspecialidad)) {
        resumenMap.set(keyEspecialidad, {
          ID_ESPECIALIDAD:
            idEspecialidad,
          NOMBRE_ESPECIALIDAD:
            row.NOMBRE_ESPECIALIDAD ||
            "Especialidad sin nombre",
          ESTADO_ESPECIALIDAD:
            row.ESTADO_ESPECIALIDAD ||
            "",
          doctores:
            new Set(),
          pacientes:
            new Set()
        });
      }

      const resumen =
        resumenMap.get(keyEspecialidad);

      if (row.ID_DOCTOR) {
        const doctorKey =
          String(row.ID_DOCTOR);

        resumen.doctores.add(
          doctorKey
        );

        doctoresGlobales.add(
          doctorKey
        );

        if (
          Number(
            row.TOTAL_ESPECIALIDADES_DOCTOR || 0
          ) > 1
        ) {
          doctoresMultiples.add(
            doctorKey
          );
        }
      }

      if (row.ID_PACIENTE) {
        const pacienteKey =
          String(row.ID_PACIENTE);

        resumen.pacientes.add(
          pacienteKey
        );

        pacientesGlobales.add(
          pacienteKey
        );
      }
    });

    const resumenEspecialidades =
      [...resumenMap.values()]
        .sort((a, b) =>
          String(
            a.NOMBRE_ESPECIALIDAD
          ).localeCompare(
            String(
              b.NOMBRE_ESPECIALIDAD
            ),
            "es",
            {
              sensitivity:
                "base"
            }
          )
        );

    const workbook =
      new xl.Workbook({
        defaultFont: {
          name:
            "Segoe UI",
          size:
            10,
          color:
            "#253347"
        }
      });

    const hojaResumen =
      workbook.addWorksheet(
        "Resumen"
      );

    const hojaDirectorio =
      workbook.addWorksheet(
        "Directorio"
      );

    /*
      Estilos generales.
    */
    const estiloTitulo =
      workbook.createStyle({
        font: {
          bold: true,
          color: "#FFFFFF",
          size: 18
        },
        fill: {
          type: "pattern",
          patternType: "solid",
          bgColor: "#1E3C72",
          fgColor: "#1E3C72"
        },
        alignment: {
          horizontal: "center",
          vertical: "center",
          wrapText: true
        },
        border: {
          bottom: {
            style: "medium",
            color: "#3A7BD5"
          }
        }
      });

    const estiloSubtitulo =
      workbook.createStyle({
        font: {
          color: "#475569",
          italic: true,
          size: 10
        },
        fill: {
          type: "pattern",
          patternType: "solid",
          bgColor: "#EAF2FF",
          fgColor: "#EAF2FF"
        },
        alignment: {
          horizontal: "left",
          vertical: "center",
          wrapText: true
        },
        border: {
          bottom: {
            style: "thin",
            color: "#BFDBFE"
          }
        }
      });

    const estiloEtiqueta =
      workbook.createStyle({
        font: {
          bold: true,
          color: "#1E3C72",
          size: 10
        },
        fill: {
          type: "pattern",
          patternType: "solid",
          bgColor: "#F1F5F9",
          fgColor: "#F1F5F9"
        },
        alignment: {
          vertical: "center"
        },
        border: {
          left: {
            style: "thin",
            color: "#CBD5E1"
          },
          right: {
            style: "thin",
            color: "#CBD5E1"
          },
          top: {
            style: "thin",
            color: "#CBD5E1"
          },
          bottom: {
            style: "thin",
            color: "#CBD5E1"
          }
        }
      });

    const estiloValor =
      workbook.createStyle({
        font: {
          color: "#253347",
          size: 10
        },
        alignment: {
          vertical: "center",
          wrapText: true
        },
        border: {
          left: {
            style: "thin",
            color: "#CBD5E1"
          },
          right: {
            style: "thin",
            color: "#CBD5E1"
          },
          top: {
            style: "thin",
            color: "#CBD5E1"
          },
          bottom: {
            style: "thin",
            color: "#CBD5E1"
          }
        }
      });

    const crearEstiloKpi = (
      colorFondo,
      colorBorde
    ) =>
      workbook.createStyle({
        font: {
          bold: true,
          color: "#FFFFFF",
          size: 15
        },
        fill: {
          type: "pattern",
          patternType: "solid",
          bgColor:
            colorFondo,
          fgColor:
            colorFondo
        },
        alignment: {
          horizontal: "center",
          vertical: "center",
          wrapText: true
        },
        border: {
          left: {
            style: "medium",
            color:
              colorBorde
          },
          right: {
            style: "medium",
            color:
              colorBorde
          },
          top: {
            style: "medium",
            color:
              colorBorde
          },
          bottom: {
            style: "medium",
            color:
              colorBorde
          }
        }
      });

    const estiloKpiAzul =
      crearEstiloKpi(
        "#2C5AA0",
        "#1E3C72"
      );

    const estiloKpiVerde =
      crearEstiloKpi(
        "#217346",
        "#166534"
      );

    const estiloKpiMorado =
      crearEstiloKpi(
        "#6C5CE7",
        "#5145CD"
      );

    const estiloKpiNaranja =
      crearEstiloKpi(
        "#E67E22",
        "#B45309"
      );

    const estiloEncabezado =
      workbook.createStyle({
        font: {
          bold: true,
          color: "#FFFFFF",
          size: 10
        },
        fill: {
          type: "pattern",
          patternType: "solid",
          bgColor: "#2C5AA0",
          fgColor: "#2C5AA0"
        },
        alignment: {
          horizontal: "center",
          vertical: "center",
          wrapText: true
        },
        border: {
          left: {
            style: "thin",
            color: "#B8CCE4"
          },
          right: {
            style: "thin",
            color: "#B8CCE4"
          },
          top: {
            style: "thin",
            color: "#B8CCE4"
          },
          bottom: {
            style: "thin",
            color: "#B8CCE4"
          }
        }
      });

    const crearEstiloFila = (
      colorFondo
    ) =>
      workbook.createStyle({
        font: {
          color: "#253347",
          size: 9
        },
        fill: {
          type: "pattern",
          patternType: "solid",
          bgColor:
            colorFondo,
          fgColor:
            colorFondo
        },
        alignment: {
          vertical: "center",
          wrapText: true
        },
        border: {
          left: {
            style: "thin",
            color: "#D7E0EA"
          },
          right: {
            style: "thin",
            color: "#D7E0EA"
          },
          top: {
            style: "thin",
            color: "#D7E0EA"
          },
          bottom: {
            style: "thin",
            color: "#D7E0EA"
          }
        }
      });

    const estiloFilaClara =
      crearEstiloFila(
        "#FFFFFF"
      );

    const estiloFilaAlterna =
      crearEstiloFila(
        "#F0F7FF"
      );

    const estiloEstadoActivo =
      workbook.createStyle({
        font: {
          bold: true,
          color: "#166534",
          size: 9
        },
        fill: {
          type: "pattern",
          patternType: "solid",
          bgColor: "#DCFCE7",
          fgColor: "#DCFCE7"
        },
        alignment: {
          horizontal: "center",
          vertical: "center"
        },
        border: {
          left: {
            style: "thin",
            color: "#86EFAC"
          },
          right: {
            style: "thin",
            color: "#86EFAC"
          },
          top: {
            style: "thin",
            color: "#86EFAC"
          },
          bottom: {
            style: "thin",
            color: "#86EFAC"
          }
        }
      });

    const estiloEstadoInactivo =
      workbook.createStyle({
        font: {
          bold: true,
          color: "#991B1B",
          size: 9
        },
        fill: {
          type: "pattern",
          patternType: "solid",
          bgColor: "#FEE2E2",
          fgColor: "#FEE2E2"
        },
        alignment: {
          horizontal: "center",
          vertical: "center"
        },
        border: {
          left: {
            style: "thin",
            color: "#FCA5A5"
          },
          right: {
            style: "thin",
            color: "#FCA5A5"
          },
          top: {
            style: "thin",
            color: "#FCA5A5"
          },
          bottom: {
            style: "thin",
            color: "#FCA5A5"
          }
        }
      });

    const estiloClasificacion =
      workbook.createStyle({
        font: {
          bold: true,
          color: "#1E3C72",
          size: 9
        },
        fill: {
          type: "pattern",
          patternType: "solid",
          bgColor: "#EAF2FF",
          fgColor: "#EAF2FF"
        },
        alignment: {
          horizontal: "center",
          vertical: "center",
          wrapText: true
        },
        border: {
          left: {
            style: "thin",
            color: "#93C5FD"
          },
          right: {
            style: "thin",
            color: "#93C5FD"
          },
          top: {
            style: "thin",
            color: "#93C5FD"
          },
          bottom: {
            style: "thin",
            color: "#93C5FD"
          }
        }
      });

    const estiloAdvertencia =
      workbook.createStyle({
        font: {
          color: "#7C4A03",
          italic: true,
          size: 9
        },
        fill: {
          type: "pattern",
          patternType: "solid",
          bgColor: "#FFF8E1",
          fgColor: "#FFF8E1"
        },
        alignment: {
          vertical: "center",
          wrapText: true
        },
        border: {
          left: {
            style: "thin",
            color: "#F4D38A"
          },
          right: {
            style: "thin",
            color: "#F4D38A"
          },
          top: {
            style: "thin",
            color: "#F4D38A"
          },
          bottom: {
            style: "thin",
            color: "#F4D38A"
          }
        }
      });

    /*
      HOJA 1: RESUMEN
    */
    hojaResumen
      .cell(1, 1, 2, 8, true)
      .string(
        "Directorio de Especialidades Médicas\nClínicas Roca Maya"
      )
      .style(
        estiloTitulo
      );

    hojaResumen
      .cell(3, 1, 3, 8, true)
      .string(
        "Resumen ejecutivo de especialidades, médicos y pacientes clasificados. La clasificación por especialidad es exacta cuando el médico posee una sola especialidad; cuando posee varias, se utiliza una referencia técnica porque tbl_citas no almacena ID_ESPECIALIDAD."
      )
      .style(
        estiloSubtitulo
      );

    hojaResumen
      .cell(5, 1)
      .string(
        "Fecha de generación"
      )
      .style(
        estiloEtiqueta
      );

    hojaResumen
      .cell(5, 2, 5, 4, true)
      .string(
        new Date()
          .toLocaleString(
            "es-HN"
          )
      )
      .style(
        estiloValor
      );

    hojaResumen
      .cell(5, 5)
      .string(
        "Usuario"
      )
      .style(
        estiloEtiqueta
      );

    hojaResumen
      .cell(5, 6, 5, 8, true)
      .string(
        getUsuario(req)
      )
      .style(
        estiloValor
      );

    const filtrosAplicados = [
      req.query.especialidad
        ? `Especialidad: ${String(req.query.especialidad)}`
        : "",
      req.query.doctor
        ? `Médico: ${String(req.query.doctor)}`
        : "",
      estado
        ? `Estado: ${estado}`
        : ""
    ]
      .filter(Boolean)
      .join(" · ");

    hojaResumen
      .cell(6, 1)
      .string(
        "Filtros"
      )
      .style(
        estiloEtiqueta
      );

    hojaResumen
      .cell(6, 2, 6, 8, true)
      .string(
        filtrosAplicados ||
        "Sin filtros: se exportó toda la información disponible."
      )
      .style(
        estiloValor
      );

    hojaResumen
      .cell(8, 1, 9, 2, true)
      .string(
        `${resumenEspecialidades.length}\nESPECIALIDADES`
      )
      .style(
        estiloKpiAzul
      );

    hojaResumen
      .cell(8, 3, 9, 4, true)
      .string(
        `${doctoresGlobales.size}\nMÉDICOS ÚNICOS`
      )
      .style(
        estiloKpiVerde
      );

    hojaResumen
      .cell(8, 5, 9, 6, true)
      .string(
        `${pacientesGlobales.size}\nPACIENTES CLASIFICADOS`
      )
      .style(
        estiloKpiMorado
      );

    hojaResumen
      .cell(8, 7, 9, 8, true)
      .string(
        `${doctoresMultiples.size}\nMÉDICOS MULTIESPECIALIDAD`
      )
      .style(
        estiloKpiNaranja
      );

    const encabezadosResumen = [
      "ID",
      "Especialidad",
      "Estado",
      "Médicos asignados",
      "Pacientes clasificados",
      "Tipo de clasificación",
      "Observación",
      "Control"
    ];

    encabezadosResumen.forEach(
      (encabezado, index) => {
        hojaResumen
          .cell(
            11,
            index + 1
          )
          .string(
            encabezado
          )
          .style(
            estiloEncabezado
          );
      }
    );

    resumenEspecialidades.forEach(
      (
        especialidad,
        index
      ) => {
        const fila =
          index + 12;

        const estiloFila =
          index % 2 === 0
            ? estiloFilaClara
            : estiloFilaAlterna;

        const cantidadDoctores =
          especialidad.doctores.size;

        const cantidadPacientes =
          especialidad.pacientes.size;

        hojaResumen
          .cell(fila, 1)
          .number(
            especialidad.ID_ESPECIALIDAD || 0
          )
          .style(
            estiloFila
          );

        hojaResumen
          .cell(fila, 2)
          .string(
            especialidad.NOMBRE_ESPECIALIDAD
          )
          .style(
            estiloFila
          );

        hojaResumen
          .cell(fila, 3)
          .string(
            especialidad.ESTADO_ESPECIALIDAD
          )
          .style(
            especialidad.ESTADO_ESPECIALIDAD ===
              "ACTIVA"
              ? estiloEstadoActivo
              : estiloEstadoInactivo
          );

        hojaResumen
          .cell(fila, 4)
          .number(
            cantidadDoctores
          )
          .style(
            estiloFila
          );

        hojaResumen
          .cell(fila, 5)
          .number(
            cantidadPacientes
          )
          .style(
            estiloFila
          );

        hojaResumen
          .cell(fila, 6)
          .string(
            "Por médico"
          )
          .style(
            estiloClasificacion
          );

        hojaResumen
          .cell(fila, 7)
          .string(
            cantidadDoctores === 0
              ? "Especialidad sin médicos asignados."
              : cantidadPacientes === 0
                ? "Sin pacientes clasificados en esta especialidad."
                : "Pacientes únicos, sin duplicarlos entre especialidades."
          )
          .style(
            estiloFila
          );

        hojaResumen
          .cell(fila, 8)
          .string(
            "Revisado"
          )
          .style(
            estiloFila
          );
      }
    );

    [
      12,
      28,
      16,
      20,
      22,
      24,
      42,
      16
    ].forEach(
      (
        ancho,
        index
      ) => {
        hojaResumen
          .column(
            index + 1
          )
          .setWidth(
            ancho
          );
      }
    );

    hojaResumen
      .row(1)
      .setHeight(
        28
      );

    hojaResumen
      .row(2)
      .setHeight(
        28
      );

    hojaResumen
      .row(3)
      .setHeight(
        52
      );

    hojaResumen
      .row(11)
      .setHeight(
        36
      );

    hojaResumen
      .row(11)
      .freeze();

    /*
      HOJA 2: DIRECTORIO DETALLADO
    */
    const totalColumnasDirectorio =
      14;

    hojaDirectorio
      .cell(
        1,
        1,
        2,
        totalColumnasDirectorio,
        true
      )
      .string(
        "Directorio detallado de médicos y pacientes"
      )
      .style(
        estiloTitulo
      );

    hojaDirectorio
      .cell(
        3,
        1,
        3,
        totalColumnasDirectorio,
        true
      )
      .string(
        "La columna 'Especialidades del médico (texto)' muestra los nombres de todas las especialidades asignadas al profesional. La columna 'Especialidad del paciente con este médico' muestra en texto la especialidad bajo la cual el paciente aparece clasificado en este directorio."
      )
      .style(
        estiloSubtitulo
      );

    const encabezadosDirectorio = [
      "Especialidad",
      "Estado",
      "Médico #",
      "Nombre del médico",
      "Correo del médico",
      "Teléfono del médico",
      "Especialidades del médico (texto)",
      "Paciente #",
      "Paciente",
      "Identidad",
      "Correo del paciente",
      "Teléfono del paciente",
      "Especialidad del paciente con este médico",
      "Observación de clasificación"
    ];

    encabezadosDirectorio.forEach(
      (
        encabezado,
        index
      ) => {
        hojaDirectorio
          .cell(
            5,
            index + 1
          )
          .string(
            encabezado
          )
          .style(
            estiloEncabezado
          );
      }
    );

    filasExcel.forEach(
      (
        row,
        index
      ) => {
        const fila =
          index + 6;

        const estiloFila =
          index % 2 === 0
            ? estiloFilaClara
            : estiloFilaAlterna;

        const idDoctor =
          Number(
            row.ID_DOCTOR || 0
          );

        const idPaciente =
          Number(
            row.ID_PACIENTE || 0
          );

        const totalEspecialidadesDoctor =
          Number(
            row.TOTAL_ESPECIALIDADES_DOCTOR || 0
          );

        /*
         * Especialidad a la que va el paciente.
         * No modifica la base de datos. Primero intenta utilizar
         * un valor explícito que en el futuro pueda enviar el módulo
         * de Citas Médicas; si no existe, conserva la clasificación
         * actual del directorio como respaldo.
         */
        const especialidadesDoctorTexto =
          String(
            row.ESPECIALIDADES_DOCTOR ||
            row.NOMBRE_ESPECIALIDAD ||
            "Sin especialidad registrada"
          )
            .split("|")
            .map((nombre) => nombre.trim())
            .filter(Boolean)
            .join(", ");

        /*
         * Especialidad del paciente con este médico.
         * Se escribe como texto. Para las filas que contienen un
         * paciente, corresponde a la especialidad de la tarjeta/fila
         * donde fue clasificado dentro del directorio.
         */
        const especialidadPaciente =
          idPaciente > 0
            ? String(
                row.NOMBRE_ESPECIALIDAD ||
                row.NOMBRE_ESPECIALIDAD_REFERENCIA ||
                "Especialidad no determinada"
              )
            : "";

        const criterioClasificacion =
          !idDoctor
            ? "Especialidad sin médico asignado"
            : row.ES_ESPECIALIDAD_REFERENCIA === false
              ? `Pacientes disponibles en ${row.NOMBRE_ESPECIALIDAD_REFERENCIA || "la especialidad de referencia"}`
              : idPaciente <= 0
                ? "Médico sin pacientes asociados"
                : totalEspecialidadesDoctor > 1
                  ? "Clasificación visual del directorio; la cita no guarda especialidad"
                  : "Especialidad única del médico";

        hojaDirectorio
          .cell(fila, 1)
          .string(
            row.NOMBRE_ESPECIALIDAD || ""
          )
          .style(
            estiloFila
          );

        hojaDirectorio
          .cell(fila, 2)
          .string(
            row.ESTADO_ESPECIALIDAD || ""
          )
          .style(
            row.ESTADO_ESPECIALIDAD ===
              "ACTIVA"
              ? estiloEstadoActivo
              : estiloEstadoInactivo
          );

        if (idDoctor > 0) {
          hojaDirectorio
            .cell(fila, 3)
            .number(
              idDoctor
            )
            .style(
              estiloFila
            );
        } else {
          hojaDirectorio
            .cell(fila, 3)
            .string("")
            .style(
              estiloFila
            );
        }

        hojaDirectorio
          .cell(fila, 4)
          .string(
            row.NOMBRE_DOCTOR ||
            "Sin médico asignado"
          )
          .style(
            estiloFila
          );

        hojaDirectorio
          .cell(fila, 5)
          .string(
            row.CORREO_DOCTOR || ""
          )
          .style(
            estiloFila
          );

        hojaDirectorio
          .cell(fila, 6)
          .string(
            row.TELEFONO_DOCTOR || ""
          )
          .style(
            estiloFila
          );

        hojaDirectorio
          .cell(fila, 7)
          .string(
            especialidadesDoctorTexto
          )
          .style(
            estiloFila
          );

        if (idPaciente > 0) {
          hojaDirectorio
            .cell(fila, 8)
            .number(
              idPaciente
            )
            .style(
              estiloFila
            );
        } else {
          hojaDirectorio
            .cell(fila, 8)
            .string("")
            .style(
              estiloFila
            );
        }

        hojaDirectorio
          .cell(fila, 9)
          .string(
            row.NOMBRE_PACIENTE || ""
          )
          .style(
            estiloFila
          );

        hojaDirectorio
          .cell(fila, 10)
          .string(
            row.IDENTIDAD_PACIENTE || ""
          )
          .style(
            estiloFila
          );

        hojaDirectorio
          .cell(fila, 11)
          .string(
            row.CORREO_PACIENTE || ""
          )
          .style(
            estiloFila
          );

        hojaDirectorio
          .cell(fila, 12)
          .string(
            row.TELEFONO_PACIENTE || ""
          )
          .style(
            estiloFila
          );

        hojaDirectorio
          .cell(fila, 13)
          .string(
            especialidadPaciente
          )
          .style(
            idPaciente > 0
              ? estiloClasificacion
              : estiloFila
          );

        hojaDirectorio
          .cell(fila, 14)
          .string(
            criterioClasificacion
          )
          .style(
            totalEspecialidadesDoctor > 1
              ? estiloAdvertencia
              : estiloFila
          );
      }
    );

    [
      25,
      14,
      12,
      28,
      30,
      18,
      34,
      12,
      30,
      20,
      30,
      19,
      25,
      45
    ].forEach(
      (
        ancho,
        index
      ) => {
        hojaDirectorio
          .column(
            index + 1
          )
          .setWidth(
            ancho
          );
      }
    );

    hojaDirectorio
      .row(1)
      .setHeight(
        28
      );

    hojaDirectorio
      .row(2)
      .setHeight(
        28
      );

    hojaDirectorio
      .row(3)
      .setHeight(
        54
      );

    hojaDirectorio
      .row(5)
      .setHeight(
        38
      );

    hojaDirectorio
      .row(5)
      .freeze();

    const fecha =
      new Date()
        .toISOString()
        .split("T")[0];

    const nombreArchivo =
      `Especialidades_Medicas_${fecha}.xlsx`;

    await registrarEventoBitacora({
      usuario: getUsuario(req),
      accion:
        "EXPORTAR_EXCEL_ESPECIALIDADES",
      descripcion:
        `Exportadas ${rows.length} filas del directorio de especialidades médicas`,
      modulo: "ESPECIALIDADES",
      tabla: "tbl_especialidade",
      estado: "EXITO",
      req
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${nombreArchivo}"`
    );

    workbook.write(
      nombreArchivo,
      res
    );
  } catch (error) {
    console.error(
      "GET /especialidades/excel error:",
      error
    );

    await registrarErrorBitacora({
      req,
      accion:
        "ERROR_EXPORTAR_EXCEL_ESPECIALIDADES",
      error
    });

    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message:
          "No se pudo generar el archivo Excel de especialidades.",
        error:
          process.env.NODE_ENV ===
          "development"
            ? error.message
            : undefined
      });
    }
  }
});

/* ============================================================
   POST /especialidades/nueva
   CREAR ESPECIALIDAD
============================================================ */

router.post("/nueva", async (req, res) => {
  const usuario =
    getUsuario(req);

  try {
    const nombre =
      normalizarTexto(
        req.body.nombre
      );

    const descripcion =
      normalizarTexto(
        req.body.descripcion
      );

    const color =
      normalizarColor(
        req.body.color
      );

    const icono =
      normalizarIcono(
        req.body.icono
      );

    if (!nombre) {
      return res.status(400).json({
        success: false,
        message:
          "El nombre de la especialidad es obligatorio."
      });
    }

    if (nombre.length > 100) {
      return res.status(400).json({
        success: false,
        message:
          "El nombre no puede superar los 100 caracteres."
      });
    }

    if (descripcion.length > 255) {
      return res.status(400).json({
        success: false,
        message:
          "La descripción no puede superar los 255 caracteres."
      });
    }

    const [existente] =
      await pool.query(
        `
          SELECT ID_ESPECIALIDAD
          FROM tbl_especialidade
          WHERE UPPER(
            TRIM(NOMBRE_ESPECIALIDAD)
          ) = UPPER(TRIM(?))
          LIMIT 1
        `,
        [nombre]
      );

    if (existente.length > 0) {
      return res.status(409).json({
        success: false,
        message:
          `Ya existe una especialidad con el nombre "${nombre}".`
      });
    }

    const [result] =
      await pool.query(
        `
          INSERT INTO tbl_especialidade (
            NOMBRE_ESPECIALIDAD,
            DESCRIPCION,
            COLOR_HEXADECIMAL,
            ICONO,
            USUARIO_CREACION
          )
          VALUES (?, ?, ?, ?, ?)
        `,
        [
          nombre,
          descripcion || null,
          color,
          icono,
          usuario
        ]
      );

    await registrarEventoBitacora({
      usuario,
      accion:
        "CREACION_ESPECIALIDAD",
      descripcion:
        `Creada especialidad ID ${result.insertId}: ${nombre}`,
      modulo:
        "ESPECIALIDADES",
      idRegistro:
        result.insertId,
      tabla:
        "tbl_especialidade",
      estado:
        "EXITO",
      req
    });

    res.status(201).json({
      success: true,
      message:
        "Especialidad creada correctamente.",
      idEspecialidad:
        result.insertId
    });
  } catch (error) {
    console.error(
      "POST /especialidades/nueva error:",
      error
    );

    if (
      error.code ===
      "ER_DUP_ENTRY"
    ) {
      return res.status(409).json({
        success: false,
        message:
          "Ya existe una especialidad con ese nombre."
      });
    }

    await registrarErrorBitacora({
      req,
      accion:
        "ERROR_CREACION_ESPECIALIDAD",
      error
    });

    res.status(500).json({
      success: false,
      message:
        "Error interno creando la especialidad."
    });
  }
});

/* ============================================================
   PUT /especialidades/actualizar/:id
   ACTUALIZAR ESPECIALIDAD
============================================================ */

router.put(
  "/actualizar/:id",
  async (req, res) => {
    const usuario =
      getUsuario(req);

    const id =
      convertirId(req.params.id);

    try {
      if (!id) {
        return res.status(400).json({
          success: false,
          message:
            "El ID de la especialidad no es válido."
        });
      }

      const nombre =
        normalizarTexto(
          req.body.nombre
        );

      const descripcion =
        normalizarTexto(
          req.body.descripcion
        );

      const color =
        normalizarColor(
          req.body.color
        );

      const icono =
        normalizarIcono(
          req.body.icono
        );

      const estado =
        normalizarEstado(
          req.body.estado
        );

      if (!nombre) {
        return res.status(400).json({
          success: false,
          message:
            "El nombre de la especialidad es obligatorio."
        });
      }

      if (nombre.length > 100) {
        return res.status(400).json({
          success: false,
          message:
            "El nombre no puede superar los 100 caracteres."
        });
      }

      if (descripcion.length > 255) {
        return res.status(400).json({
          success: false,
          message:
            "La descripción no puede superar los 255 caracteres."
        });
      }

      const [duplicada] =
        await pool.query(
          `
            SELECT ID_ESPECIALIDAD
            FROM tbl_especialidade
            WHERE UPPER(
              TRIM(NOMBRE_ESPECIALIDAD)
            ) = UPPER(TRIM(?))
              AND ID_ESPECIALIDAD <> ?
            LIMIT 1
          `,
          [
            nombre,
            id
          ]
        );

      if (duplicada.length > 0) {
        return res.status(409).json({
          success: false,
          message:
            `Ya existe otra especialidad con el nombre "${nombre}".`
        });
      }

      const [result] =
        await pool.query(
          `
            UPDATE tbl_especialidade
            SET
              NOMBRE_ESPECIALIDAD = ?,
              DESCRIPCION = ?,
              COLOR_HEXADECIMAL = ?,
              ICONO = ?,
              ESTADO = ?,
              USUARIO_MODIFICACION = ?
            WHERE ID_ESPECIALIDAD = ?
          `,
          [
            nombre,
            descripcion || null,
            color,
            icono,
            estado,
            usuario,
            id
          ]
        );

      if (
        result.affectedRows === 0
      ) {
        return res.status(404).json({
          success: false,
          message:
            "Especialidad no encontrada."
        });
      }

      await registrarEventoBitacora({
        usuario,
        accion:
          "ACTUALIZACION_ESPECIALIDAD",
        descripcion:
          `Actualizada especialidad ID ${id}: ${nombre}`,
        modulo:
          "ESPECIALIDADES",
        idRegistro:
          id,
        tabla:
          "tbl_especialidade",
        estado:
          "EXITO",
        req
      });

      res.json({
        success: true,
        message:
          "Especialidad actualizada correctamente."
      });
    } catch (error) {
      console.error(
        "PUT /especialidades/actualizar/:id error:",
        error
      );

      if (
        error.code ===
        "ER_DUP_ENTRY"
      ) {
        return res.status(409).json({
          success: false,
          message:
            "Ya existe otra especialidad con ese nombre."
        });
      }

      await registrarErrorBitacora({
        req,
        accion:
          "ERROR_ACTUALIZACION_ESPECIALIDAD",
        error,
        idRegistro: id
      });

      res.status(500).json({
        success: false,
        message:
          "Error interno actualizando la especialidad."
      });
    }
  }
);

/* ============================================================
   POST /especialidades/cambiar-estado
============================================================ */

router.post(
  "/cambiar-estado",
  async (req, res) => {
    const usuario =
      getUsuario(req);

    try {
      const id =
        convertirId(
          req.body.idEspecialidad
        );

      const nuevoEstado =
        String(
          req.body.nuevoEstado ?? ""
        )
          .trim()
          .toUpperCase();

      if (!id) {
        return res.status(400).json({
          success: false,
          message:
            "El ID de la especialidad no es válido."
        });
      }

      if (
        ![
          "ACTIVA",
          "INACTIVA"
        ].includes(nuevoEstado)
      ) {
        return res.status(400).json({
          success: false,
          message:
            "El estado indicado no es válido."
        });
      }

      const [especialidadRows] =
        await pool.query(
          `
            SELECT
              NOMBRE_ESPECIALIDAD
            FROM tbl_especialidade
            WHERE ID_ESPECIALIDAD = ?
            LIMIT 1
          `,
          [id]
        );

      if (
        especialidadRows.length === 0
      ) {
        return res.status(404).json({
          success: false,
          message:
            "Especialidad no encontrada."
        });
      }

      const [result] =
        await pool.query(
          `
            UPDATE tbl_especialidade
            SET
              ESTADO = ?,
              USUARIO_MODIFICACION = ?
            WHERE ID_ESPECIALIDAD = ?
          `,
          [
            nuevoEstado,
            usuario,
            id
          ]
        );

      if (
        result.affectedRows === 0
      ) {
        return res.status(404).json({
          success: false,
          message:
            "Especialidad no encontrada."
        });
      }

      await registrarEventoBitacora({
        usuario,
        accion:
          "CAMBIO_ESTADO_ESPECIALIDAD",
        descripcion:
          `Especialidad ID ${id} cambió a ${nuevoEstado}`,
        modulo:
          "ESPECIALIDADES",
        idRegistro:
          id,
        tabla:
          "tbl_especialidade",
        estado:
          "EXITO",
        req
      });

      res.json({
        success: true,
        message:
          `Especialidad cambiada a ${nuevoEstado.toLowerCase()} correctamente.`
      });
    } catch (error) {
      console.error(
        "POST /especialidades/cambiar-estado error:",
        error
      );

      await registrarErrorBitacora({
        req,
        accion:
          "ERROR_CAMBIO_ESTADO_ESPECIALIDAD",
        error,
        idRegistro:
          convertirId(
            req.body.idEspecialidad
          )
      });

      res.status(500).json({
        success: false,
        message:
          "Error interno al cambiar el estado de la especialidad."
      });
    }
  }
);

/* ============================================================
   DELETE /especialidades/eliminar/:id

   Si tiene médicos relacionados, no se elimina.
   Se recomienda inactivarla.
============================================================ */

router.delete(
  "/eliminar/:id",
  async (req, res) => {
    const usuario =
      getUsuario(req);

    const id =
      convertirId(req.params.id);

    try {
      if (!id) {
        return res.status(400).json({
          success: false,
          message:
            "El ID de la especialidad no es válido."
        });
      }

      const [especialidadRows] =
        await pool.query(
          `
            SELECT
              ID_ESPECIALIDAD,
              NOMBRE_ESPECIALIDAD
            FROM tbl_especialidade
            WHERE ID_ESPECIALIDAD = ?
            LIMIT 1
          `,
          [id]
        );

      if (
        especialidadRows.length === 0
      ) {
        return res.status(404).json({
          success: false,
          message:
            "Especialidad no encontrada."
        });
      }

      const especialidad =
        especialidadRows[0];

      const [relacionesRows] =
        await pool.query(
          `
            SELECT
              COUNT(*) AS TOTAL
            FROM tbl_doctor_especialidad
            WHERE ID_ESPECIALIDAD = ?
          `,
          [id]
        );

      const totalDoctores =
        Number(
          relacionesRows[0]?.TOTAL || 0
        );

      if (totalDoctores > 0) {
        return res.status(409).json({
          success: false,
          code:
            "ESPECIALIDAD_CON_DOCTORES",
          message:
            `No se puede eliminar "${especialidad.NOMBRE_ESPECIALIDAD}" porque tiene ${totalDoctores} médico${totalDoctores === 1 ? "" : "s"} asignado${totalDoctores === 1 ? "" : "s"}. Puede inactivarla en su lugar.`
        });
      }

      const [result] =
        await pool.query(
          `
            DELETE FROM tbl_especialidade
            WHERE ID_ESPECIALIDAD = ?
          `,
          [id]
        );

      if (
        result.affectedRows === 0
      ) {
        return res.status(404).json({
          success: false,
          message:
            "Especialidad no encontrada."
        });
      }

      await registrarEventoBitacora({
        usuario,
        accion:
          "ELIMINACION_ESPECIALIDAD",
        descripcion:
          `Eliminada especialidad ID ${id}: ${especialidad.NOMBRE_ESPECIALIDAD}`,
        modulo:
          "ESPECIALIDADES",
        idRegistro:
          id,
        tabla:
          "tbl_especialidade",
        estado:
          "EXITO",
        req
      });

      res.json({
        success: true,
        message:
          "Especialidad eliminada correctamente."
      });
    } catch (error) {
      console.error(
        "DELETE /especialidades/eliminar/:id error:",
        error
      );

      if (
        error.code ===
          "ER_ROW_IS_REFERENCED_2" ||
        error.code ===
          "ER_ROW_IS_REFERENCED"
      ) {
        return res.status(409).json({
          success: false,
          message:
            "No se puede eliminar la especialidad porque tiene información relacionada. Puede inactivarla."
        });
      }

      await registrarErrorBitacora({
        req,
        accion:
          "ERROR_ELIMINACION_ESPECIALIDAD",
        error,
        idRegistro: id
      });

      res.status(500).json({
        success: false,
        message:
          "Error interno eliminando la especialidad."
      });
    }
  }
);

module.exports = router;