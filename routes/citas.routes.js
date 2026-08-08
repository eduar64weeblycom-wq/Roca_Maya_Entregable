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
      "SHOW COLUMNS FROM TBL_CITAS"
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
      "No se pudo verificar si TBL_CITAS tiene una columna de especialidad:",
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
        e.ID_ESPECIALIDAD,
        e.NOMBRE_ESPECIALIDAD
      FROM TBL_DOCTOR_ESPECIALIDAD de
      INNER JOIN TBL_ESPECIALIDADES e
        ON e.ID_ESPECIALIDAD = de.ID_ESPECIALIDAD
      WHERE de.ID_DOCTOR = ?
        AND de.ID_ESPECIALIDAD = ?
        AND e.ESTADO = 'ACTIVA'
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
        de.ID_DOCTOR,
        e.ID_ESPECIALIDAD,
        e.NOMBRE_ESPECIALIDAD
      FROM TBL_DOCTOR_ESPECIALIDAD de
      INNER JOIN TBL_ESPECIALIDADES e
        ON e.ID_ESPECIALIDAD =
           de.ID_ESPECIALIDAD
      WHERE de.ID_DOCTOR IN (${placeholders})
        AND e.ESTADO = 'ACTIVA'
      ORDER BY
        de.ID_DOCTOR,
        e.NOMBRE_ESPECIALIDAD
    `,
    idsValidos
  );

  const mapa = new Map();

  rows.forEach((row) => {
    const clave = String(row.ID_DOCTOR);

    if (!mapa.has(clave)) {
      mapa.set(clave, []);
    }

    mapa.get(clave).push({
      ID_ESPECIALIDAD:
        Number(row.ID_ESPECIALIDAD),
      NOMBRE_ESPECIALIDAD:
        row.NOMBRE_ESPECIALIDAD,
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
        ID_ESPECIALIDAD,
        NOMBRE_ESPECIALIDAD,
        ESTADO
      FROM TBL_ESPECIALIDADES
      WHERE ID_ESPECIALIDAD IN (${placeholders})
    `,
    idsValidos
  );

  return new Map(
    rows.map((row) => [
      String(row.ID_ESPECIALIDAD),
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
      tabla: "TBL_CITAS",
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
        c.ID_CITA,
        c.ID_PACIENTE,
        CONCAT(
          p.NOMBRES,
          ' ',
          p.APELLIDOS
        ) AS NOMBRE_PACIENTE,
        p.TELEFONO AS TELEFONO_PACIENTE,
        p.CORREO_ELECTRONICO AS CORREO_PACIENTE,
        p.NUMERO_DOCUMENTO_IDENTIDAD AS IDENTIDAD_PACIENTE,
        d.ID_USUARIO AS ID_DOCTOR,
        d.NOMBRE_USUARIO AS NOMBRE_DOCTOR,
        d.CORREO_ELECTRONICO AS CORREO_DOCTOR,
        ${selectEspecialidad}
        c.FECHA_CITA,
        DATE_FORMAT(c.FECHA_CITA, '%H:%i') AS HORA_CITA,
        c.ESTADO,
        COALESCE(c.TIPO_CITA, 'PRIMERA_VEZ') AS TIPO_CITA,
        COALESCE(c.PRIORIDAD, 'NORMAL') AS PRIORIDAD,
        COALESCE(c.MOTIVO_CONSULTA, '') AS MOTIVO_CONSULTA,
        c.DURACION_ESTIMADA_MIN,
        c.FECHA_FIN_ESTIMADA,
        c.CANAL_REGISTRO
      FROM TBL_CITAS c
      INNER JOIN TBL_PACIENTE p
        ON c.ID_PACIENTE = p.ID_PACIENTE
      INNER JOIN TBL_MS_USUARIO d
        ON c.ID_DOCTOR = d.ID_USUARIO
      WHERE c.ESTADO IN (
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
          c.ESTADO,
          'CONSULTA_MEDICA',
          'PRECLINICA',
          'CONFIRMADA',
          'PROGRAMADA',
          'FINALIZADA',
          'NO_ASISTIO',
          'CANCELADA'
        ),
        c.FECHA_CITA DESC
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
        u.ID_USUARIO AS ID_DOCTOR,
        u.NOMBRE_USUARIO AS NOMBRE,
        u.CORREO_ELECTRONICO,
        GROUP_CONCAT(
          DISTINCT CONCAT(
            e.ID_ESPECIALIDAD,
            '::',
            e.NOMBRE_ESPECIALIDAD
          )
          ORDER BY e.NOMBRE_ESPECIALIDAD
          SEPARATOR '||'
        ) AS ESPECIALIDADES_RAW
      FROM TBL_MS_USUARIO u
      INNER JOIN TBL_DOCTOR_ESPECIALIDAD de
        ON u.ID_USUARIO = de.ID_DOCTOR
      INNER JOIN TBL_ESPECIALIDADES e
        ON e.ID_ESPECIALIDAD = de.ID_ESPECIALIDAD
       AND e.ESTADO = 'ACTIVA'
      WHERE u.ESTADO = 'ACTIVO'
        AND u.ID_ROL = (
          SELECT ID_ROL
          FROM TBL_MS_ROLES
          WHERE ROL = 'DOCTOR'
          LIMIT 1
        )
      GROUP BY
        u.ID_USUARIO,
        u.NOMBRE_USUARIO,
        u.CORREO_ELECTRONICO
      ORDER BY u.NOMBRE_USUARIO ASC
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
        ID_PACIENTE,
        NOMBRES,
        APELLIDOS,
        TELEFONO,
        CORREO_ELECTRONICO,
        NUMERO_DOCUMENTO_IDENTIDAD
      FROM TBL_PACIENTE
      WHERE ESTADO = 'ACTIVO'
      ORDER BY NOMBRES, APELLIDOS
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
            ? `TBL_CITAS.${columnaEspecialidad}`
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
            e.ID_ESPECIALIDAD,
            e.NOMBRE_ESPECIALIDAD,
            e.DESCRIPCION,
            e.ESTADO
          FROM TBL_DOCTOR_ESPECIALIDAD de
          INNER JOIN TBL_ESPECIALIDADES e
            ON e.ID_ESPECIALIDAD = de.ID_ESPECIALIDAD
          WHERE de.ID_DOCTOR = ?
            AND e.ESTADO = 'ACTIVA'
          ORDER BY e.NOMBRE_ESPECIALIDAD ASC
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
            ID_CITA,
            ID_DOCTOR
          FROM TBL_CITAS
          WHERE ID_CITA = ?
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
            UPDATE TBL_CITAS
            SET
              \`${columnaEspecialidad}\` = ?,
              FECHA_MODIFICACION =
                CURRENT_TIMESTAMP,
              USUARIO_MODIFICACION = ?
            WHERE ID_CITA = ?
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
          `Asignada especialidad ${especialidadValida.NOMBRE_ESPECIALIDAD} a la cita ${idCita}`,
        modulo: "CITAS",
        idRegistro: idCita,
        tabla: "TBL_CITAS",
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
          especialidadValida.NOMBRE_ESPECIALIDAD,
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
        SELECT ID_CITA
        FROM TBL_CITAS
        WHERE ESTADO <> 'CANCELADA'
          AND (
            ID_DOCTOR = ?
            OR ID_PACIENTE = ?
          )
          AND (? < FECHA_FIN_ESTIMADA)
          AND (? > FECHA_CITA)
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
      "ID_PACIENTE",
      "ID_DOCTOR",
      "FECHA_CITA",
      "FECHA_FIN_ESTIMADA",
      "DURACION_ESTIMADA_MIN",
      "MOTIVO_CONSULTA",
      "ESTADO",
      "TIPO_CITA",
      "PRIORIDAD",
      "CANAL_REGISTRO",
      "ID_USUARIOCREADOR",
      "USUARIO_CREACION",
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
        INSERT INTO TBL_CITAS (
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
        `especialidad ${especialidadValida.NOMBRE_ESPECIALIDAD}, estado ${estadoInicial}`,
      modulo: "CITAS",
      idRegistro: idCitaCreada,
      tabla: "TBL_CITAS",
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
            especialidadValida.NOMBRE_ESPECIALIDAD,
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
        especialidadValida.NOMBRE_ESPECIALIDAD,
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
      tabla: "TBL_CITAS",
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
        SELECT ID_CITA
        FROM TBL_CITAS
        WHERE ESTADO <> 'CANCELADA'
          AND ID_CITA <> ?
          AND (
            ID_DOCTOR = ?
            OR ID_PACIENTE = ?
          )
          AND (? < FECHA_FIN_ESTIMADA)
          AND (? > FECHA_CITA)
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
      "ID_PACIENTE = ?",
      "ID_DOCTOR = ?",
      "FECHA_CITA = ?",
      "FECHA_FIN_ESTIMADA = ?",
      "DURACION_ESTIMADA_MIN = ?",
      "MOTIVO_CONSULTA = ?",
      "TIPO_CITA = ?",
      "PRIORIDAD = ?",
      "CANAL_REGISTRO = ?",
      "ESTADO = ?",
      "FECHA_MODIFICACION = CURRENT_TIMESTAMP",
      "USUARIO_MODIFICACION = ?",
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
        UPDATE TBL_CITAS
        SET ${asignaciones.join(",\n            ")}
        WHERE ID_CITA = ?
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
        `Editada cita ID ${id}; especialidad ${especialidadValida.NOMBRE_ESPECIALIDAD}`,
      modulo: "CITAS",
      idRegistro: id,
      tabla: "TBL_CITAS",
      estado: "EXITO",
      req,
    });

    return res.json({
      success: true,
      message: "Cita actualizada correctamente.",
      idCita: id,
      idEspecialidad,
      especialidad:
        especialidadValida.NOMBRE_ESPECIALIDAD,
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
      tabla: "TBL_CITAS",
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
        UPDATE TBL_CITAS
        SET
          ESTADO = ?,
          FECHA_MODIFICACION = CURRENT_TIMESTAMP,
          USUARIO_MODIFICACION = ?
        WHERE ID_CITA = ?
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
      tabla: "TBL_CITAS",
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
      tabla: "TBL_CITAS",
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
            c.ID_CITA,
            c.ID_PACIENTE,
            c.ID_DOCTOR,
            c.ESTADO,
            CONCAT(
              p.NOMBRES,
              ' ',
              p.APELLIDOS
            ) AS NOMBRE_PACIENTE
          FROM TBL_CITAS c
          INNER JOIN TBL_PACIENTE p
            ON p.ID_PACIENTE = c.ID_PACIENTE
          WHERE c.ID_CITA = ?
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
            ID_PRECLINICA,
            TEMPERATURA,
            PRESION_SISTOLICA,
            PRESION_DIASTOLICA,
            FRECUENCIA_CARDIACA,
            FRECUENCIA_RESPIRATORIA,
            SATURACION_OXIGENO,
            PESO,
            TALLA,
            SIGNOS_VITALES_JSON
          FROM TBL_PRECLINICA
          WHERE ID_CITA = ?
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
            UPDATE TBL_CITAS
            SET
              ESTADO = 'CONSULTA_MEDICA',
              FECHA_MODIFICACION = CURRENT_TIMESTAMP,
              USUARIO_MODIFICACION = ?
            WHERE ID_CITA = ?
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
        tabla: "TBL_CITAS",
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
        SELECT ID_CITA, ESTADO
        FROM TBL_CITAS
        WHERE ID_CITA = ?
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
        DELETE FROM TBL_CITAS
        WHERE ID_CITA = ?
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
      tabla: "TBL_CITAS",
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
      tabla: "TBL_CITAS",
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
