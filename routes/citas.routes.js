const express = require("express");
const fs = require("fs/promises");
const path = require("path");

const router = express.Router();
const pool = require("../database/db");
const {
  registrarBitacora,
} = require("../services/bitacora.service");

const ARCHIVO_ESPECIALIDADES_CITAS = path.join(
  __dirname,
  "../data/citas-especialidades.json"
);

const COLUMNAS_ESPECIALIDAD_CANDIDATAS = [
  "ID_ESPECIALIDAD",
  "ID_ESPECIALIDAD_CITA",
  "ESPECIALIDAD_ID",
];

console.log("✅ Router de Citas Médicas V9 cargado");

let columnaEspecialidadCitaCache;
let colaArchivoEspecialidades = Promise.resolve();
const clavesCreacionCitaEnProceso = new Set();

router.use(express.json());

router.get("/version", (req, res) => {
  res.json({
    success: true,
    router: "CITAS-MEDICAS-V9",
    especialidadesDoctor: true,
    consultaMedicaExpress: true
  });
});

function getUsuario(req) {
  return (
    req.user?.USUARIO ||
    req.user?.NOMBRE_USUARIO ||
    "SISTEMA"
  );
}

function getIdUsuario(req) {
  const id = Number(req.user?.ID_USUARIO || 0);
  return Number.isInteger(id) && id > 0 ? id : 1;
}

function convertirId(valor) {
  const id = Number(valor);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function formatearFechaMySQL(fecha) {
  const pad = (n) => String(n).padStart(2, "0");

  return `${fecha.getFullYear()}-${pad(
    fecha.getMonth() + 1
  )}-${pad(fecha.getDate())} ${pad(
    fecha.getHours()
  )}:${pad(fecha.getMinutes())}:${pad(
    fecha.getSeconds()
  )}`;
}

async function registrarEventoBitacora(datos) {
  try {
    await registrarBitacora(datos);
  } catch (error) {
    console.error(
      "Error registrando evento de citas en bitácora:",
      error
    );
  }
}

async function obtenerColumnaEspecialidadCita() {
  if (columnaEspecialidadCitaCache !== undefined) {
    return columnaEspecialidadCitaCache;
  }

  try {
    const [columnas] = await pool.query(
      "SHOW COLUMNS FROM tbl_citas"
    );

    const nombres = new Set(
      columnas.map((columna) =>
        String(columna.Field || "").toUpperCase()
      )
    );

    columnaEspecialidadCitaCache =
      COLUMNAS_ESPECIALIDAD_CANDIDATAS.find((nombre) =>
        nombres.has(nombre)
      ) || null;
  } catch (error) {
    console.warn(
      "No se pudo verificar si tbl_citas tiene una columna de especialidad:",
      error.message
    );

    columnaEspecialidadCitaCache = null;
  }

  return columnaEspecialidadCitaCache;
}

async function leerMapaEspecialidadesSinCola() {
  try {
    const contenido = await fs.readFile(
      ARCHIVO_ESPECIALIDADES_CITAS,
      "utf8"
    );

    const datos = JSON.parse(contenido || "{}");

    return datos && typeof datos === "object" && !Array.isArray(datos)
      ? datos
      : {};
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error(
        "Error leyendo citas-especialidades.json:",
        error
      );
    }

    return {};
  }
}

async function escribirMapaEspecialidadesSinCola(mapa) {
  const directorio = path.dirname(
    ARCHIVO_ESPECIALIDADES_CITAS
  );

  await fs.mkdir(directorio, {
    recursive: true,
  });

  const temporal = `${ARCHIVO_ESPECIALIDADES_CITAS}.tmp`;
  const respaldo = path.join(
    directorio,
    "citas-especialidades.backup.json"
  );

  try {
    await fs.copyFile(
      ARCHIVO_ESPECIALIDADES_CITAS,
      respaldo
    );
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn(
        "No se pudo crear respaldo de citas-especialidades.json:",
        error.message
      );
    }
  }

  await fs.writeFile(
    temporal,
    `${JSON.stringify(mapa, null, 2)}\n`,
    "utf8"
  );

  await fs.rename(
    temporal,
    ARCHIVO_ESPECIALIDADES_CITAS
  );
}

async function leerMapaEspecialidades() {
  try {
    await colaArchivoEspecialidades;
  } catch {
    // La siguiente lectura intenta recuperar el estado válido del archivo.
  }

  return leerMapaEspecialidadesSinCola();
}

function actualizarMapaEspecialidades(mutador) {
  colaArchivoEspecialidades =
    colaArchivoEspecialidades
      .catch(() => {})
      .then(async () => {
        const mapa =
          await leerMapaEspecialidadesSinCola();

        await mutador(mapa);
        await escribirMapaEspecialidadesSinCola(mapa);

        return mapa;
      });

  return colaArchivoEspecialidades;
}

async function guardarEspecialidadFallback(
  idCita,
  idEspecialidad
) {
  await actualizarMapaEspecialidades((mapa) => {
    mapa[String(idCita)] = Number(idEspecialidad);
  });
}

async function eliminarEspecialidadFallback(idCita) {
  await actualizarMapaEspecialidades((mapa) => {
    delete mapa[String(idCita)];
  });
}

async function restaurarEspecialidadFallback(
  idCita,
  valorAnterior
) {
  await actualizarMapaEspecialidades((mapa) => {
    if (
      valorAnterior === null ||
      valorAnterior === undefined ||
      valorAnterior === ""
    ) {
      delete mapa[String(idCita)];
      return;
    }

    mapa[String(idCita)] = Number(valorAnterior);
  });
}

async function validarEspecialidadDelDoctor(
  executor,
  idDoctor,
  idEspecialidad
) {
  const [rows] = await executor.query(
    `
      SELECT
        e.id_especialidad,
        e.nombre_especialidad
      FROM tbl_doctor_especialidad de
      INNER JOIN tbl_especialidades
        ON e.id_especialidad = de.id_especialidad
      WHERE de.id_doctor = ?
        AND de.id_especialidad = ?
        AND e.estado = 'ACTIVA'
      LIMIT 1
    `,
    [idDoctor, idEspecialidad]
  );

  return rows[0] || null;
}

async function obtenerEspecialidadesActivasPorDoctores(
  idsDoctores
) {
  const idsValidos = [
    ...new Set(
      idsDoctores
        .map(convertirId)
        .filter(Boolean)
    ),
  ];

  if (idsValidos.length === 0) {
    return new Map();
  }

  const placeholders = idsValidos
    .map(() => "?")
    .join(",");

  const [rows] = await pool.query(
    `
      SELECT
        de.id_doctor,
        e.id_especialidad,
        e.nombre_especialidad
      FROM tbl_doctor_especialidad de
      INNER JOIN tbl_especialidades
        ON e.id_especialidad =
           de.id_especialidad
      WHERE de.id_doctor IN (${placeholders})
        AND e.estado = 'ACTIVA'
      ORDER BY
        de.id_doctor,
        e.nombre_especialidad
    `,
    idsValidos
  );

  const mapa = new Map();

  rows.forEach((row) => {
    const clave = String(row.id_doctor);

    if (!mapa.has(clave)) {
      mapa.set(clave, []);
    }

    mapa.get(clave).push({
      ID_ESPECIALIDAD:
        Number(row.id_especialidad),
      NOMBRE_ESPECIALIDAD:
        row.nombre_especialidad,
    });
  });

  return mapa;
}

async function obtenerEspecialidadesPorIds(ids) {
  const idsValidos = [
    ...new Set(
      ids
        .map(convertirId)
        .filter(Boolean)
    ),
  ];

  if (idsValidos.length === 0) {
    return new Map();
  }

  const placeholders = idsValidos
    .map(() => "?")
    .join(",");

  const [rows] = await pool.query(
    `
      SELECT
        id_especialidad,
        nombre_especialidad,
        estado
      FROM tbl_especialidadess
      WHERE id_especialidad IN (${placeholders})
    `,
    idsValidos
  );

  return new Map(
    rows.map((row) => [
      String(row.id_especialidad),
      row,
    ])
  );
}

function normalizarFechaClaveCita(valor) {
  const fecha = new Date(valor);

  if (Number.isNaN(fecha.getTime())) {
    return String(valor || "");
  }

  return fecha.toISOString();
}

function prioridadEstadoCita(estado) {
  const prioridades = {
    FINALIZADA: 70,
    CONSULTA_MEDICA: 60,
    PRECLINICA: 50,
    CONFIRMADA: 40,
    PROGRAMADA: 30,
    NO_ASISTIO: 20,
    CANCELADA: 10,
  };

  return prioridades[
    String(estado || "").toUpperCase()
  ] || 0;
}

function deduplicarCitasExactas(citas) {
  const mapa = new Map();
  const duplicados = [];

  for (const cita of citas) {
    const clave = [
      cita.ID_PACIENTE,
      cita.ID_DOCTOR,
      normalizarFechaClaveCita(cita.FECHA_CITA),
    ].join("|");

    const existente = mapa.get(clave);

    if (!existente) {
      mapa.set(clave, {
        ...cita,
        REGISTROS_DUPLICADOS_OCULTOS: 0,
        IDS_DUPLICADOS_OCULTOS: [],
      });
      continue;
    }

    const prioridadNueva = prioridadEstadoCita(
      cita.ESTADO
    );

    const prioridadExistente = prioridadEstadoCita(
      existente.ESTADO
    );

    const idNuevo = Number(cita.ID_CITA || 0);
    const idExistente = Number(
      existente.ID_CITA || 0
    );

    const conservarNueva =
      prioridadNueva > prioridadExistente ||
      (
        prioridadNueva === prioridadExistente &&
        idNuevo > idExistente
      );

    const conservada = conservarNueva
      ? { ...cita }
      : { ...existente };

    const descartada = conservarNueva
      ? existente
      : cita;

    const idsDescartados = [
      ...(existente.IDS_DUPLICADOS_OCULTOS || []),
      Number(descartada.ID_CITA || 0),
    ].filter(Boolean);

    conservada.REGISTROS_DUPLICADOS_OCULTOS =
      idsDescartados.length;

    conservada.IDS_DUPLICADOS_OCULTOS =
      [...new Set(idsDescartados)];

    mapa.set(clave, conservada);

    duplicados.push({
      clave,
      idConservado: Number(
        conservada.ID_CITA || 0
      ),
      idOculto: Number(
        descartada.ID_CITA || 0
      ),
      especialidadConservada:
        conservada.ESPECIALIDAD_CITA ||
        conservada.ESPECIALIDAD ||
        null,
      especialidadOculta:
        descartada.ESPECIALIDAD_CITA ||
        descartada.ESPECIALIDAD ||
        null,
    });
  }

  const resultado = [...mapa.values()].sort(
    (a, b) => {
      const prioridadA = prioridadEstadoCita(
        a.ESTADO
      );

      const prioridadB = prioridadEstadoCita(
        b.ESTADO
      );

      if (prioridadA !== prioridadB) {
        return prioridadB - prioridadA;
      }

      return (
        new Date(b.FECHA_CITA).getTime() -
        new Date(a.FECHA_CITA).getTime()
      );
    }
  );

  return {
    citas: resultado,
    duplicados,
  };
}

function convertirJsonSeguro(valor) {
  if (!valor) {
    return {};
  }

  try {
    if (Buffer.isBuffer(valor)) {
      return JSON.parse(valor.toString("utf8"));
    }

    if (typeof valor === "string") {
      return JSON.parse(valor);
    }

    return typeof valor === "object" ? valor : {};
  } catch {
    return {};
  }
}

/* ============================================================
   GET /citas
============================================================ */

router.get("/", async (req, res) => {
  try {
    await registrarEventoBitacora({
      usuario: getUsuario(req),
      accion: "ACCESO_CITAS",
      descripcion: "Acceso a la vista de citas",
      modulo: "CITAS",
      tabla: "tbl_citas",
      estado: "EXITO",
      req,
    });

    res.render("citas", {
      title: "Citas Médicas - Roca Maya",
    });
  } catch (error) {
    console.error("GET /citas error:", error);
    res.status(500).send("Error interno");
  }
});

/* ============================================================
   GET /citas/api/datos
============================================================ */

router.get("/api/datos", async (req, res) => {
  try {
    const columnaEspecialidad =
      await obtenerColumnaEspecialidadCita();

    const selectEspecialidad = columnaEspecialidad
      ? `c.\`${columnaEspecialidad}\` AS ID_ESPECIALIDAD_CITA_DB,`
      : "NULL AS ID_ESPECIALIDAD_CITA_DB,";

    const [citasRows] = await pool.query(`
      SELECT
        c.id_cita AS ID_CITA,
        c.id_paciente AS ID_PACIENTE,
        CONCAT(
          p.nombres,
          ' ',
          p.apellidos
        ) AS NOMBRE_PACIENTE,
        p.telefono AS TELEFONO_PACIENTE,
        p.correo_electronico AS CORREO_PACIENTE,
        p.numero_documento_identidad AS IDENTIDAD_PACIENTE,
        d.id_usuario AS ID_DOCTOR,
        d.nombre_usuario AS NOMBRE_DOCTOR,
        d.correo_electronico AS CORREO_DOCTOR,
        ${selectEspecialidad}
        c.fecha_cita AS FECHA_CITA,
        DATE_FORMAT(c.fecha_cita, '%H:%i') AS HORA_CITA,
        c.estado AS ESTADO,
        COALESCE(c.tipo_cita, 'PRIMERA_VEZ') AS TIPO_CITA,
        COALESCE(c.prioridad, 'NORMAL') AS PRIORIDAD,
        COALESCE(c.motivo_consulta, '') AS MOTIVO_CONSULTA,
        c.duracion_estimada_min AS DURACION_ESTIMADA_MIN,
        c.fecha_fin_estimada AS FECHA_FIN_ESTIMADA,
        c.canal_registro AS CANAL_REGISTRO
      FROM tbl_citas c
      INNER JOIN tbl_paciente p
        ON c.id_paciente = p.id_paciente
      INNER JOIN tbl_ms_usuario d
        ON c.id_doctor = d.id_usuario
      WHERE c.estado IN (
        'PROGRAMADA',
        'CONFIRMADA',
        'PRECLINICA',
        'CONSULTA_MEDICA',
        'FINALIZADA',
        'CANCELADA',
        'NO_ASISTIO'
      )
      ORDER BY
        FIELD(
          c.estado,
          'CONSULTA_MEDICA',
          'PRECLINICA',
          'CONFIRMADA',
          'PROGRAMADA',
          'FINALIZADA',
          'NO_ASISTIO',
          'CANCELADA'
        ),
        c.fecha_cita DESC
    `);

    const mapaFallback = columnaEspecialidad
      ? {}
      : await leerMapaEspecialidades();

    const especialidadesPorDoctor =
      await obtenerEspecialidadesActivasPorDoctores(
        citasRows.map((cita) => cita.ID_DOCTOR)
      );

    const idsEspecialidadGuardados =
      citasRows.map((cita) =>
        cita.ID_ESPECIALIDAD_CITA_DB ||
        mapaFallback[String(cita.ID_CITA)] ||
        null
      );

    const especialidadesMap =
      await obtenerEspecialidadesPorIds(
        idsEspecialidadGuardados
      );

    const autoAsignaciones = [];

    const citasPreparadas = citasRows.map((cita) => {
      const especialidadesDoctor =
        especialidadesPorDoctor.get(
          String(cita.ID_DOCTOR)
        ) || [];

      let idEspecialidad = convertirId(
        cita.ID_ESPECIALIDAD_CITA_DB ||
          mapaFallback[String(cita.ID_CITA)]
      );

      let especialidad = idEspecialidad
        ? especialidadesMap.get(
            String(idEspecialidad)
          )
        : null;

      /*
       * Recuperación segura:
       * si la cita no tiene relación guardada y el médico solo
       * posee una especialidad activa, esa es inequívocamente
       * la especialidad de la cita.
       */
      if (
        !especialidad &&
        especialidadesDoctor.length === 1
      ) {
        const unica = especialidadesDoctor[0];

        idEspecialidad =
          Number(unica.ID_ESPECIALIDAD);

        especialidad = {
          ID_ESPECIALIDAD:
            unica.ID_ESPECIALIDAD,
          NOMBRE_ESPECIALIDAD:
            unica.NOMBRE_ESPECIALIDAD,
        };

        if (!columnaEspecialidad) {
          autoAsignaciones.push({
            idCita: Number(cita.ID_CITA),
            idEspecialidad,
          });
        }
      }

      const especialidadAsignada =
        Boolean(especialidad);

      const nombreEspecialidad =
        especialidadAsignada
          ? especialidad.NOMBRE_ESPECIALIDAD
          : "Pendiente de asignar";

      const resultado = {
        ...cita,
        ID_ESPECIALIDAD_CITA:
          especialidadAsignada
            ? idEspecialidad
            : null,
        ESPECIALIDAD_CITA:
          nombreEspecialidad,
        NOMBRE_ESPECIALIDAD_CITA:
          nombreEspecialidad,
        ESPECIALIDAD:
          nombreEspecialidad,
        ESPECIALIDAD_ASIGNADA:
          especialidadAsignada,
        ESPECIALIDAD_PENDIENTE:
          !especialidadAsignada,
        ESPECIALIDADES_DOCTOR_DISPONIBLES:
          especialidadesDoctor,
      };

      delete resultado.ID_ESPECIALIDAD_CITA_DB;

      return resultado;
    });

    if (
      !columnaEspecialidad &&
      autoAsignaciones.length > 0
    ) {
      await actualizarMapaEspecialidades(
        (mapa) => {
          autoAsignaciones.forEach(
            ({
              idCita,
              idEspecialidad,
            }) => {
              if (!mapa[String(idCita)]) {
                mapa[String(idCita)] =
                  Number(idEspecialidad);
              }
            }
          );
        }
      );
    }

    const {
      citas,
      duplicados: duplicadosOcultos,
    } = deduplicarCitasExactas(citasPreparadas);

    if (duplicadosOcultos.length > 0) {
      console.warn(
        "⚠️ Se ocultaron citas duplicadas exactas en /citas/api/datos:",
        duplicadosOcultos
      );
    }

    const [doctoresRows] = await pool.query(`
      SELECT
        u.id_usuario AS ID_DOCTOR,
        u.nombre_usuario AS NOMBRE,
        u.correo_electronico AS CORREO_ELECTRONICO,
        GROUP_CONCAT(
          DISTINCT CONCAT(
            e.id_especialidad,
            '::',
            e.nombre_especialidad
          )
          ORDER BY e.nombre_especialidad
          SEPARATOR '||'
        ) AS ESPECIALIDADES_RAW
      FROM tbl_ms_usuario u
      INNER JOIN tbl_doctor_especialidad de
        ON u.id_usuario = de.id_doctor
      INNER JOIN tbl_especialidades e
        ON e.id_especialidad = de.id_especialidad
       AND e.estado = 'ACTIVA'
      WHERE u.estado = 'ACTIVO'
        AND u.id_rol = (
          SELECT id_rol
          FROM tbl_ms_roles
          WHERE rol = 'DOCTOR'
          LIMIT 1
        )
      GROUP BY
        u.id_usuario,
        u.nombre_usuario,
        u.correo_electronico
      ORDER BY u.nombre_usuario ASC
    `);

    const doctores = doctoresRows.map((doctor) => {
      const especialidades = String(
        doctor.ESPECIALIDADES_RAW || ""
      )
        .split("||")
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => {
          const separador = item.indexOf("::");

          return {
            ID_ESPECIALIDAD: convertirId(
              item.slice(0, separador)
            ),
            NOMBRE_ESPECIALIDAD:
              separador >= 0
                ? item.slice(separador + 2)
                : item,
          };
        })
        .filter(
          (especialidad) =>
            especialidad.ID_ESPECIALIDAD &&
            especialidad.NOMBRE_ESPECIALIDAD
        );

      const nombres = especialidades
        .map(
          (especialidad) =>
            especialidad.NOMBRE_ESPECIALIDAD
        )
        .join(", ");

      return {
        ID_DOCTOR: doctor.ID_DOCTOR,
        NOMBRE: doctor.NOMBRE,
        CORREO_ELECTRONICO:
          doctor.CORREO_ELECTRONICO || "",
        ESPECIALIDADES: especialidades,
        ESPECIALIDADES_TEXTO: nombres,
        ESPECIALIDAD: nombres,
      };
    });

    const [pacientes] = await pool.query(`
      SELECT
        id_paciente AS ID_PACIENTE,
        nombres AS NOMBRES,
        apellidos AS APELLIDOS,
        telefono AS TELEFONO,
        correo_electronico AS CORREO_ELECTRONICO,
        numero_documento_identidad AS NUMERO_DOCUMENTO_IDENTIDAD
      FROM tbl_paciente
      WHERE estado = 'ACTIVO'
      ORDER BY nombres, apellidos
    `);

    res.json({
      success: true,
      citas,
      doctores,
      pacientes,
      metadata: {
        tipos: [
          "PRIMERA_VEZ",
          "CONTROL",
          "EMERGENCIA",
          "PROCEDIMIENTO",
        ],
        prioridades: [
          "NORMAL",
          "URGENTE",
          "ALTA",
        ],
        canales: [
          "PRESENCIAL",
          "TELEFONO",
          "WEB",
          "MOVIL",
          "API",
        ],
        duraciones: [15, 20, 30, 45, 60],
        almacenamientoEspecialidad:
          columnaEspecialidad
            ? `tbl_citas.${columnaEspecialidad}`
            : "data/citas-especialidades.json",
        duplicadosExactosOcultos:
          duplicadosOcultos.length,
        citasPendientesEspecialidad:
          citas.filter(
            (cita) =>
              cita.ESPECIALIDAD_PENDIENTE
          ).length,
      },
    });
  } catch (error) {
    console.error(
      "Error GET /citas/api/datos:",
      error
    );

    res.status(500).json({
      success: false,
      citas: [],
      doctores: [],
      pacientes: [],
      metadata: {},
      message:
        "No se pudieron cargar las citas médicas.",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : undefined,
    });
  }
});

/* ============================================================
   GET /citas/especialidades-doctor/:idDoctor
============================================================ */

router.get(
  "/especialidades-doctor/:idDoctor",
  async (req, res) => {
    try {
      const idDoctor = convertirId(
        req.params.idDoctor
      );

      if (!idDoctor) {
        return res.status(400).json({
          success: false,
          especialidades: [],
          message:
            "El ID del médico no es válido.",
        });
      }

      const [especialidades] = await pool.query(
        `
          SELECT
            e.id_especialidad AS ID_ESPECIALIDAD,
            e.nombre_especialidad AS NOMBRE_ESPECIALIDAD,
            e.descripcion AS DESCRIPCION,
            e.estado AS ESTADO
          FROM tbl_doctor_especialidad de
          INNER JOIN tbl_especialidades
            ON e.id_especialidad = de.id_especialidad
          WHERE de.id_doctor = ?
            AND e.estado = 'ACTIVA'
          ORDER BY e.nombre_especialidad ASC
        `,
        [idDoctor]
      );

      return res.json({
        success: true,
        idDoctor,
        especialidades,
      });
    } catch (error) {
      console.error(
        "GET /citas/especialidades-doctor/:idDoctor error:",
        error
      );

      return res.status(500).json({
        success: false,
        especialidades: [],
        message:
          "No se pudieron consultar las especialidades del médico.",
      });
    }
  }
);

/* ============================================================
   POST /citas/asignar-especialidad/:idCita
   Repara únicamente la especialidad de una cita existente.
============================================================ */

router.post(
  "/asignar-especialidad/:idCita",
  async (req, res) => {
    let connection;

    try {
      const idCita = convertirId(
        req.params.idCita
      );

      const idEspecialidad = convertirId(
        req.body.especialidad ||
        req.body.idEspecialidad
      );

      if (!idCita || !idEspecialidad) {
        return res.status(400).json({
          success: false,
          message:
            "La cita y la especialidad son obligatorias.",
        });
      }

      connection = await pool.getConnection();
      await connection.beginTransaction();

      const [citas] = await connection.query(
        `
          SELECT
            id_cita AS ID_CITA,
            id_doctor AS ID_DOCTOR
          FROM tbl_citas
          WHERE id_cita = ?
          LIMIT 1
          FOR UPDATE
        `,
        [idCita]
      );

      if (citas.length === 0) {
        await connection.rollback();

        return res.status(404).json({
          success: false,
          message: "La cita no existe.",
        });
      }

      const idDoctor =
        Number(citas[0].ID_DOCTOR);

      const especialidadValida =
        await validarEspecialidadDelDoctor(
          connection,
          idDoctor,
          idEspecialidad
        );

      if (!especialidadValida) {
        await connection.rollback();

        return res.status(400).json({
          success: false,
          message:
            "La especialidad seleccionada no está asignada al médico de esta cita.",
        });
      }

      const columnaEspecialidad =
        await obtenerColumnaEspecialidadCita();

      if (columnaEspecialidad) {
        await connection.query(
          `
            UPDATE tbl_citas
            SET
              \`${columnaEspecialidad}\` = ?,
              fecha_modificacion =
                CURRENT_TIMESTAMP,
              usuario_modificacion = ?
            WHERE id_cita = ?
          `,
          [
            idEspecialidad,
            getUsuario(req),
            idCita,
          ]
        );
      }

      await connection.commit();

      if (!columnaEspecialidad) {
        await guardarEspecialidadFallback(
          idCita,
          idEspecialidad
        );
      }

      await registrarEventoBitacora({
        usuario: getUsuario(req),
        accion:
          "ASIGNACION_ESPECIALIDAD_CITA",
        descripcion:
          `Asignada especialidad ${especialidadValida.nombre_especialidad} a la cita ${idCita}`,
        modulo: "CITAS",
        idRegistro: idCita,
        tabla: "tbl_citas",
        estado: "EXITO",
        req,
      });

      return res.json({
        success: true,
        message:
          "Especialidad asignada correctamente.",
        idCita,
        idEspecialidad,
        especialidad:
          especialidadValida.nombre_especialidad,
      });
    } catch (error) {
      if (connection) {
        await connection
          .rollback()
          .catch(() => {});
      }

      console.error(
        "POST /citas/asignar-especialidad/:idCita error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "No se pudo asignar la especialidad a la cita.",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : undefined,
      });
    } finally {
      connection?.release();
    }
  }
);

/* ============================================================
   POST /citas/nueva
============================================================ */

router.post("/nueva", async (req, res) => {
  let connection;
  let idCitaCreada = null;
  let fallbackCreado = false;
  let claveCreacion = null;

  try {
    const {
      paciente,
      doctor,
      especialidad,
      fechaCita,
      tipoCita,
      prioridad,
      motivo,
      duracion,
      canal,
      registroAtendido,
    } = req.body;

    const idPaciente = convertirId(paciente);
    const idDoctor = convertirId(doctor);
    const idEspecialidad = convertirId(especialidad);

    if (
      !idPaciente ||
      !idDoctor ||
      !idEspecialidad ||
      !fechaCita
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Paciente, médico, especialidad, fecha y hora son obligatorios.",
      });
    }

    const fecha = new Date(fechaCita);

    if (Number.isNaN(fecha.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Fecha inválida.",
      });
    }

    const esFechaPasada =
      fecha.getTime() <= Date.now();

    const registrarComoAtendido =
      registroAtendido === true ||
      registroAtendido === 1 ||
      registroAtendido === "1" ||
      String(registroAtendido || "").toLowerCase() === "true";

    if (esFechaPasada && !registrarComoAtendido) {
      return res.status(400).json({
        success: false,
        message:
          "Para registrar una fecha anterior debe confirmar que el paciente ya fue atendido.",
      });
    }

    const estadoInicial =
      esFechaPasada
        ? "FINALIZADA"
        : "PROGRAMADA";

    const durMin = Number(duracion) || 30;
    const fechaFin = new Date(
      fecha.getTime() + durMin * 60000
    );

    const mysqlFecha = formatearFechaMySQL(fecha);
    const mysqlFin = formatearFechaMySQL(fechaFin);

    claveCreacion = [
      idPaciente,
      idDoctor,
      mysqlFecha,
      mysqlFin,
    ].join("|");

    if (
      clavesCreacionCitaEnProceso.has(
        claveCreacion
      )
    ) {
      return res.status(409).json({
        success: false,
        code: "CITA_EN_PROCESO",
        message:
          "Esta misma cita ya se está registrando. Espere un momento.",
      });
    }

    clavesCreacionCitaEnProceso.add(
      claveCreacion
    );

    connection = await pool.getConnection();
    await connection.beginTransaction();

    const especialidadValida =
      await validarEspecialidadDelDoctor(
        connection,
        idDoctor,
        idEspecialidad
      );

    if (!especialidadValida) {
      await connection.rollback();

      return res.status(400).json({
        success: false,
        message:
          "La especialidad seleccionada no está asignada al médico.",
      });
    }

    const [duplicadas] = await connection.query(
      `
        SELECT id_cita AS ID_CITA
        FROM tbl_citas
        WHERE estado <> 'CANCELADA'
          AND (
            id_doctor = ?
            OR id_paciente = ?
          )
          AND (? < fecha_fin_estimada)
          AND (? > fecha_cita)
        LIMIT 1
      `,
      [
        idDoctor,
        idPaciente,
        mysqlFecha,
        mysqlFin,
      ]
    );

    if (duplicadas.length > 0) {
      await connection.rollback();

      return res.status(409).json({
        success: false,
        code: "DUPLICATE_CITA",
        message:
          "Ya existe una cita para ese paciente o médico en el horario seleccionado.",
      });
    }

    const columnaEspecialidad =
      await obtenerColumnaEspecialidadCita();

    const columnas = [
      "id_paciente",
      "id_doctor",
      "fecha_cita",
      "fecha_fin_estimada",
      "duracion_estimada_min",
      "motivo_consulta",
      "estado",
      "tipo_cita",
      "prioridad",
      "canal_registro",
      "id_usuariocreador",
      "usuario_creacion",
    ];

    const valores = [
      idPaciente,
      idDoctor,
      mysqlFecha,
      mysqlFin,
      durMin,
      motivo || null,
      estadoInicial,
      tipoCita || "PRIMERA_VEZ",
      prioridad || "NORMAL",
      canal || "PRESENCIAL",
      getIdUsuario(req),
      getUsuario(req),
    ];

    if (columnaEspecialidad) {
      columnas.splice(2, 0, columnaEspecialidad);
      valores.splice(2, 0, idEspecialidad);
    }

    const placeholders = columnas
      .map(() => "?")
      .join(", ");

    const [result] = await connection.query(
      `
        INSERT INTO tbl_citas (
          ${columnas.map((columna) => `\`${columna}\``).join(", ")}
        )
        VALUES (${placeholders})
      `,
      valores
    );

    idCitaCreada = result.insertId;

    if (!columnaEspecialidad) {
      await guardarEspecialidadFallback(
        idCitaCreada,
        idEspecialidad
      );
      fallbackCreado = true;
    }

    await connection.commit();

    await registrarEventoBitacora({
      usuario: getUsuario(req),
      accion:
        esFechaPasada
          ? "CREACION_ATENCION_RETROACTIVA"
          : "CREACION_CITA",
      descripcion:
        `${esFechaPasada ? "Registrada atención pasada" : "Creada cita"} ` +
        `ID ${idCitaCreada}, paciente ${idPaciente}, médico ${idDoctor}, ` +
        `especialidad ${especialidadValida.nombre_especialidad}, estado ${estadoInicial}`,
      modulo: "CITAS",
      idRegistro: idCitaCreada,
      tabla: "tbl_citas",
      estado: "EXITO",
      req,
    });

    try {
      const emitter = req.app.get("emitter");

      if (emitter?.emit) {
        emitter.emit("cita:creada", {
          idCita: idCitaCreada,
          pacienteId: idPaciente,
          doctorId: idDoctor,
          especialidadId: idEspecialidad,
          especialidad:
            especialidadValida.nombre_especialidad,
          fecha,
          durMin,
          canal,
          motivo,
          estado: estadoInicial,
          registroAtendido: esFechaPasada,
          usuario: getUsuario(req),
        });
      }
    } catch (errorEmitter) {
      console.warn(
        "Emitter no disponible:",
        errorEmitter
      );
    }

    return res.status(201).json({
      success: true,
      message:
        esFechaPasada
          ? "Atención pasada registrada correctamente. El paciente aparece como ATENDIDO."
          : "Cita creada correctamente.",
      idCita: idCitaCreada,
      idEspecialidad,
      especialidad:
        especialidadValida.nombre_especialidad,
      estado: estadoInicial,
      registroAtendido: esFechaPasada,
    });
  } catch (error) {
    if (connection) {
      await connection.rollback().catch(() => {});
    }

    if (fallbackCreado && idCitaCreada) {
      await eliminarEspecialidadFallback(
        idCitaCreada
      ).catch(() => {});
    }

    console.error("POST /citas/nueva error:", error);

    await registrarEventoBitacora({
      usuario: getUsuario(req),
      accion: "ERROR_CREACION_CITA",
      descripcion: error.message,
      modulo: "CITAS",
      tabla: "tbl_citas",
      estado: "ERROR",
      detalleError: error.message,
      req,
    });

    return res.status(500).json({
      success: false,
      message:
        "Error creando la cita: " + error.message,
    });
  } finally {
    if (claveCreacion) {
      clavesCreacionCitaEnProceso.delete(
        claveCreacion
      );
    }

    connection?.release();
  }
});

/* ============================================================
   POST /citas/editar
============================================================ */

router.post("/editar", async (req, res) => {
  let connection;
  let valorFallbackAnterior;
  let fallbackModificado = false;

  try {
    const {
      idCita,
      paciente,
      doctor,
      especialidad,
      fechaCita,
      tipoCita,
      prioridad,
      motivo,
      duracion,
      canal,
      estado,
    } = req.body;

    const id = convertirId(idCita);
    const idPaciente = convertirId(paciente);
    const idDoctor = convertirId(doctor);
    const idEspecialidad = convertirId(especialidad);

    if (
      !id ||
      !idPaciente ||
      !idDoctor ||
      !idEspecialidad ||
      !fechaCita
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Cita, paciente, médico, especialidad, fecha y hora son obligatorios.",
      });
    }

    const fecha = new Date(fechaCita);

    if (Number.isNaN(fecha.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Fecha inválida.",
      });
    }

    const estadoNormalizado = String(
      estado || "PROGRAMADA"
    )
      .trim()
      .toUpperCase();

    const estadosPermitidos = [
      "PROGRAMADA",
      "CONFIRMADA",
      "PRECLINICA",
      "CONSULTA_MEDICA",
      "FINALIZADA",
      "CANCELADA",
      "NO_ASISTIO",
    ];

    if (!estadosPermitidos.includes(estadoNormalizado)) {
      return res.status(400).json({
        success: false,
        message: "El estado seleccionado no es válido.",
      });
    }

    if (
      fecha.getTime() <= Date.now() &&
      estadoNormalizado !== "FINALIZADA"
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Las citas con una fecha anterior deben conservarse con estado FINALIZADA.",
      });
    }

    const durMin = Number(duracion) || 30;
    const fechaFin = new Date(
      fecha.getTime() + durMin * 60000
    );

    const mysqlFecha = formatearFechaMySQL(fecha);
    const mysqlFin = formatearFechaMySQL(fechaFin);

    connection = await pool.getConnection();
    await connection.beginTransaction();

    const especialidadValida =
      await validarEspecialidadDelDoctor(
        connection,
        idDoctor,
        idEspecialidad
      );

    if (!especialidadValida) {
      await connection.rollback();

      return res.status(400).json({
        success: false,
        message:
          "La especialidad seleccionada no está asignada al médico.",
      });
    }

    const [duplicadas] = await connection.query(
      `
        SELECT id_cita AS ID_CITA
        FROM tbl_citas
        WHERE estado <> 'CANCELADA'
          AND id_cita <> ?
          AND (
            id_doctor = ?
            OR id_paciente = ?
          )
          AND (? < fecha_fin_estimada)
          AND (? > fecha_cita)
        LIMIT 1
      `,
      [
        id,
        idDoctor,
        idPaciente,
        mysqlFecha,
        mysqlFin,
      ]
    );

    if (duplicadas.length > 0) {
      await connection.rollback();

      return res.status(409).json({
        success: false,
        code: "DUPLICATE_CITA",
        message:
          "Ya existe una cita para ese paciente o médico en el horario seleccionado.",
      });
    }

    const columnaEspecialidad =
      await obtenerColumnaEspecialidadCita();

    const asignaciones = [
      "id_paciente = ?",
      "id_doctor = ?",
      "fecha_cita = ?",
      "fecha_fin_estimada = ?",
      "duracion_estimada_min = ?",
      "motivo_consulta = ?",
      "tipo_cita = ?",
      "prioridad = ?",
      "canal_registro = ?",
      "estado = ?",
      "fecha_modificacion = CURRENT_TIMESTAMP",
      "usuario_modificacion = ?",
    ];

    const valores = [
      idPaciente,
      idDoctor,
      mysqlFecha,
      mysqlFin,
      durMin,
      motivo || null,
      tipoCita || "PRIMERA_VEZ",
      prioridad || "NORMAL",
      canal || "PRESENCIAL",
      estadoNormalizado,
      getUsuario(req),
    ];

    if (columnaEspecialidad) {
      asignaciones.splice(
        2,
        0,
        `\`${columnaEspecialidad}\` = ?`
      );
      valores.splice(2, 0, idEspecialidad);
    }

    valores.push(id);

    const [result] = await connection.query(
      `
        UPDATE tbl_citas
        SET ${asignaciones.join(",\n            ")}
        WHERE id_cita = ?
      `,
      valores
    );

    if (result.affectedRows === 0) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "Cita no encontrada.",
      });
    }

    if (!columnaEspecialidad) {
      const mapa = await leerMapaEspecialidades();
      valorFallbackAnterior =
        mapa[String(id)] ?? null;

      await guardarEspecialidadFallback(
        id,
        idEspecialidad
      );

      fallbackModificado = true;
    }

    await connection.commit();

    await registrarEventoBitacora({
      usuario: getUsuario(req),
      accion: "EDICION_CITA",
      descripcion:
        `Editada cita ID ${id}; especialidad ${especialidadValida.nombre_especialidad}`,
      modulo: "CITAS",
      idRegistro: id,
      tabla: "tbl_citas",
      estado: "EXITO",
      req,
    });

    return res.json({
      success: true,
      message: "Cita actualizada correctamente.",
      idCita: id,
      idEspecialidad,
      especialidad:
        especialidadValida.nombre_especialidad,
    });
  } catch (error) {
    if (connection) {
      await connection.rollback().catch(() => {});
    }

    if (fallbackModificado) {
      await restaurarEspecialidadFallback(
        req.body.idCita,
        valorFallbackAnterior
      ).catch(() => {});
    }

    console.error("POST /citas/editar error:", error);

    await registrarEventoBitacora({
      usuario: getUsuario(req),
      accion: "ERROR_EDICION_CITA",
      descripcion: error.message,
      modulo: "CITAS",
      tabla: "tbl_citas",
      estado: "ERROR",
      detalleError: error.message,
      req,
    });

    return res.status(500).json({
      success: false,
      message:
        "Error actualizando la cita: " +
        error.message,
    });
  } finally {
    connection?.release();
  }
});

/* ============================================================
   POST /citas/cambiar-estado
============================================================ */

async function handleCambiarEstado(req, res) {
  try {
    const idCita = convertirId(req.body.idCita);
    const nuevoEstado = String(
      req.body.nuevoEstado || ""
    )
      .trim()
      .toUpperCase();

    const estadosValidos = [
      "PROGRAMADA",
      "CONFIRMADA",
      "PRECLINICA",
      "CONSULTA_MEDICA",
      "FINALIZADA",
      "CANCELADA",
      "NO_ASISTIO",
    ];

    if (
      !idCita ||
      !estadosValidos.includes(nuevoEstado)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Los parámetros del cambio de estado no son válidos.",
      });
    }

    const [result] = await pool.query(
      `
        UPDATE tbl_citas
        SET
          estado = ?,
          fecha_modificacion = CURRENT_TIMESTAMP,
          usuario_modificacion = ?
        WHERE id_cita = ?
      `,
      [nuevoEstado, getUsuario(req), idCita]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Cita no encontrada.",
      });
    }

    await registrarEventoBitacora({
      usuario: getUsuario(req),
      accion: "CAMBIO_ESTADO_CITA",
      descripcion:
        `Cita ${idCita} -> ${nuevoEstado}`,
      modulo: "CITAS",
      idRegistro: idCita,
      tabla: "tbl_citas",
      estado: "EXITO",
      req,
    });

    return res.json({
      success: true,
      message: "Estado actualizado.",
    });
  } catch (error) {
    console.error(
      "POST /citas/cambiar-estado error:",
      error
    );

    await registrarEventoBitacora({
      usuario: getUsuario(req),
      accion: "ERROR_CAMBIO_ESTADO_CITA",
      descripcion: error.message,
      modulo: "CITAS",
      tabla: "tbl_citas",
      estado: "ERROR",
      detalleError: error.message,
      req,
    });

    return res.status(500).json({
      success: false,
      message:
        "Error cambiando estado: " + error.message,
    });
  }
}

router.post("/cambiar-estado", handleCambiarEstado);
router.post("/estado", handleCambiarEstado);

/* ============================================================
   POST /citas/consulta-express/:idCita
============================================================ */

router.post(
  "/consulta-express/:idCita",
  async (req, res) => {
    try {
      const idCita = convertirId(
        req.params.idCita
      );

      const confirmar =
        req.body?.confirmar === true;

      if (!idCita) {
        return res.status(400).json({
          success: false,
          message:
            "El ID de la cita no es válido.",
        });
      }

      const [citas] = await pool.query(
        `
          SELECT
            c.id_cita AS ID_CITA,
            c.id_paciente AS ID_PACIENTE,
            c.id_doctor AS ID_DOCTOR,
            c.estado AS ESTADO,
            CONCAT(
              p.nombres,
              ' ',
              p.apellidos
            ) AS NOMBRE_PACIENTE
          FROM tbl_citas c
          INNER JOIN tbl_paciente p
            ON p.id_paciente = c.id_paciente
          WHERE c.id_cita = ?
          LIMIT 1
        `,
        [idCita]
      );

      if (citas.length === 0) {
        return res.status(404).json({
          success: false,
          message:
            "La cita seleccionada no existe.",
        });
      }

      const cita = citas[0];
      const estadoActual = String(
        cita.ESTADO || ""
      ).toUpperCase();

      const estadosPermitidos = [
        "PROGRAMADA",
        "CONFIRMADA",
        "PRECLINICA",
        "CONSULTA_MEDICA",
      ];

      if (!estadosPermitidos.includes(estadoActual)) {
        return res.status(409).json({
          success: false,
          message:
            `La cita está en estado ${estadoActual || "SIN ESTADO"} y no puede abrirse mediante Consulta Médica Express.`,
        });
      }

      const [preclinicas] = await pool.query(
        `
          SELECT
            id_preclinica AS ID_PRECLINICA,
            temperatura AS TEMPERATURA,
            presion_sistolica AS PRESION_SISTOLICA,
            presion_diastolica AS PRESION_DIASTOLICA,
            frecuencia_cardiaca AS FRECUENCIA_CARDIACA,
            frecuencia_respiratoria AS FRECUENCIA_RESPIRATORIA,
            saturacion_oxigeno AS SATURACION_OXIGENO,
            peso AS PESO,
            talla AS TALLA,
            signos_vitales_json AS SIGNOS_VITALES_JSON
          FROM tbl_preclinica
          WHERE id_cita = ?
          LIMIT 1
        `,
        [idCita]
      );

      const preclinica =
        preclinicas[0] || null;

      const camposPendientes = [];
      let alertasClinicas = [];

      if (!preclinica) {
        camposPendientes.push(
          "Registro de preclínica"
        );
      } else {
        const camposPrincipales = [
          ["TEMPERATURA", "Temperatura"],
          [
            "PRESION_SISTOLICA",
            "Presión sistólica",
          ],
          [
            "PRESION_DIASTOLICA",
            "Presión diastólica",
          ],
          [
            "FRECUENCIA_CARDIACA",
            "Frecuencia cardíaca",
          ],
          [
            "FRECUENCIA_RESPIRATORIA",
            "Frecuencia respiratoria",
          ],
          [
            "SATURACION_OXIGENO",
            "Saturación de oxígeno",
          ],
          ["PESO", "Peso"],
          ["TALLA", "Talla"],
        ];

        camposPrincipales.forEach(
          ([campo, etiqueta]) => {
            const valor = preclinica[campo];

            if (
              valor === null ||
              valor === undefined ||
              String(valor).trim() === "" ||
              Number(valor) <= 0
            ) {
              camposPendientes.push(etiqueta);
            }
          }
        );

        const signosJson = convertirJsonSeguro(
          preclinica.SIGNOS_VITALES_JSON
        );

        const controlConsulta =
          signosJson.controlConsulta || {};

        if (
          Array.isArray(
            controlConsulta.alertasClinicas
          )
        ) {
          alertasClinicas =
            controlConsulta.alertasClinicas
              .map((alerta) =>
                typeof alerta === "string"
                  ? alerta
                  : alerta?.mensaje ||
                    alerta?.message ||
                    alerta?.texto ||
                    ""
              )
              .filter(Boolean);
        }
      }

      const alertaPreclinica =
        camposPendientes.length > 0 ||
        alertasClinicas.length > 0;

      const redirectUrl =
        `/consultaMedica?idCita=${encodeURIComponent(
          idCita
        )}&express=1`;

      if (!confirmar) {
        return res.json({
          success: true,
          requiereConfirmacion: true,
          idCita,
          nombrePaciente:
            cita.NOMBRE_PACIENTE,
          tienePreclinica: Boolean(preclinica),
          alertaPreclinica,
          camposPendientes,
          alertasClinicas,
          redirectUrl,
          message: !preclinica
            ? "La cita no tiene una preclínica registrada."
            : alertaPreclinica
              ? "La preclínica contiene información pendiente o alertas clínicas."
              : "La cita está lista para Consulta Médica.",
        });
      }

      if (estadoActual !== "CONSULTA_MEDICA") {
        await pool.query(
          `
            UPDATE tbl_citas
            SET
              estado = 'CONSULTA_MEDICA',
              fecha_modificacion = CURRENT_TIMESTAMP,
              usuario_modificacion = ?
            WHERE id_cita = ?
          `,
          [getUsuario(req), idCita]
        );
      }

      await registrarEventoBitacora({
        usuario: getUsuario(req),
        accion: "CONSULTA_MEDICA_EXPRESS",
        descripcion:
          `Cita ${idCita} abierta mediante Consulta Médica Express` +
          (alertaPreclinica
            ? ` con ${camposPendientes.length} dato(s) pendiente(s)`
            : " sin datos pendientes"),
        modulo: "CITAS",
        idRegistro: idCita,
        tabla: "tbl_citas",
        estado: "EXITO",
        req,
      });

      return res.json({
        success: true,
        confirmado: true,
        idCita,
        alertaPreclinica,
        camposPendientes,
        alertasClinicas,
        redirectUrl,
        message:
          "Abriendo Consulta Médica Express.",
      });
    } catch (error) {
      console.error(
        "POST /citas/consulta-express/:idCita error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "No se pudo abrir Consulta Médica Express.",
      });
    }
  }
);

/* ============================================================
   DELETE /citas/eliminar/:id
============================================================ */

router.delete("/eliminar/:id", async (req, res) => {
  try {
    const idCita = convertirId(req.params.id);

    if (!idCita) {
      return res.status(400).json({
        success: false,
        message: "ID de cita requerido.",
      });
    }

    const [citas] = await pool.query(
      `
        SELECT id_cita AS ID_CITA, estado AS ESTADO
        FROM tbl_citas
        WHERE id_cita = ?
        LIMIT 1
      `,
      [idCita]
    );

    if (citas.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Cita no encontrada.",
      });
    }

    const [result] = await pool.query(
      `
        DELETE FROM tbl_citas
        WHERE id_cita = ?
      `,
      [idCita]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Cita no encontrada.",
      });
    }

    const columnaEspecialidad =
      await obtenerColumnaEspecialidadCita();

    if (!columnaEspecialidad) {
      await eliminarEspecialidadFallback(
        idCita
      );
    }

    await registrarEventoBitacora({
      usuario: getUsuario(req),
      accion: "ELIMINACION_CITA",
      descripcion: `Eliminada cita ID ${idCita}`,
      modulo: "CITAS",
      idRegistro: idCita,
      tabla: "tbl_citas",
      estado: "EXITO",
      req,
    });

    return res.json({
      success: true,
      message: "Cita eliminada correctamente.",
      idCita,
    });
  } catch (error) {
    console.error(
      "DELETE /citas/eliminar/:id error:",
      error
    );

    await registrarEventoBitacora({
      usuario: getUsuario(req),
      accion: "ERROR_ELIMINACION_CITA",
      descripcion: error.message,
      modulo: "CITAS",
      tabla: "tbl_citas",
      estado: "ERROR",
      detalleError: error.message,
      req,
    });

    return res.status(500).json({
      success: false,
      message:
        "Error eliminando la cita: " +
        error.message,
    });
  }
});

module.exports = router;