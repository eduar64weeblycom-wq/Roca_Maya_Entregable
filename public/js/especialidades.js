(() => {
  "use strict";

  const API_URL = "/especialidades/api/datos";
  const CREAR_URL = "/especialidades/nueva";
  const ACTUALIZAR_URL = (id) => `/especialidades/actualizar/${id}`;
  const CAMBIAR_ESTADO_URL = "/especialidades/cambiar-estado";
  const ELIMINAR_URL = (id) => `/especialidades/eliminar/${id}`;

  const ICONOS_DISPONIBLES = [
    "fas fa-stethoscope",
    "fas fa-user-doctor",
    "fas fa-heart-pulse",
    "fas fa-heartbeat",
    "fas fa-brain",
    "fas fa-lungs",
    "fas fa-eye",
    "fas fa-tooth",
    "fas fa-baby",
    "fas fa-person-pregnant",
    "fas fa-bone",
    "fas fa-hand-dots",
    "fas fa-x-ray",
    "fas fa-syringe",
    "fas fa-pills",
    "fas fa-hospital",
    "fas fa-wheelchair",
    "fas fa-microscope"
  ];

  let especialidadesData = [];
  let especialidadesFiltradas = [];
  let currentEspecialidadId = null;
  let debounceFiltrosTimer = null;

  const alertTimers = new Map();
  const $ = (id) => document.getElementById(id);

  /* ==========================================================
     UTILIDADES GENERALES
  ========================================================== */

  function normalizarTexto(valor) {
    return String(valor ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function coincideBusquedaPorTerminos(texto, busqueda) {
    const textoNormalizado = normalizarTexto(texto);
    const terminos = normalizarTexto(busqueda)
      .split(" ")
      .filter(Boolean);

    return (
      terminos.length === 0 ||
      terminos.every((termino) =>
        textoNormalizado.includes(termino)
      )
    );
  }

  function escaparHTML(valor) {
    return String(valor ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escaparAtributo(valor) {
    return escaparHTML(valor).replace(/`/g, "&#096;");
  }

  function arraySeguro(valor) {
    return Array.isArray(valor) ? valor : [];
  }

  function idsIguales(a, b) {
    return String(a ?? "") === String(b ?? "");
  }

  function compararTexto(a, b) {
    return String(a ?? "").localeCompare(String(b ?? ""), "es", {
      sensitivity: "base",
      numeric: true
    });
  }

  function colorSeguro(color) {
    const valor = String(color || "").trim();

    return /^#[0-9a-fA-F]{6}$/.test(valor)
      ? valor
      : "#3498DB";
  }

  function iconoSeguro(icono) {
    const valor = String(icono || "").trim();

    return /^[a-zA-Z0-9\s-]+$/.test(valor)
      ? valor
      : "fas fa-stethoscope";
  }

  function estadoEspecialidadSeguro(estado) {
    return String(estado || "ACTIVA").toUpperCase() === "INACTIVA"
      ? "INACTIVA"
      : "ACTIVA";
  }

  function iniciales(nombreCompleto) {
    const partes = String(nombreCompleto || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    if (partes.length === 0) {
      return "--";
    }

    if (partes.length === 1) {
      return partes[0].slice(0, 2).toUpperCase();
    }

    return `${partes[0][0]}${partes[partes.length - 1][0]}`.toUpperCase();
  }

  function nombreCompletoPaciente(paciente) {
    const directo =
      paciente.NOMBRE_COMPLETO ||
      paciente.NOMBRE_PACIENTE ||
      paciente.nombreCompleto;

    if (directo) {
      return String(directo).trim();
    }

    return `${paciente.NOMBRES || paciente.nombres || ""} ${
      paciente.APELLIDOS || paciente.apellidos || ""
    }`.trim();
  }

  function claveDoctor(doctor) {
    return String(
      doctor.ID_DOCTOR ??
        doctor.ID_USUARIO ??
        doctor.idDoctor ??
        `${doctor.NOMBRE_DOCTOR || doctor.NOMBRE_USUARIO || ""}|${
          doctor.CORREO_DOCTOR || doctor.CORREO_ELECTRONICO || ""
        }`
    );
  }

  function clavePaciente(paciente) {
    return String(
      paciente.ID_PACIENTE ??
        paciente.idPaciente ??
        `${nombreCompletoPaciente(paciente)}|${
          paciente.NUMERO_DOCUMENTO_IDENTIDAD ||
          paciente.identidad ||
          ""
        }`
    );
  }

  function pacientesUnicos(pacientes) {
    const mapa = new Map();

    arraySeguro(pacientes).forEach((paciente) => {
      mapa.set(clavePaciente(paciente), paciente);
    });

    return [...mapa.values()].sort((a, b) => {
      const apellidoA =
        a.APELLIDOS ||
        a.apellidos ||
        nombreCompletoPaciente(a);

      const apellidoB =
        b.APELLIDOS ||
        b.apellidos ||
        nombreCompletoPaciente(b);

      const porApellido = compararTexto(apellidoA, apellidoB);

      return porApellido !== 0
        ? porApellido
        : compararTexto(
            nombreCompletoPaciente(a),
            nombreCompletoPaciente(b)
          );
    });
  }

  function doctoresUnicos(doctores) {
    const mapa = new Map();

    arraySeguro(doctores).forEach((doctor) => {
      mapa.set(claveDoctor(doctor), doctor);
    });

    return [...mapa.values()].sort((a, b) =>
      compararTexto(a.NOMBRE_DOCTOR, b.NOMBRE_DOCTOR)
    );
  }

  async function leerJsonRespuesta(response) {
    const texto = await response.text();

    if (!texto) {
      return {};
    }

    try {
      return JSON.parse(texto);
    } catch {
      return {
        message: texto
      };
    }
  }

  function fechaActualFormateada() {
    return new Date().toLocaleString("es-HN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  }

  /* ==========================================================
     NORMALIZACIÓN DE DATOS DEL BACKEND
  ========================================================== */

  function normalizarPaciente(paciente) {
    return {
      ID_PACIENTE:
        paciente.ID_PACIENTE ??
        paciente.idPaciente ??
        paciente.id ??
        null,

      NOMBRES:
        paciente.NOMBRES ??
        paciente.nombres ??
        "",

      APELLIDOS:
        paciente.APELLIDOS ??
        paciente.apellidos ??
        "",

      NOMBRE_COMPLETO:
        nombreCompletoPaciente(paciente),

      CORREO_ELECTRONICO:
        paciente.CORREO_ELECTRONICO ??
        paciente.CORREO_PACIENTE ??
        paciente.correo ??
        "",

      TELEFONO:
        paciente.TELEFONO ??
        paciente.TELEFONO_PACIENTE ??
        paciente.telefono ??
        "",

      NUMERO_DOCUMENTO_IDENTIDAD:
        paciente.NUMERO_DOCUMENTO_IDENTIDAD ??
        paciente.IDENTIDAD_PACIENTE ??
        paciente.identidad ??
        "",

      ESTADO:
        paciente.ESTADO ??
        paciente.estado ??
        "ACTIVO",

      ID_ESPECIALIDAD_CLASIFICACION:
        paciente.ID_ESPECIALIDAD_CLASIFICACION ??
        paciente.idEspecialidadClasificacion ??
        null,

      NOMBRE_ESPECIALIDAD_CLASIFICACION:
        paciente.NOMBRE_ESPECIALIDAD_CLASIFICACION ??
        paciente.nombreEspecialidadClasificacion ??
        "",

      ESPECIALIDADES_DOCTOR:
        paciente.ESPECIALIDADES_DOCTOR ??
        paciente.especialidadesDoctor ??
        "",

      ESPECIALIDAD_CITA_DETERMINADA:
        paciente.ESPECIALIDAD_CITA_DETERMINADA === true,

      TIPO_CLASIFICACION_ESPECIALIDAD:
        paciente.TIPO_CLASIFICACION_ESPECIALIDAD ??
        paciente.tipoClasificacionEspecialidad ??
        ""
    };
  }

  function normalizarDoctor(
    doctor,
    pacientesGlobales,
    idEspecialidad
  ) {
    const idDoctor =
      doctor.ID_DOCTOR ??
      doctor.ID_USUARIO ??
      doctor.idDoctor ??
      doctor.id;

    let pacientes = arraySeguro(
      doctor.pacientes ||
        doctor.PACIENTES ||
        doctor.listaPacientes
    );

    if (pacientes.length === 0 && pacientesGlobales.length > 0) {
      pacientes = pacientesGlobales.filter((paciente) => {
        const coincideDoctor = idsIguales(
          paciente.ID_DOCTOR ?? paciente.idDoctor,
          idDoctor
        );

        const idEspecialidadPaciente =
          paciente.ID_ESPECIALIDAD ??
          paciente.idEspecialidad;

        const coincideEspecialidad =
          idEspecialidadPaciente != null &&
          idsIguales(
            idEspecialidadPaciente,
            idEspecialidad
          );

        return coincideDoctor && coincideEspecialidad;
      });
    }

    const pacientesNormalizados = pacientesUnicos(
      pacientes.map(normalizarPaciente)
    );

    return {
      ID_DOCTOR: idDoctor,

      NOMBRE_DOCTOR:
        doctor.NOMBRE_DOCTOR ??
        doctor.NOMBRE_USUARIO ??
        doctor.NOMBRE ??
        doctor.nombre ??
        "Médico sin nombre",

      CORREO_DOCTOR:
        doctor.CORREO_DOCTOR ??
        doctor.CORREO_ELECTRONICO ??
        doctor.correo ??
        "",

      TELEFONO_DOCTOR:
        doctor.TELEFONO_DOCTOR ??
        doctor.TELEFONO ??
        doctor.TELEFONO_USUARIO ??
        doctor.telefono ??
        "",

      ESTADO_DOCTOR:
        doctor.ESTADO_DOCTOR ??
        doctor.ESTADO ??
        doctor.estado ??
        "ACTIVO",

      ID_ESPECIALIDAD: idEspecialidad,

      TOTAL_ESPECIALIDADES_DOCTOR:
        Number(
          doctor.TOTAL_ESPECIALIDADES_DOCTOR ??
          doctor.totalEspecialidadesDoctor ??
          1
        ) || 1,

      ESPECIALIDADES_DOCTOR:
        doctor.ESPECIALIDADES_DOCTOR ??
        doctor.especialidadesDoctor ??
        "",

      ID_ESPECIALIDAD_REFERENCIA:
        doctor.ID_ESPECIALIDAD_REFERENCIA ??
        doctor.idEspecialidadReferencia ??
        idEspecialidad,

      NOMBRE_ESPECIALIDAD_REFERENCIA:
        doctor.NOMBRE_ESPECIALIDAD_REFERENCIA ??
        doctor.nombreEspecialidadReferencia ??
        "",

      ES_ESPECIALIDAD_REFERENCIA:
        doctor.ES_ESPECIALIDAD_REFERENCIA !== false,

      PACIENTES_EN_ESPECIALIDAD_REFERENCIA:
        doctor.PACIENTES_EN_ESPECIALIDAD_REFERENCIA === true,

      pacientes: pacientesNormalizados,

      CANTIDAD_PACIENTES:
        doctor.CANTIDAD_PACIENTES ??
        pacientesNormalizados.length
    };
  }

  function normalizarRespuestaAPI(payload) {
    const especialidadesRaw = arraySeguro(
      payload.especialidades ||
        payload.data ||
        payload.resultados
    );

    const doctoresGlobales = arraySeguro(
      payload.doctores ||
        payload.medicos ||
        payload.doctors
    );

    const pacientesGlobales = arraySeguro(
      payload.pacientes
    );

    return especialidadesRaw
      .map((especialidad) => {
        const idEspecialidad =
          especialidad.ID_ESPECIALIDAD ??
          especialidad.idEspecialidad ??
          especialidad.id;

        let doctores = arraySeguro(
          especialidad.medicos ||
            especialidad.doctores ||
            especialidad.DOCTORES
        );

        if (
          doctores.length === 0 &&
          doctoresGlobales.length > 0
        ) {
          doctores = doctoresGlobales.filter((doctor) =>
            idsIguales(
              doctor.ID_ESPECIALIDAD ??
                doctor.idEspecialidad,
              idEspecialidad
            )
          );
        }

        const medicosNormalizados = doctoresUnicos(
          doctores
            .map((doctor) =>
              normalizarDoctor(
                doctor,
                pacientesGlobales,
                idEspecialidad
              )
            )
            .filter((doctor) => {
              const idDoctor = Number(
                doctor.ID_DOCTOR
              );

              return (
                Number.isInteger(idDoctor) &&
                idDoctor > 0 &&
                idsIguales(
                  doctor.ID_ESPECIALIDAD,
                  idEspecialidad
                )
              );
            })
        );

        return {
          ID_ESPECIALIDAD: idEspecialidad,

          NOMBRE_ESPECIALIDAD:
            especialidad.NOMBRE_ESPECIALIDAD ??
            especialidad.nombreEspecialidad ??
            especialidad.nombre ??
            "Especialidad sin nombre",

          DESCRIPCION:
            especialidad.DESCRIPCION ??
            especialidad.descripcion ??
            "",

          COLOR_HEXADECIMAL:
            colorSeguro(
              especialidad.COLOR_HEXADECIMAL ??
                especialidad.color
            ),

          ICONO:
            iconoSeguro(
              especialidad.ICONO ??
                especialidad.icono
            ),

          ESTADO:
            estadoEspecialidadSeguro(
              especialidad.ESTADO ??
                especialidad.estado
            ),

          medicos: medicosNormalizados
        };
      })
      .sort((a, b) =>
        compararTexto(
          a.NOMBRE_ESPECIALIDAD,
          b.NOMBRE_ESPECIALIDAD
        )
      );
  }

  /* ==========================================================
     CARGA DE DATOS
  ========================================================== */

  function establecerCargando(cargando) {
    const loadingState = $("loadingState");
    const estadoCargaTexto = $("estadoCargaTexto");

    if (loadingState) {
      loadingState.hidden = !cargando;
    }

    if (estadoCargaTexto) {
      estadoCargaTexto.textContent = cargando
        ? "Actualizando información"
        : "Información actualizada";
    }
  }

  async function cargarDatosReales() {
    establecerCargando(true);

    const grid = $("especialidadesGrid");
    const emptyState = $("emptyState");

    if (grid) {
      grid.innerHTML = "";
    }

    if (emptyState) {
      emptyState.hidden = true;
    }

    try {
      const response = await fetch(API_URL, {
        method: "GET",
        headers: {
          Accept: "application/json"
        },
        cache: "no-store"
      });

      const payload = await leerJsonRespuesta(response);

      if (!response.ok) {
        throw new Error(
          payload.message ||
            payload.error ||
            `Error HTTP ${response.status}`
        );
      }

      especialidadesData =
        normalizarRespuestaAPI(payload);

      aplicarFiltros();
    } catch (error) {
      console.error(
        "Error cargando especialidades:",
        error
      );

      especialidadesData = [];
      especialidadesFiltradas = [];

      renderizarEspecialidades([]);

      mostrarMensaje(
        "error",
        `No se pudo cargar la información: ${error.message}`
      );
    } finally {
      establecerCargando(false);
    }
  }

  /* ==========================================================
     FILTROS
  ========================================================== */

  function aplicarFiltros() {
    const filtroEspecialidad = normalizarTexto(
      $("filterNombre")?.value
    );

    const filtroDoctor = normalizarTexto(
      $("filterDoctor")?.value
    );

    const filtroEstado = String(
      $("filterEstado")?.value || ""
    ).toUpperCase();

    especialidadesFiltradas = especialidadesData
      .filter((especialidad) => {
        const textoEspecialidad = normalizarTexto(
          `${especialidad.NOMBRE_ESPECIALIDAD} ${especialidad.DESCRIPCION}`
        );

        const coincideEspecialidad =
          coincideBusquedaPorTerminos(
            textoEspecialidad,
            filtroEspecialidad
          );

        const coincideEstado =
          !filtroEstado ||
          especialidad.ESTADO === filtroEstado;

        return (
          coincideEspecialidad &&
          coincideEstado
        );
      })
      .map((especialidad) => {
        const medicosFiltrados =
          especialidad.medicos.filter((doctor) => {
            if (!filtroDoctor) {
              return true;
            }

            const textoDoctor = normalizarTexto(
              `medico doctor dr ${doctor.ID_DOCTOR} ` +
              `${doctor.NOMBRE_DOCTOR} ${doctor.CORREO_DOCTOR} ` +
              `${doctor.TELEFONO_DOCTOR}`
            );

            return coincideBusquedaPorTerminos(
              textoDoctor,
              filtroDoctor
            );
          });

        return {
          ...especialidad,
          medicos: medicosFiltrados
        };
      })
      .filter(
        (especialidad) =>
          !filtroDoctor ||
          especialidad.medicos.length > 0
      );

    actualizarEnlaceExcel();

    renderizarEspecialidades(
      especialidadesFiltradas
    );
  }

  function actualizarEnlaceExcel() {
    const enlace = $("btnDescargarExcel");

    if (!enlace) {
      return;
    }

    const parametros = new URLSearchParams();

    const especialidad = String(
      $("filterNombre")?.value || ""
    ).trim();

    const doctor = String(
      $("filterDoctor")?.value || ""
    ).trim();

    const estado = String(
      $("filterEstado")?.value || ""
    ).trim();

    if (especialidad) {
      parametros.set(
        "especialidad",
        especialidad
      );
    }

    if (doctor) {
      parametros.set(
        "doctor",
        doctor
      );
    }

    if (estado) {
      parametros.set(
        "estado",
        estado
      );
    }

    const consulta = parametros.toString();

    enlace.href = consulta
      ? `/especialidades/excel?${consulta}`
      : "/especialidades/excel";
  }

  function programarFiltros() {
    window.clearTimeout(debounceFiltrosTimer);

    debounceFiltrosTimer = window.setTimeout(
      aplicarFiltros,
      250
    );
  }

  function limpiarFiltros() {
    if ($("filterNombre")) {
      $("filterNombre").value = "";
    }

    if ($("filterDoctor")) {
      $("filterDoctor").value = "";
    }

    if ($("filterEstado")) {
      $("filterEstado").value = "";
    }

    aplicarFiltros();
  }

  /* ==========================================================
     ESTADÍSTICAS
  ========================================================== */

  function obtenerPacientesDeEspecialidad(
    especialidad
  ) {
    return pacientesUnicos(
      especialidad.medicos.flatMap(
        (doctor) => doctor.pacientes
      )
    );
  }

  function actualizarEstadisticas(lista) {
    const doctores = new Map();
    const pacientes = new Map();

    lista.forEach((especialidad) => {
      especialidad.medicos.forEach((doctor) => {
        doctores.set(
          claveDoctor(doctor),
          doctor
        );

        doctor.pacientes.forEach((paciente) => {
          pacientes.set(
            clavePaciente(paciente),
            paciente
          );
        });
      });
    });

    if ($("totalEspecialidades")) {
      $("totalEspecialidades").textContent =
        lista.length;
    }

    if ($("totalDoctores")) {
      $("totalDoctores").textContent =
        doctores.size;
    }

    if ($("totalPacientes")) {
      $("totalPacientes").textContent =
        pacientes.size;
    }

    if ($("especialidadesActivas")) {
      $("especialidadesActivas").textContent =
        lista.filter(
          (especialidad) =>
            especialidad.ESTADO === "ACTIVA"
        ).length;
    }

    if ($("totalRegistros")) {
      $("totalRegistros").textContent =
        especialidadesData.length;
    }

    if ($("registrosMostrados")) {
      $("registrosMostrados").textContent =
        lista.length;
    }

    if ($("ultimaActualizacion")) {
      $("ultimaActualizacion").textContent =
        fechaActualFormateada();
    }

    if ($("estadoCargaTexto")) {
      $("estadoCargaTexto").textContent =
        `${lista.length} especialidad${
          lista.length === 1 ? "" : "es"
        } mostrada${
          lista.length === 1 ? "" : "s"
        }`;
    }
  }

  /* ==========================================================
     RENDER PRINCIPAL
  ========================================================== */

  function renderizarEspecialidades(lista) {
    const grid = $("especialidadesGrid");
    const emptyState = $("emptyState");

    actualizarEstadisticas(lista);
    actualizarTablaCompatibilidad(lista);

    if (!grid) {
      return;
    }

    if (lista.length === 0) {
      grid.innerHTML = "";

      if (emptyState) {
        emptyState.hidden = false;
      }

      return;
    }

    if (emptyState) {
      emptyState.hidden = true;
    }

    grid.innerHTML = lista
      .map(generarTarjetaEspecialidad)
      .join("");
  }

  function generarTarjetaEspecialidad(
    especialidad
  ) {
    const id = especialidad.ID_ESPECIALIDAD;
    const activa =
      especialidad.ESTADO === "ACTIVA";

    const pacientesEspecialidad =
      obtenerPacientesDeEspecialidad(
        especialidad
      );

    return `
      <article
        class="especialidad-card ${
          activa ? "" : "inactiva"
        }"
        style="--especialidad-color: ${escaparAtributo(
          especialidad.COLOR_HEXADECIMAL
        )};"
        data-especialidad-id="${escaparAtributo(
          id
        )}"
      >

        <header class="especialidad-card-header">

          <div class="especialidad-heading">

            <div
              class="especialidad-icono"
              aria-hidden="true"
            >
              <i class="${escaparAtributo(
                especialidad.ICONO
              )}"></i>
            </div>

            <div class="especialidad-info">

              <h3 class="especialidad-nombre">
                ${escaparHTML(
                  especialidad.NOMBRE_ESPECIALIDAD
                )}
              </h3>

              <p class="especialidad-descripcion">
                ${escaparHTML(
                  especialidad.DESCRIPCION ||
                    "Sin descripción registrada."
                )}
              </p>

            </div>

          </div>

          <div class="especialidad-header-actions">

            <span
              class="estado-badge ${
                activa ? "activa" : "inactiva"
              }"
            >
              <i
                class="fas ${
                  activa
                    ? "fa-circle-check"
                    : "fa-circle-xmark"
                }"
                aria-hidden="true"
              ></i>

              ${escaparHTML(
                especialidad.ESTADO
              )}
            </span>

            <div
              class="especialidad-action-menu"
              aria-label="Acciones de especialidad"
            >

              <button
                type="button"
                class="btn-icon edit"
                data-action="editar"
                data-id="${escaparAtributo(id)}"
                title="Editar especialidad"
                aria-label="Editar ${escaparAtributo(
                  especialidad.NOMBRE_ESPECIALIDAD
                )}"
              >
                <i
                  class="fas fa-pen"
                  aria-hidden="true"
                ></i>
              </button>

              <button
                type="button"
                class="btn-icon ${
                  activa ? "danger" : "success"
                }"
                data-action="cambiar-estado"
                data-id="${escaparAtributo(id)}"
                title="${
                  activa
                    ? "Inactivar"
                    : "Activar"
                } especialidad"
                aria-label="${
                  activa
                    ? "Inactivar"
                    : "Activar"
                } ${escaparAtributo(
                  especialidad.NOMBRE_ESPECIALIDAD
                )}"
              >
                <i
                  class="fas ${
                    activa
                      ? "fa-toggle-off"
                      : "fa-toggle-on"
                  }"
                  aria-hidden="true"
                ></i>
              </button>

              <button
                type="button"
                class="btn-icon danger"
                data-action="eliminar"
                data-id="${escaparAtributo(id)}"
                title="Eliminar especialidad"
                aria-label="Eliminar ${escaparAtributo(
                  especialidad.NOMBRE_ESPECIALIDAD
                )}"
              >
                <i
                  class="fas fa-trash"
                  aria-hidden="true"
                ></i>
              </button>

            </div>

          </div>

        </header>

        <div class="especialidad-metricas">

          <div class="especialidad-metrica">

            <div
              class="metrica-icono"
              aria-hidden="true"
            >
              <i class="fas fa-user-doctor"></i>
            </div>

            <div class="metrica-info">

              <span class="metrica-valor">
                ${especialidad.medicos.length}
              </span>

              <span class="metrica-etiqueta">
                ${
                  especialidad.medicos.length === 1
                    ? "Médico asignado"
                    : "Médicos asignados"
                }
              </span>

            </div>

          </div>

          <div class="especialidad-metrica">

            <div
              class="metrica-icono"
              aria-hidden="true"
            >
              <i class="fas fa-hospital-user"></i>
            </div>

            <div class="metrica-info">

              <span class="metrica-valor">
                ${pacientesEspecialidad.length}
              </span>

              <span class="metrica-etiqueta">
                Pacientes asociados
              </span>

            </div>

          </div>

        </div>

        <section class="medicos-seccion">

          <div class="medicos-seccion-header">

            <h4>
              <i
                class="fas fa-user-doctor"
                aria-hidden="true"
              ></i>

              Médicos de la especialidad
            </h4>

            <span class="medicos-total-badge">
              ${especialidad.medicos.length}
              registrado${
                especialidad.medicos.length === 1
                  ? ""
                  : "s"
              }
            </span>

          </div>

          ${generarListadoMedicos(
            especialidad
          )}

        </section>

      </article>
    `;
  }

  function generarListadoMedicos(
    especialidad
  ) {
    if (especialidad.medicos.length === 0) {
      return `
        <div class="sin-medicos">

          <i
            class="fas fa-user-doctor"
            aria-hidden="true"
          ></i>

          <strong>
            No hay médicos para mostrar
          </strong>

          <span>
            Esta especialidad no tiene médicos asignados
            o no coincide con el filtro.
          </span>

        </div>
      `;
    }

    return `
      <div class="medicos-grid">

        ${especialidad.medicos
          .map((doctor) =>
            generarTarjetaDoctor(
              doctor,
              especialidad.ID_ESPECIALIDAD
            )
          )
          .join("")}

      </div>
    `;
  }

  function generarTarjetaDoctor(
    doctor,
    idEspecialidad
  ) {
    const pacientes = pacientesUnicos(
      doctor.pacientes
    );

    const idDoctor = doctor.ID_DOCTOR;

    const nombreDoctor =
      doctor.NOMBRE_DOCTOR ||
      "Médico sin nombre";

    const estadoDoctor = String(
      doctor.ESTADO_DOCTOR || "ACTIVO"
    ).toUpperCase();

    const doctorActivo =
      estadoDoctor === "ACTIVO" ||
      estadoDoctor === "ACTIVA";

    const panelId =
      `pacientes-${idEspecialidad}-${idDoctor}`;

    return `
      <article
        class="doctor-card"
        data-doctor-id="${escaparAtributo(
          idDoctor
        )}"
        data-especialidad-id="${escaparAtributo(
          idEspecialidad
        )}"
      >

        <div class="doctor-card-main">

          <div
            class="doctor-avatar"
            aria-hidden="true"
          >
            ${escaparHTML(
              iniciales(nombreDoctor)
            )}
          </div>

          <div class="doctor-info">

            <div class="doctor-identificador">
              <i
                class="fas fa-id-badge"
                aria-hidden="true"
              ></i>
              Médico #${escaparHTML(idDoctor)}
            </div>

            <h5 class="doctor-nombre">
              ${escaparHTML(nombreDoctor)}
            </h5>

            <div class="doctor-contactos">

              <p class="doctor-contacto">
                <i
                  class="fas fa-envelope"
                  aria-hidden="true"
                ></i>
                <span>
                  ${escaparHTML(
                    doctor.CORREO_DOCTOR ||
                      "Correo no registrado"
                  )}
                </span>
              </p>

              <p class="doctor-contacto">
                <i
                  class="fas fa-phone"
                  aria-hidden="true"
                ></i>
                <span>
                  ${escaparHTML(
                    doctor.TELEFONO_DOCTOR ||
                      "Teléfono no registrado"
                  )}
                </span>
              </p>

            </div>

            ${
              doctor.PACIENTES_EN_ESPECIALIDAD_REFERENCIA
                ? `
                  <p class="doctor-especialidades-nota">
                    <i
                      class="fas fa-layer-group"
                      aria-hidden="true"
                    ></i>
                    Este médico también pertenece a otras especialidades.
                    Para evitar pacientes duplicados, su listado se muestra
                    únicamente en ${escaparHTML(
                      doctor.NOMBRE_ESPECIALIDAD_REFERENCIA ||
                        "la especialidad de referencia"
                    )}.
                  </p>
                `
                : Number(doctor.TOTAL_ESPECIALIDADES_DOCTOR || 1) > 1
                  ? `
                    <p class="doctor-especialidades-nota">
                      <i
                        class="fas fa-layer-group"
                        aria-hidden="true"
                      ></i>
                      Especialidad de referencia para mostrar los pacientes
                      de este médico sin repetirlos en las demás asignaciones.
                    </p>
                  `
                  : ""
            }

          </div>

          <div class="doctor-resumen">

            <span
              class="estado-badge ${
                doctorActivo
                  ? "activa"
                  : "inactiva"
              }"
            >
              ${escaparHTML(estadoDoctor)}
            </span>

            ${
              doctor.PACIENTES_EN_ESPECIALIDAD_REFERENCIA
                ? `
                  <div
                    class="doctor-cantidad referencia"
                    title="Pacientes mostrados en la especialidad de referencia"
                  >
                    <strong>—</strong>
                    <span>sin duplicar</span>
                  </div>

                  <div class="doctor-referencia-pacientes">
                    <i
                      class="fas fa-circle-info"
                      aria-hidden="true"
                    ></i>
                    <span>
                      Pacientes disponibles en
                      <strong>${escaparHTML(
                        doctor.NOMBRE_ESPECIALIDAD_REFERENCIA ||
                          "la especialidad de referencia"
                      )}</strong>.
                    </span>
                  </div>
                `
                : `
                  <div
                    class="doctor-cantidad"
                    title="Pacientes asociados"
                  >
                    <strong>
                      ${pacientes.length}
                    </strong>

                    <span>
                      paciente${
                        pacientes.length === 1
                          ? ""
                          : "s"
                      }
                    </span>
                  </div>

                  <button
                    type="button"
                    class="btn-toggle-pacientes"
                    data-action="ver-pacientes"
                    data-target="${escaparAtributo(
                      panelId
                    )}"
                    aria-expanded="false"
                    aria-controls="${escaparAtributo(
                      panelId
                    )}"
                  >
                    <span>Ver pacientes</span>

                    <i
                      class="fas fa-chevron-down"
                      aria-hidden="true"
                    ></i>
                  </button>
                `
            }

          </div>

        </div>

        ${
          doctor.PACIENTES_EN_ESPECIALIDAD_REFERENCIA
            ? ""
            : `
              <div
                id="${escaparAtributo(panelId)}"
                class="pacientes-panel"
                aria-hidden="true"
              >
                ${generarPanelPacientes(
                  pacientes
                )}
              </div>
            `
        }

      </article>
    `;
  }

  function generarPanelPacientes(
    pacientes
  ) {
    if (pacientes.length === 0) {
      return `
        <div class="sin-pacientes">

          <i
            class="fas fa-hospital-user"
            aria-hidden="true"
          ></i>

          <strong>
            Sin pacientes asociados
          </strong>

          <span>
            Este médico todavía no tiene pacientes
            registrados mediante citas.
          </span>

        </div>
      `;
    }

    return `
      <div class="pacientes-panel-inner">

        <header class="pacientes-panel-header">

          <h5>
            <i
              class="fas fa-users"
              aria-hidden="true"
            ></i>

            Pacientes del médico
          </h5>

          <span>
            Orden alfabético · Solo lectura
          </span>

        </header>

        <div class="pacientes-lista">

          ${pacientes
            .map(generarFilaPaciente)
            .join("")}

        </div>

      </div>
    `;
  }

  function generarFilaPaciente(
    paciente
  ) {
    const nombre =
      paciente.NOMBRE_COMPLETO ||
      nombreCompletoPaciente(paciente);

    const documento =
      paciente.NUMERO_DOCUMENTO_IDENTIDAD ||
      "Documento no registrado";

    const correo =
      paciente.CORREO_ELECTRONICO ||
      "Correo no registrado";

    const telefono =
      paciente.TELEFONO ||
      "Teléfono no registrado";

    const especialidadClasificacion =
      paciente.NOMBRE_ESPECIALIDAD_CLASIFICACION ||
      "Especialidad no determinada";

    const especialidadesDoctor =
      String(
        paciente.ESPECIALIDADES_DOCTOR ||
        especialidadClasificacion
      )
        .split("|")
        .map((item) => item.trim())
        .filter(Boolean)
        .join(" · ");

    const clasificacionExacta =
      paciente.ESPECIALIDAD_CITA_DETERMINADA === true;

    const textoCriterio =
      clasificacionExacta
        ? "Especialidad única del médico"
        : "Clasificación técnica del directorio";

    return `
      <div class="paciente-row">

        <div
          class="paciente-avatar"
          aria-hidden="true"
        >
          ${escaparHTML(iniciales(nombre))}
        </div>

        <div class="paciente-info">

          <p class="paciente-nombre">
            ${escaparHTML(nombre)}
          </p>

          <p class="paciente-documento">
            ${escaparHTML(documento)}
          </p>

        </div>

        <div class="paciente-contacto">

          <span title="Correo electrónico">

            <i
              class="fas fa-envelope"
              aria-hidden="true"
            ></i>

            ${escaparHTML(correo)}

          </span>

          <span title="Teléfono">

            <i
              class="fas fa-phone"
              aria-hidden="true"
            ></i>

            ${escaparHTML(telefono)}

          </span>

        </div>

        <div class="paciente-especialidad">

          <div class="paciente-especialidad-principal">

            <span class="paciente-especialidad-label">
              <i
                class="fas fa-stethoscope"
                aria-hidden="true"
              ></i>
              Clasificado en
            </span>

            <strong class="paciente-especialidad-badge">
              ${escaparHTML(
                especialidadClasificacion
              )}
            </strong>

          </div>

          <div
            class="paciente-especialidad-criterio ${
              clasificacionExacta
                ? "exacta"
                : "referencia"
            }"
          >
            <i
              class="fas ${
                clasificacionExacta
                  ? "fa-circle-check"
                  : "fa-circle-info"
              }"
              aria-hidden="true"
            ></i>

            <span>
              ${escaparHTML(textoCriterio)}
            </span>
          </div>

          ${
            !clasificacionExacta &&
            especialidadesDoctor
              ? `
                <small
                  class="paciente-especialidades-doctor"
                  title="Especialidades asignadas al médico"
                >
                  <i
                    class="fas fa-layer-group"
                    aria-hidden="true"
                  ></i>
                  Especialidades del médico:
                  ${escaparHTML(
                    especialidadesDoctor
                  )}
                </small>
              `
              : ""
          }

        </div>

      </div>
    `;
  }

  function actualizarTablaCompatibilidad(
    lista
  ) {
    const tbody = $("tablaBody");

    if (!tbody) {
      return;
    }

    tbody.innerHTML = lista
      .map(
        (especialidad) => `
          <tr
            data-id="${escaparAtributo(
              especialidad.ID_ESPECIALIDAD
            )}"
          >
            <td>
              ${escaparHTML(
                especialidad.ID_ESPECIALIDAD
              )}
            </td>

            <td>
              ${escaparHTML(
                especialidad.NOMBRE_ESPECIALIDAD
              )}
            </td>

            <td>
              ${escaparHTML(
                especialidad.DESCRIPCION ||
                  "-"
              )}
            </td>

            <td>
              ${escaparHTML(
                especialidad.ICONO
              )}
            </td>

            <td>
              ${escaparHTML(
                especialidad.ESTADO
              )}
            </td>
          </tr>
        `
      )
      .join("");
  }

  /* ==========================================================
     EVENTOS DE TARJETAS
  ========================================================== */

  async function manejarClickEspecialidades(
    event
  ) {
    const boton = event.target.closest(
      "[data-action]"
    );

    if (!boton) {
      return;
    }

    const action = boton.dataset.action;

    if (action === "ver-pacientes") {
      alternarPacientes(boton);
      return;
    }

    const id = boton.dataset.id;

    const especialidad =
      especialidadesData.find((item) =>
        idsIguales(
          item.ID_ESPECIALIDAD,
          id
        )
      );

    if (!especialidad) {
      mostrarMensaje(
        "error",
        "No se encontró la especialidad seleccionada."
      );

      return;
    }

    if (action === "editar") {
      abrirModalEspecialidad(
        "editar",
        especialidad
      );

      return;
    }

    if (action === "cambiar-estado") {
      await solicitarCambioEstado(
        especialidad,
        boton
      );

      return;
    }

    if (action === "eliminar") {
      await solicitarEliminacion(
        especialidad,
        boton
      );
    }
  }

  function alternarPacientes(boton) {
    const targetId = boton.dataset.target;

    const panel = targetId
      ? document.getElementById(targetId)
      : null;

    const doctorCard = boton.closest(
      ".doctor-card"
    );

    if (!panel || !doctorCard) {
      return;
    }

    const abierto =
      panel.classList.toggle("abierto");

    doctorCard.classList.toggle(
      "expandido",
      abierto
    );

    boton.classList.toggle(
      "abierto",
      abierto
    );

    boton.setAttribute(
      "aria-expanded",
      String(abierto)
    );

    panel.setAttribute(
      "aria-hidden",
      String(!abierto)
    );

    const texto =
      boton.querySelector("span");

    if (texto) {
      texto.textContent = abierto
        ? "Ocultar pacientes"
        : "Ver pacientes";
    }
  }

  async function solicitarCambioEstado(
    especialidad,
    boton
  ) {
    const nuevoEstado =
      especialidad.ESTADO === "ACTIVA"
        ? "INACTIVA"
        : "ACTIVA";

    const verbo =
      nuevoEstado === "ACTIVA"
        ? "activar"
        : "inactivar";

    const confirmado = window.confirm(
      `¿Deseas ${verbo} la especialidad "${especialidad.NOMBRE_ESPECIALIDAD}"?`
    );

    if (!confirmado) {
      return;
    }

    establecerBotonCargando(
      boton,
      true
    );

    try {
      const response = await fetch(
        CAMBIAR_ESTADO_URL,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json"
          },
          body: JSON.stringify({
            idEspecialidad:
              especialidad.ID_ESPECIALIDAD,
            nuevoEstado
          })
        }
      );

      const payload =
        await leerJsonRespuesta(response);

      if (
        !response.ok ||
        payload.success === false
      ) {
        throw new Error(
          payload.message ||
            `No se pudo ${verbo} la especialidad.`
        );
      }

      mostrarMensaje(
        "success",
        payload.message ||
          `Especialidad ${nuevoEstado.toLowerCase()} correctamente.`
      );

      await cargarDatosReales();
    } catch (error) {
      console.error(
        "Error cambiando estado:",
        error
      );

      mostrarMensaje(
        "error",
        error.message
      );
    } finally {
      establecerBotonCargando(
        boton,
        false
      );
    }
  }

  async function solicitarEliminacion(
    especialidad,
    boton
  ) {
    const confirmado = window.confirm(
      `¿Seguro que deseas eliminar permanentemente la especialidad "${especialidad.NOMBRE_ESPECIALIDAD}"?\n\nEsta acción no se puede deshacer.`
    );

    if (!confirmado) {
      return;
    }

    establecerBotonCargando(
      boton,
      true
    );

    try {
      const response = await fetch(
        ELIMINAR_URL(
          especialidad.ID_ESPECIALIDAD
        ),
        {
          method: "DELETE",
          headers: {
            Accept: "application/json"
          }
        }
      );

      const payload =
        await leerJsonRespuesta(response);

      if (
        !response.ok ||
        payload.success === false
      ) {
        throw new Error(
          payload.message ||
            "No se pudo eliminar la especialidad. Verifique que no tenga médicos relacionados."
        );
      }

      mostrarMensaje(
        "success",
        payload.message ||
          "Especialidad eliminada correctamente."
      );

      await cargarDatosReales();
    } catch (error) {
      console.error(
        "Error eliminando especialidad:",
        error
      );

      mostrarMensaje(
        "error",
        error.message
      );
    } finally {
      establecerBotonCargando(
        boton,
        false
      );
    }
  }

  function establecerBotonCargando(
    boton,
    cargando
  ) {
    if (!boton) {
      return;
    }

    if (cargando) {
      boton.dataset.htmlOriginal =
        boton.innerHTML;

      boton.disabled = true;

      boton.innerHTML = `
        <i
          class="fas fa-spinner fa-spin"
          aria-hidden="true"
        ></i>
      `;

      return;
    }

    boton.disabled = false;

    if (boton.dataset.htmlOriginal) {
      boton.innerHTML =
        boton.dataset.htmlOriginal;

      delete boton.dataset.htmlOriginal;
    }
  }

  /* ==========================================================
     MODAL
  ========================================================== */

  function abrirModalEspecialidad(
    modo,
    especialidad = {}
  ) {
    const modal = $("modalEspecialidad");

    if (!modal) {
      return;
    }

    const esNueva = modo === "nueva";

    currentEspecialidadId = esNueva
      ? null
      : especialidad.ID_ESPECIALIDAD;

    $("modalTitle").textContent = esNueva
      ? "Nueva Especialidad"
      : "Editar Especialidad";

    $("inputNombre").value =
      especialidad.NOMBRE_ESPECIALIDAD ||
      "";

    $("textareaDescripcion").value =
      especialidad.DESCRIPCION ||
      "";

    $("inputColor").value =
      colorSeguro(
        especialidad.COLOR_HEXADECIMAL ||
          "#3498DB"
      );

    $("inputIcono").value =
      iconoSeguro(
        especialidad.ICONO ||
          "fas fa-stethoscope"
      );

    $("selectEstado").value =
      especialidad.ESTADO ||
      "ACTIVA";

    const estadoGroup =
      $("estadoGroup");

    if (estadoGroup) {
      estadoGroup.hidden = esNueva;

      estadoGroup.style.display =
        esNueva
          ? "none"
          : "block";
    }

    const guardarBtn =
      $("modalGuardarBtn");

    if (guardarBtn) {
      guardarBtn.innerHTML = esNueva
        ? `
          <i
            class="fas fa-floppy-disk"
            aria-hidden="true"
          ></i>
          Guardar
        `
        : `
          <i
            class="fas fa-floppy-disk"
            aria-hidden="true"
          ></i>
          Actualizar
        `;
    }

    actualizarContadorDescripcion();
    actualizarPreview();
    renderIconos();
    mostrarErrorModal("");

    modal.hidden = false;
    modal.style.display = "flex";

    modal.setAttribute(
      "aria-hidden",
      "false"
    );

    document.body.classList.add(
      "modal-open"
    );

    window.setTimeout(() => {
      $("inputNombre")?.focus();
    }, 80);
  }

  function cerrarModalEspecialidad() {
    const modal =
      $("modalEspecialidad");

    const form =
      $("formEspecialidad");

    if (modal) {
      modal.style.display = "none";
      modal.hidden = true;

      modal.setAttribute(
        "aria-hidden",
        "true"
      );
    }

    if (form) {
      form.reset();
    }

    currentEspecialidadId = null;

    document.body.classList.remove(
      "modal-open"
    );

    mostrarErrorModal("");

    if ($("inputColor")) {
      $("inputColor").value =
        "#3498DB";
    }

    if ($("inputIcono")) {
      $("inputIcono").value =
        "fas fa-stethoscope";
    }

    if ($("selectEstado")) {
      $("selectEstado").value =
        "ACTIVA";
    }

    actualizarContadorDescripcion();
    actualizarPreview();
    renderIconos();
  }

  function actualizarPreview() {
    const color = colorSeguro(
      $("inputColor")?.value
    );

    const icono = iconoSeguro(
      $("inputIcono")?.value
    );

    const preview =
      $("previewIcono");

    const iconElement =
      $("previewIconElement");

    if ($("colorValue")) {
      $("colorValue").textContent =
        color.toUpperCase();
    }

    if (preview) {
      preview.style.backgroundColor =
        color;
    }

    if (iconElement) {
      iconElement.className = icono;
    } else if (preview) {
      preview.innerHTML = `
        <i
          class="${escaparAtributo(
            icono
          )}"
          aria-hidden="true"
        ></i>
      `;
    }

    renderIconos();
  }

  function renderIconos() {
    const iconList =
      $("iconList");

    const iconoSeleccionado =
      iconoSeguro(
        $("inputIcono")?.value
      );

    if (!iconList) {
      return;
    }

    iconList.innerHTML =
      ICONOS_DISPONIBLES.map(
        (icono) => `
          <i
            class="${escaparAtributo(
              icono
            )} ${
              icono === iconoSeleccionado
                ? "active"
                : ""
            }"
            data-icon="${escaparAtributo(
              icono
            )}"
            role="button"
            tabindex="0"
            title="Seleccionar icono"
            aria-label="Seleccionar icono ${escaparAtributo(
              icono
            )}"
          ></i>
        `
      ).join("");
  }

  function seleccionarIcono(elemento) {
    const icono =
      elemento.dataset.icon;

    if (!icono || !$("inputIcono")) {
      return;
    }

    $("inputIcono").value =
      icono;

    actualizarPreview();
  }

  function actualizarContadorDescripcion() {
    const descripcion =
      $("textareaDescripcion")?.value ||
      "";

    if ($("contadorDescripcion")) {
      $("contadorDescripcion").textContent =
        `${descripcion.length} / 255`;
    }
  }

  async function guardarEspecialidad(
    event
  ) {
    event.preventDefault();

    const esNueva =
      currentEspecialidadId === null;

    const nombre =
      $("inputNombre")?.value.trim() ||
      "";

    const descripcion =
      $("textareaDescripcion")?.value.trim() ||
      "";

    const color =
      colorSeguro(
        $("inputColor")?.value
      );

    const icono =
      iconoSeguro(
        $("inputIcono")?.value
      );

    const estado =
      $("selectEstado")?.value ||
      "ACTIVA";

    if (!nombre) {
      mostrarErrorModal(
        "El nombre de la especialidad es obligatorio."
      );

      $("inputNombre")?.focus();

      return;
    }

    if (
      !/^[a-zA-ZÁÉÍÓÚÜÑáéíóúüñ\s-]+$/.test(
        nombre
      )
    ) {
      mostrarErrorModal(
        "El nombre solo puede contener letras, espacios y guiones."
      );

      $("inputNombre")?.focus();

      return;
    }

    if (
      descripcion &&
      !/^[a-zA-ZÁÉÍÓÚÜÑáéíóúüñ0-9\s.,;:()\/-]+$/.test(
        descripcion
      )
    ) {
      mostrarErrorModal(
        "La descripción contiene caracteres que no están permitidos."
      );

      $("textareaDescripcion")?.focus();

      return;
    }

    const boton =
      $("modalGuardarBtn");

    establecerBotonCargando(
      boton,
      true
    );

    mostrarErrorModal("");

    try {
      const response = await fetch(
        esNueva
          ? CREAR_URL
          : ACTUALIZAR_URL(
              currentEspecialidadId
            ),
        {
          method: esNueva
            ? "POST"
            : "PUT",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
            nombre,
            descripcion,
            color,
            icono,
            estado
          })
        }
      );

      const payload =
        await leerJsonRespuesta(response);

      if (
        !response.ok ||
        payload.success === false
      ) {
        throw new Error(
          payload.message ||
            `No se pudo ${
              esNueva
                ? "crear"
                : "actualizar"
            } la especialidad.`
        );
      }

      cerrarModalEspecialidad();

      mostrarMensaje(
        "success",
        payload.message ||
          `Especialidad ${
            esNueva
              ? "creada"
              : "actualizada"
          } correctamente.`
      );

      await cargarDatosReales();
    } catch (error) {
      console.error(
        "Error guardando especialidad:",
        error
      );

      mostrarErrorModal(
        error.message
      );
    } finally {
      establecerBotonCargando(
        boton,
        false
      );
    }
  }

  function mostrarErrorModal(mensaje) {
    const contenedor =
      $("modalError");

    const texto =
      $("modalErrorMessage");

    if (!contenedor || !texto) {
      return;
    }

    texto.textContent = mensaje;

    contenedor.hidden =
      !mensaje;

    contenedor.style.display =
      mensaje
        ? "flex"
        : "none";
  }

  /* ==========================================================
     MENSAJES GENERALES
  ========================================================== */

  function mostrarMensaje(
    tipo,
    mensaje
  ) {
    const esExito =
      tipo === "success";

    const contenedor = esExito
      ? $("alertSuccess")
      : $("alertError");

    const texto = esExito
      ? $("successMessage")
      : $("errorMessage");

    if (!contenedor || !texto) {
      return;
    }

    texto.textContent = mensaje;

    contenedor.hidden = false;
    contenedor.style.display = "flex";

    if (
      alertTimers.has(
        contenedor.id
      )
    ) {
      window.clearTimeout(
        alertTimers.get(
          contenedor.id
        )
      );
    }

    const timer = window.setTimeout(
      () =>
        cerrarAlerta(
          contenedor.id
        ),
      4500
    );

    alertTimers.set(
      contenedor.id,
      timer
    );
  }

  function cerrarAlerta(id) {
    const alerta = $(id);

    if (!alerta) {
      return;
    }

    alerta.hidden = true;
    alerta.style.display = "none";

    if (alertTimers.has(id)) {
      window.clearTimeout(
        alertTimers.get(id)
      );

      alertTimers.delete(id);
    }
  }

  /* ==========================================================
     IMPRESIÓN
  ========================================================== */

  function generarContenidoImpresion(
    lista
  ) {
    if (lista.length === 0) {
      return `
        <p class="sin-datos">
          No hay especialidades para imprimir.
        </p>
      `;
    }

    return lista
      .map((especialidad) => {
        const pacientesEspecialidad =
          obtenerPacientesDeEspecialidad(
            especialidad
          );

        return `
          <section class="especialidad-print">

            <header class="especialidad-print-header">

              <div>

                <h2>
                  ${escaparHTML(
                    especialidad.NOMBRE_ESPECIALIDAD
                  )}
                </h2>

                <p>
                  ${escaparHTML(
                    especialidad.DESCRIPCION ||
                      "Sin descripción registrada."
                  )}
                </p>

              </div>

              <span>
                ${escaparHTML(
                  especialidad.ESTADO
                )}
              </span>

            </header>

            <div class="resumen-print">

              <strong>
                ${especialidad.medicos.length}
              </strong>
              médicos

              ·

              <strong>
                ${pacientesEspecialidad.length}
              </strong>
              pacientes únicos

            </div>

            ${
              especialidad.medicos.length === 0
                ? `
                  <p class="sin-datos">
                    No hay médicos asignados.
                  </p>
                `
                : especialidad.medicos
                    .map((doctor) => {
                      const pacientes =
                        pacientesUnicos(
                          doctor.pacientes
                        );

                      return `
                        <div class="doctor-print">

                          <h3>
                            Médico #${escaparHTML(
                              doctor.ID_DOCTOR
                            )} · ${escaparHTML(
                              doctor.NOMBRE_DOCTOR
                            )}
                          </h3>

                          <p>
                            ${escaparHTML(
                              doctor.CORREO_DOCTOR ||
                                "Correo no registrado"
                            )}

                            ·

                            ${escaparHTML(
                              doctor.TELEFONO_DOCTOR ||
                                "Teléfono no registrado"
                            )}

                            ·

                            ${escaparHTML(
                              doctor.ESTADO_DOCTOR
                            )}

                            ·

                            ${escaparHTML(
                              doctor.TOTAL_ESPECIALIDADES_DOCTOR || 1
                            )} especialidad(es) asignada(s)
                          </p>

                          ${
                            doctor.PACIENTES_EN_ESPECIALIDAD_REFERENCIA
                              ? `
                                <p class="sin-datos">
                                  Pacientes mostrados en ${escaparHTML(
                                    doctor.NOMBRE_ESPECIALIDAD_REFERENCIA ||
                                      "la especialidad de referencia"
                                  )} para evitar duplicados.
                                </p>
                              `
                              : pacientes.length === 0
                                ? `
                                  <p class="sin-datos">
                                    Sin pacientes asociados.
                                  </p>
                                `
                                : `
                                <table>

                                  <thead>
                                    <tr>
                                      <th>Paciente</th>
                                      <th>Documento</th>
                                      <th>Correo</th>
                                      <th>Teléfono</th>
                                    </tr>
                                  </thead>

                                  <tbody>

                                    ${pacientes
                                      .map(
                                        (paciente) => `
                                          <tr>

                                            <td>
                                              ${escaparHTML(
                                                paciente.NOMBRE_COMPLETO
                                              )}
                                            </td>

                                            <td>
                                              ${escaparHTML(
                                                paciente.NUMERO_DOCUMENTO_IDENTIDAD ||
                                                  "-"
                                              )}
                                            </td>

                                            <td>
                                              ${escaparHTML(
                                                paciente.CORREO_ELECTRONICO ||
                                                  "-"
                                              )}
                                            </td>

                                            <td>
                                              ${escaparHTML(
                                                paciente.TELEFONO ||
                                                  "-"
                                              )}
                                            </td>

                                          </tr>
                                        `
                                      )
                                      .join("")}

                                  </tbody>

                                </table>
                              `
                          }

                        </div>
                      `;
                    })
                    .join("")
            }

          </section>
        `;
      })
      .join("");
  }

  function imprimirEspecialidades() {
    const loadingPrint =
      $("loadingPrint");

    if (loadingPrint) {
      loadingPrint.hidden = false;
      loadingPrint.style.display =
        "flex";
    }

    try {
      const ventana = window.open(
        "",
        "_blank",
        "width=1100,height=800"
      );

      if (!ventana) {
        throw new Error(
          "El navegador bloqueó la ventana de impresión. Permita las ventanas emergentes e inténtelo nuevamente."
        );
      }

      const contenido =
        generarContenidoImpresion(
          especialidadesFiltradas
        );

      const logoUrl =
        `${window.location.origin}/roca-maya-oct.jpg`;

      ventana.document.write(`
        <!DOCTYPE html>
        <html lang="es">

        <head>

          <meta charset="UTF-8">

          <title>
            Reporte de Especialidades Médicas
          </title>

          <style>

            @page {
              size: auto;
              margin: 15mm;
            }

            * {
              box-sizing: border-box;
            }

            body {
              margin: 0;
              color: #1f2937;
              font-family:
                "Segoe UI",
                Arial,
                sans-serif;
              font-size: 12px;
            }

            .reporte-header {
              display: flex;
              align-items: center;
              gap: 18px;
              padding-bottom: 15px;
              border-bottom:
                3px solid #2c5aa0;
            }

            .reporte-header img {
              width: 72px;
              height: 72px;
              object-fit: contain;
            }

            .reporte-header h1 {
              margin: 0 0 5px;
              color: #1e3c72;
              font-size: 22px;
            }

            .reporte-header p {
              margin: 0;
              color: #64748b;
            }

            .fecha {
              margin: 12px 0 20px;
              color: #64748b;
              text-align: right;
            }

            .especialidad-print {
              margin-bottom: 22px;
              border: 1px solid #cbd5e1;
              break-inside: avoid;
            }

            .especialidad-print-header {
              display: flex;
              justify-content: space-between;
              gap: 15px;
              padding: 12px 14px;
              background: #eef4fb;
              border-bottom:
                1px solid #cbd5e1;
            }

            .especialidad-print-header h2 {
              margin: 0 0 4px;
              color: #1e3c72;
              font-size: 17px;
            }

            .especialidad-print-header p {
              margin: 0;
              color: #475569;
            }

            .especialidad-print-header span {
              font-weight: 700;
            }

            .resumen-print {
              padding: 9px 14px;
              background: #f8fafc;
            }

            .doctor-print {
              padding: 12px 14px;
              border-top:
                1px solid #e2e8f0;
            }

            .doctor-print h3 {
              margin: 0 0 4px;
              font-size: 14px;
            }

            .doctor-print > p {
              margin: 0 0 9px;
              color: #64748b;
            }

            table {
              width: 100%;
              border-collapse: collapse;
            }

            th,
            td {
              padding: 7px;
              text-align: left;
              border:
                1px solid #cbd5e1;
            }

            th {
              color: #ffffff;
              background: #2c5aa0;
            }

            tbody tr:nth-child(even) {
              background: #f0f7ff;
            }

            .sin-datos {
              color: #64748b;
              font-style: italic;
            }

            .pie {
              margin-top: 25px;
              padding-top: 10px;
              color: #64748b;
              text-align: center;
              border-top:
                1px solid #cbd5e1;
            }

          </style>

        </head>

        <body>

          <header class="reporte-header">

            <img
              src="${escaparAtributo(
                logoUrl
              )}"
              alt="Clínicas Roca Maya"
            >

            <div>

              <h1>
                Reporte de Especialidades Médicas
              </h1>

              <p>
                Clínicas Médicas Roca Maya
              </p>

            </div>

          </header>

          <div class="fecha">
            Generado:
            ${escaparHTML(
              fechaActualFormateada()
            )}
          </div>

          ${contenido}

          <footer class="pie">
            Sistema de Gestión de Clínicas Médicas Roca Maya
          </footer>

        </body>

        </html>
      `);

      ventana.document.close();
      ventana.focus();

      window.setTimeout(() => {
        ventana.print();
      }, 700);

      mostrarMensaje(
        "success",
        "Vista de impresión generada correctamente."
      );
    } catch (error) {
      console.error(
        "Error preparando impresión:",
        error
      );

      mostrarMensaje(
        "error",
        error.message
      );
    } finally {
      if (loadingPrint) {
        loadingPrint.hidden = true;
        loadingPrint.style.display =
          "none";
      }
    }
  }

  /* ==========================================================
     EVENTOS
  ========================================================== */

  function registrarEventos() {
    $("logoBtn")?.addEventListener(
      "click",
      () => {
        window.location.href =
          $("logoBtn").dataset.url ||
          "/dashboard";
      }
    );

    $("btnNuevaEspecialidadHeader")
      ?.addEventListener(
        "click",
        () =>
          abrirModalEspecialidad(
            "nueva"
          )
      );

    $("btnAplicarFiltros")
      ?.addEventListener(
        "click",
        aplicarFiltros
      );

    $("btnLimpiarFiltros")
      ?.addEventListener(
        "click",
        limpiarFiltros
      );

    $("btnLimpiarDesdeVacio")
      ?.addEventListener(
        "click",
        limpiarFiltros
      );

    $("filterNombre")
      ?.addEventListener(
        "input",
        programarFiltros
      );

    $("filterDoctor")
      ?.addEventListener(
        "input",
        programarFiltros
      );

    $("filterEstado")
      ?.addEventListener(
        "change",
        aplicarFiltros
      );

    $("especialidadesGrid")
      ?.addEventListener(
        "click",
        manejarClickEspecialidades
      );

    $("btnCloseModal")
      ?.addEventListener(
        "click",
        cerrarModalEspecialidad
      );

    $("btnCancelarModal")
      ?.addEventListener(
        "click",
        cerrarModalEspecialidad
      );

    $("formEspecialidad")
      ?.addEventListener(
        "submit",
        guardarEspecialidad
      );

    $("inputColor")
      ?.addEventListener(
        "input",
        actualizarPreview
      );

    $("textareaDescripcion")
      ?.addEventListener(
        "input",
        () => {
          const input =
            $("textareaDescripcion");

          input.value = input.value
            .replace(
              /[^a-zA-ZÁÉÍÓÚÜÑáéíóúüñ0-9\s.,;:()\/-]/g,
              ""
            )
            .replace(
              /\s{2,}/g,
              " "
            );

          actualizarContadorDescripcion();
        }
      );

    $("inputNombre")
      ?.addEventListener(
        "input",
        () => {
          const input =
            $("inputNombre");

          input.value = input.value
            .replace(
              /[^a-zA-ZÁÉÍÓÚÜÑáéíóúüñ\s-]/g,
              ""
            )
            .replace(
              /\s{2,}/g,
              " "
            );
        }
      );

    $("iconList")
      ?.addEventListener(
        "click",
        (event) => {
          const icono =
            event.target.closest(
              "[data-icon]"
            );

          if (icono) {
            seleccionarIcono(icono);
          }
        }
      );

    $("iconList")
      ?.addEventListener(
        "keydown",
        (event) => {
          if (
            event.key !== "Enter" &&
            event.key !== " "
          ) {
            return;
          }

          const icono =
            event.target.closest(
              "[data-icon]"
            );

          if (!icono) {
            return;
          }

          event.preventDefault();
          seleccionarIcono(icono);
        }
      );

    $("modalEspecialidad")
      ?.addEventListener(
        "click",
        (event) => {
          if (
            event.target ===
            $("modalEspecialidad")
          ) {
            cerrarModalEspecialidad();
          }
        }
      );

    $("btnImprimir")
      ?.addEventListener(
        "click",
        imprimirEspecialidades
      );

    document
      .querySelectorAll(
        "[data-close-alert]"
      )
      .forEach((boton) => {
        boton.addEventListener(
          "click",
          () =>
            cerrarAlerta(
              boton.dataset.closeAlert
            )
        );
      });

    document.addEventListener(
      "keydown",
      (event) => {
        const modalAbierto =
          $("modalEspecialidad")
            ?.getAttribute(
              "aria-hidden"
            ) === "false";

        if (
          event.key === "Escape" &&
          modalAbierto
        ) {
          cerrarModalEspecialidad();
        }
      }
    );
  }

  /* ==========================================================
     INICIALIZACIÓN
  ========================================================== */

  document.addEventListener(
    "DOMContentLoaded",
    () => {
      registrarEventos();
      actualizarContadorDescripcion();
      actualizarPreview();
      renderIconos();
      cargarDatosReales();
    }
  );
})();