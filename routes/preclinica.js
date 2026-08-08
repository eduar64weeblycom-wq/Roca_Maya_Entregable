(() => {
    const $ = id => document.getElementById(id);

    let citas = [];
    let preclinicas = {};
    let submitting = false;
    let ultimaValidacion = null;

    let filtroBusquedaPaciente = "";
    let filtroBusquedaDoctor = "";
    let filtroBusquedaFecha = "";
    let filtroBusquedaEstado = "";

    function escapeHtml(s) {
        if (s == null) return "";

        return String(s)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
    }

    function debounce(fn, wait = 200) {
        let t;

        return (...args) => {
            clearTimeout(t);
            t = setTimeout(() => fn(...args), wait);
        };
    }

    function sanitizeSearch(value) {
        if (typeof value !== "string") return "";

        return value.replace(
            /[^a-zA-Z0-9ñÑáéíóúÁÉÍÓÚ\s.\-]/g,
            ""
        );
    }

    function sanitizeInput(value) {
        if (typeof value !== "string") return "";

        return value.replace(
            /[^a-zA-Z0-9ñÑáéíóúÁÉÍÓÚ\s.,;:\-()]/g,
            ""
        );
    }

    async function cargarDatos() {
        try {
            const res = await fetch("/preclinica/api/datos", {
                credentials: "same-origin"
            });

            if (!res.ok) {
                throw new Error("HTTP " + res.status);
            }

            const j = await res.json();

            citas = j.citas || [];

            citas.sort(
                (a, b) =>
                    (Number(b.ID_CITA) || 0) -
                    (Number(a.ID_CITA) || 0)
            );

            preclinicas = {};

            (j.preclinicas || []).forEach(p => {
                preclinicas[p.ID_CITA] = p;
            });

            // Debug: Verificar que las preclínicas se cargaron
            console.log('Preclínicas cargadas:', preclinicas);
            console.log('IDs de citas con preclínica:', Object.keys(preclinicas));

            renderTabla();
            llenarSelectCitas();
            llenarSelectDoctores();
            llenarSelectEstados();
        } catch (err) {
            console.error(
                "Error cargando datos en Preclínica:",
                err
            );

            alert("Error cargando datos: " + err.message);
        }
    }

    function safeEstadoClass(estado) {
        if (!estado) return "";

        return (
            "estado-" +
            String(estado)
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "_")
        );
    }

    // ============================================================
    // ESTADOS VISUALES DEL REGISTRO
    // ============================================================

    const rangosVisuales = {
        temperatura: {
            min: 32,
            max: 42
        },
        presionSistolica: {
            min: 70,
            max: 220,
            required: true
        },
        presionDiastolica: {
            min: 40,
            max: 140,
            required: true
        },
        frecuenciaCardiaca: {
            min: 30,
            max: 200
        },
        frecuenciaRespiratoria: {
            min: 8,
            max: 60
        },
        saturacionOxigeno: {
            min: 50,
            max: 100
        },
        peso: {
            min: 2,
            max: 500,
            required: true
        },
        talla: {
            min: 0.5,
            max: 2.5,
            required: true
        },
        glucosa: {
            min: 30,
            max: 900
        },
        perimetroAbdominal: {
            min: 10,
            max: 300
        }
    };


    // Rangos clínicos orientativos para personas adultas.
    // Estos rangos generan alertas visuales, pero no impiden guardar.
    const rangosClinicos = {
        temperatura: {
            label: "Temperatura",
            unidad: "°C",
            normalMin: 36,
            normalMax: 37.5,
            criticalLow: 35,
            criticalHigh: 39
        },
        presionSistolica: {
            label: "Presión sistólica",
            unidad: "mmHg",
            normalMin: 90,
            normalMax: 139,
            criticalLow: 80,
            criticalHigh: 180
        },
        presionDiastolica: {
            label: "Presión diastólica",
            unidad: "mmHg",
            normalMin: 60,
            normalMax: 89,
            criticalLow: 50,
            criticalHigh: 120
        },
        frecuenciaCardiaca: {
            label: "Frecuencia cardíaca",
            unidad: "lpm",
            normalMin: 60,
            normalMax: 100,
            criticalLow: 40,
            criticalHigh: 130
        },
        frecuenciaRespiratoria: {
            label: "Frecuencia respiratoria",
            unidad: "rpm",
            normalMin: 12,
            normalMax: 20,
            criticalLow: 8,
            criticalHigh: 30
        },
        saturacionOxigeno: {
            label: "Saturación de oxígeno",
            unidad: "%",
            normalMin: 95,
            normalMax: 100,
            criticalLow: 90,
            criticalHigh: null
        },
        glucosa: {
            label: "Glucosa",
            unidad: "mg/dL",
            normalMin: 70,
            normalMax: 180,
            criticalLow: 54,
            criticalHigh: 250
        }
    };


    // Campos clínicos principales esperados antes de enviar la cita a Consulta Médica.
    // La ausencia de estos datos NO impide guardar la preclínica; genera una alerta pendiente.
    const camposEsperadosConsulta = [
        { id: "temperatura", label: "Temperatura" },
        { id: "presionSistolica", label: "Presión sistólica" },
        { id: "presionDiastolica", label: "Presión diastólica" },
        { id: "frecuenciaCardiaca", label: "Frecuencia cardíaca" },
        { id: "frecuenciaRespiratoria", label: "Frecuencia respiratoria" },
        { id: "saturacionOxigeno", label: "Saturación de oxígeno" },
        { id: "peso", label: "Peso" },
        { id: "talla", label: "Talla" }
    ];

    function obtenerCamposPendientesFormulario() {
        return camposEsperadosConsulta
            .filter(campo => {
                const raw = $(campo.id)?.value;
                return raw == null || String(raw).trim() === "";
            })
            .map(campo => ({ ...campo }));
    }

    function setStatusBadge(
        id,
        texto,
        clase = "status-empty"
    ) {
        const badge = $(id);

        if (!badge) return;

        badge.textContent = texto;

        badge.classList.remove(
            "status-empty",
            "status-ok",
            "status-warning",
            "status-danger",
            "status-info"
        );

        badge.classList.add(clase);
    }

    function valorNumerico(id) {
        const raw = $(id)?.value;

        if (
            raw == null ||
            String(raw).trim() === ""
        ) {
            return null;
        }

        const value = Number(raw);

        return Number.isFinite(value)
            ? value
            : null;
    }

    function estadoVisualCampo(id, config) {
        const raw = $(id)?.value;
        const statusId = `${id}-status`;

        const vacio =
            raw == null ||
            String(raw).trim() === "";

        if (vacio) {
            setStatusBadge(
                statusId,
                config.required
                    ? "Pendiente"
                    : "Sin registrar",
                "status-empty"
            );

            return "empty";
        }

        const value = Number(raw);

        if (!Number.isFinite(value)) {
            setStatusBadge(
                statusId,
                "Revisar",
                "status-danger"
            );

            return "danger";
        }

        if (
            value < config.min ||
            value > config.max
        ) {
            setStatusBadge(
                statusId,
                "Revisar valor",
                "status-warning"
            );

            return "warning";
        }

        setStatusBadge(
            statusId,
            "Registrado",
            "status-ok"
        );

        return "ok";
    }

    function limpiarEstadoClinicoTarjeta(id) {
        const input = $(id);
        const card = input?.closest(".pre-field-card");

        if (!card) return;

        card.classList.remove(
            "vital-status-normal",
            "vital-status-warning",
            "vital-status-critical"
        );
    }

    function aplicarEstadoClinicoTarjeta(id, level) {
        limpiarEstadoClinicoTarjeta(id);

        const input = $(id);
        const card = input?.closest(".pre-field-card");

        if (!card) return;

        if (level === "normal") {
            card.classList.add("vital-status-normal");
        } else if (level === "warning") {
            card.classList.add("vital-status-warning");
        } else if (level === "critical") {
            card.classList.add("vital-status-critical");
        }
    }

    function evaluarSignoClinico(id) {
        const config = rangosClinicos[id];
        const validacion = rangosVisuales[id];
        const raw = $(id)?.value;

        limpiarEstadoClinicoTarjeta(id);

        if (raw == null || String(raw).trim() === "") {
            return {
                field: id,
                level: "empty",
                value: null,
                message: ""
            };
        }

        const value = Number(raw);

        if (
            !Number.isFinite(value) ||
            value < validacion.min ||
            value > validacion.max
        ) {
            return {
                field: id,
                level: "invalid",
                value,
                message: `${config.label}: verifique el valor ingresado.`
            };
        }

        let level = "normal";
        let direction = "normal";

        if (
            config.criticalLow !== null &&
            config.criticalLow !== undefined &&
            value < config.criticalLow
        ) {
            level = "critical";
            direction = "críticamente bajo";
        } else if (
            config.criticalHigh !== null &&
            config.criticalHigh !== undefined &&
            value >= config.criticalHigh
        ) {
            level = "critical";
            direction = "críticamente elevado";
        } else if (
            config.normalMin !== null &&
            config.normalMin !== undefined &&
            value < config.normalMin
        ) {
            level = "warning";
            direction = "bajo";
        } else if (
            config.normalMax !== null &&
            config.normalMax !== undefined &&
            value > config.normalMax
        ) {
            level = "warning";
            direction = "elevado";
        }

        aplicarEstadoClinicoTarjeta(id, level);

        const rangoNormal =
            config.normalMin !== null &&
            config.normalMin !== undefined &&
            config.normalMax !== null &&
            config.normalMax !== undefined
                ? `${config.normalMin} - ${config.normalMax} ${config.unidad}`
                : "";

        return {
            field: id,
            label: config.label,
            unidad: config.unidad,
            level,
            direction,
            value,
            message:
                level === "normal"
                    ? ""
                    : `${config.label}: ${value} ${config.unidad}, valor ${direction}.` +
                      (rangoNormal ? ` Referencia: ${rangoNormal}.` : "")
        };
    }

    function obtenerAlertasClinicas() {
        return Object.keys(rangosClinicos)
            .map(evaluarSignoClinico)
            .filter(resultado =>
                resultado.level === "warning" ||
                resultado.level === "critical"
            );
    }

    function actualizarPanelAlertasClinicas(alertas = obtenerAlertasClinicas()) {
        const panel = $("alertaSignosVitales");
        const lista = $("listaAlertasVitales");
        const titulo = $("alertaSignosVitalesTitulo");
        const resumen = $("alertaSignosVitalesResumen");
        const nivel = $("alertaSignosVitalesNivel");
        const icono = $("alertaSignosVitalesIcono");

        if (!panel || !lista) return alertas;

        panel.classList.remove(
            "pre-vital-alert-warning",
            "pre-vital-alert-critical"
        );

        if (!alertas.length) {
            panel.style.display = "none";
            lista.innerHTML = "";
            return alertas;
        }

        const criticas = alertas.filter(a => a.level === "critical");
        const hayCriticas = criticas.length > 0;

        panel.style.display = "block";
        panel.classList.add(
            hayCriticas
                ? "pre-vital-alert-critical"
                : "pre-vital-alert-warning"
        );

        if (titulo) {
            titulo.textContent = hayCriticas
                ? "Se detectaron signos vitales críticos"
                : "Signos vitales que requieren revisión";
        }

        if (resumen) {
            resumen.textContent = hayCriticas
                ? `${criticas.length} alerta(s) crítica(s) y ${alertas.length - criticas.length} advertencia(s).`
                : `${alertas.length} valor(es) fuera del rango clínico referencial.`;
        }

        if (nivel) {
            nivel.textContent = hayCriticas ? "Crítico" : "Revisar";
        }

        if (icono) {
            icono.className = hayCriticas
                ? "fas fa-circle-exclamation"
                : "fas fa-triangle-exclamation";
        }

        lista.innerHTML = alertas
            .map(alerta => `
                <li class="${alerta.level === "critical" ? "critical" : "warning"}">
                    <i class="fas ${alerta.level === "critical" ? "fa-circle-exclamation" : "fa-triangle-exclamation"}"></i>
                    <span>${escapeHtml(alerta.message)}</span>
                </li>
            `)
            .join("");

        return alertas;
    }
    function renderConfirmVitalAlerts(alertas = [], camposPendientes = []) {
        const container = $("confirmVitalAlerts");
        if (!container) return;

        const hayPendientes = Array.isArray(camposPendientes) && camposPendientes.length > 0;
        const hayAlertas = Array.isArray(alertas) && alertas.length > 0;

        if (!hayPendientes && !hayAlertas) {
            container.style.display = "none";
            container.innerHTML = "";
            return;
        }

        const hayCriticas = alertas.some(a => a.level === "critical");
        container.className = "confirm-vital-alerts " +
            (hayCriticas ? "confirm-vital-alerts-critical" : "confirm-vital-alerts-warning");
        container.style.display = "block";

        let html = "";

        if (hayPendientes) {
            html += `
                <div class="confirm-pending-block">
                    <strong>
                        <i class="fas fa-clipboard-list"></i>
                        Faltan datos por registrar
                    </strong>
                    <p>
                        Puede guardar la preclínica sin enviarla todavía, o enviarla a Consulta Médica con una alerta visible para el doctor.
                    </p>
                    <ul>
                        ${camposPendientes.map(campo => `
                            <li>${escapeHtml(campo.label)}</li>
                        `).join("")}
                    </ul>
                </div>
            `;
        }

        if (hayAlertas) {
            html += `
                <div class="confirm-clinical-block">
                    <strong>
                        <i class="fas ${hayCriticas ? "fa-circle-exclamation" : "fa-triangle-exclamation"}"></i>
                        ${hayCriticas ? "Valores críticos detectados" : "Advertencias clínicas"}
                    </strong>
                    <ul>
                        ${alertas.map(alerta => `
                            <li>${escapeHtml(alerta.message)}</li>
                        `).join("")}
                    </ul>
                    <small>Los rangos son referenciales para personas adultas. Confirme los valores y aplique el criterio clínico correspondiente.</small>
                </div>
            `;
        }

        container.innerHTML = html;
    }

    function actualizarModoModal() {
        const editando = Boolean(
            $("idPreclinica")?.value
        );

        const title = $("modalTitle");
        const subtitle = $("modalSubtitle");
        const saveButton = $("btnGuardarPreclinica");

        if (title) {
            title.innerHTML = editando
                ? '<i class="fas fa-edit"></i> Editar Preclínica'
                : '<i class="fas fa-stethoscope"></i> Nueva Preclínica';
        }

        if (subtitle) {
            subtitle.textContent = editando
                ? "Actualice los datos clínicos y revise sus indicadores antes de guardar."
                : "Complete los datos clínicos y revise su estado antes de guardar.";
        }

        if (saveButton) {
            saveButton.innerHTML = editando
                ? '<i class="fas fa-save"></i> Actualizar Preclínica'
                : '<i class="fas fa-save"></i> Guardar Preclínica';
        }
    }
    function actualizarEstadosVisuales() {
        const estados = [];
        const citaSeleccionada = Number($("selectCita")?.value || 0) > 0;

        setStatusBadge(
            "selectCita-status",
            citaSeleccionada ? "Seleccionada" : "Pendiente",
            citaSeleccionada ? "status-ok" : "status-empty"
        );

        Object.entries(rangosVisuales).forEach(([id, config]) => {
            if (rangosClinicos[id]) {
                const resultado = evaluarSignoClinico(id);

                if (resultado.level === "empty") {
                    setStatusBadge(
                        `${id}-status`,
                        config.required ? "Pendiente" : "Sin registrar",
                        "status-empty"
                    );
                    estados.push("empty");
                } else if (resultado.level === "invalid") {
                    setStatusBadge(`${id}-status`, "Revisar valor", "status-danger");
                    estados.push("danger");
                } else if (resultado.level === "critical") {
                    setStatusBadge(
                        `${id}-status`,
                        resultado.direction === "críticamente bajo" ? "Crítico bajo" : "Crítico alto",
                        "status-danger"
                    );
                    estados.push("danger");
                } else if (resultado.level === "warning") {
                    setStatusBadge(
                        `${id}-status`,
                        resultado.direction === "bajo" ? "Bajo" : "Elevado",
                        "status-warning"
                    );
                    estados.push("warning");
                } else {
                    setStatusBadge(`${id}-status`, "Normal", "status-ok");
                    estados.push("ok");
                }
            } else {
                estados.push(estadoVisualCampo(id, config));
            }
        });

        const alertasClinicas = actualizarPanelAlertasClinicas();
        const camposPendientes = obtenerCamposPendientesFormulario();

        const imcValue = $("imc")?.value;
        setStatusBadge(
            "imc-status",
            imcValue ? "Calculado" : "Pendiente",
            imcValue ? "status-info" : "status-empty"
        );

        const observaciones = String($("observaciones")?.value || "").trim();
        setStatusBadge(
            "observaciones-status",
            observaciones ? "Registradas" : "Opcional",
            observaciones ? "status-ok" : "status-empty"
        );

        const estadoGeneral = String($("estadoGeneral")?.value || "BUENO").toUpperCase();
        const claseEstadoGeneral =
            estadoGeneral === "MALO"
                ? "status-danger"
                : estadoGeneral === "REGULAR"
                    ? "status-warning"
                    : "status-info";
        setStatusBadge("estadoGeneral-status", estadoGeneral, claseEstadoGeneral);

        const tieneAlertaCritica = alertasClinicas.some(alerta => alerta.level === "critical");
        const requiereRevision = estados.includes("warning") || estados.includes("danger");

        if (!citaSeleccionada) {
            setStatusBadge("registroEstadoBadge", "Incompleto", "status-empty");
            if ($("registroEstadoTexto")) {
                $("registroEstadoTexto").textContent =
                    "Seleccione una cita para guardar la preclínica.";
            }
        } else if (tieneAlertaCritica) {
            setStatusBadge("registroEstadoBadge", "Alerta crítica", "status-danger");
            if ($("registroEstadoTexto")) {
                $("registroEstadoTexto").textContent =
                    "Hay signos vitales críticos. Revise los valores antes de continuar.";
            }
        } else if (camposPendientes.length) {
            setStatusBadge("registroEstadoBadge", "Datos pendientes", "status-warning");
            if ($("registroEstadoTexto")) {
                $("registroEstadoTexto").textContent =
                    `Faltan ${camposPendientes.length} dato(s). Puede guardar sin enviar o enviar a consulta con una alerta.`;
            }
        } else if (requiereRevision) {
            setStatusBadge("registroEstadoBadge", "Requiere revisión", "status-warning");
            if ($("registroEstadoTexto")) {
                $("registroEstadoTexto").textContent =
                    "Hay valores fuera del rango clínico referencial.";
            }
        } else {
            setStatusBadge("registroEstadoBadge", "Completo", "status-ok");
            if ($("registroEstadoTexto")) {
                $("registroEstadoTexto").textContent =
                    "El registro contiene los datos principales para enviarse a consulta.";
            }
        }
    }

    // ============================================================
    // RENDERIZADO DE LA TABLA - VERSIÓN CORREGIDA
    // ============================================================

    function renderTabla() {
        const target = $("tablaContenidoPreclinica");

        if (!target) return;

        const filtroTexto = sanitizeSearch(
            filtroBusquedaPaciente
        )
            .toLowerCase()
            .trim();

        const filtroDoctor =
            String(filtroBusquedaDoctor || "").trim();

        const filtroFechaStr =
            filtroBusquedaFecha;

        const filtroEstado =
            filtroBusquedaEstado.toUpperCase();

        const citasFiltradas = citas.filter(c => {
            const cumpleTexto =
                !filtroTexto ||
                String(c.ID_CITA).includes(
                    filtroTexto
                ) ||
                (
                    c.NOMBRE_PACIENTE &&
                    c.NOMBRE_PACIENTE
                        .toLowerCase()
                        .includes(filtroTexto)
                ) ||
                (
                    c.TELEFONO &&
                    c.TELEFONO.includes(filtroTexto)
                ) ||
                (
                    c.NOMBRE_DOCTOR &&
                    c.NOMBRE_DOCTOR
                        .toLowerCase()
                        .includes(filtroTexto)
                ) ||
                (
                    c.ESTADO &&
                    c.ESTADO
                        .toLowerCase()
                        .includes(filtroTexto)
                );

            let cumpleFecha = true;

            if (filtroFechaStr) {
                const citaFechaStr =
                    new Date(c.FECHA_CITA)
                        .toISOString()
                        .split("T")[0];

                cumpleFecha =
                    citaFechaStr ===
                    filtroFechaStr;
            }

            const cumpleEstado =
                !filtroEstado ||
                filtroEstado === "" ||
                (
                    c.ESTADO &&
                    c.ESTADO.toUpperCase() ===
                    filtroEstado
                );

            const valorDoctorCita =
                c.ID_DOCTOR != null &&
                String(c.ID_DOCTOR).trim() !== ""
                    ? String(c.ID_DOCTOR)
                    : String(c.NOMBRE_DOCTOR || "").trim();

            const cumpleDoctor =
                !filtroDoctor ||
                valorDoctorCita === filtroDoctor;

            return (
                cumpleTexto &&
                cumpleDoctor &&
                cumpleFecha &&
                cumpleEstado
            );
        });

        citasFiltradas.sort(
            (a, b) =>
                (Number(b.ID_CITA) || 0) -
                (Number(a.ID_CITA) || 0)
        );

        const totalRegistros =
            $("totalRegistros");

        if (totalRegistros) {
            totalRegistros.textContent =
                String(citasFiltradas.length);
        }

        if (!citasFiltradas.length) {
            target.innerHTML = `
                <div class="ctsin-citas">
                    <i class="fas fa-stethoscope"></i>

                    <h3>
                        ${
                            filtroTexto ||
                            filtroDoctor ||
                            filtroFechaStr ||
                            filtroEstado
                                ? "No se encontraron citas con los filtros aplicados."
                                : "No hay citas"
                        }
                    </h3>
                </div>
            `;

            return;
        }

        let html = `
            <div class="cttabla-preclinica">
                <table class="table">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Cita</th>
                            <th>Paciente</th>
                            <th>Doctor</th>
                            <th>Fecha</th>
                            <th>Estado</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>

                    <tbody>
        `;

        citasFiltradas.forEach(c => {
            const fecha =
                new Date(c.FECHA_CITA)
                    .toLocaleDateString("es-ES");

            const hora =
                new Date(c.FECHA_CITA)
                    .toLocaleTimeString("es-ES", {
                        hour: "2-digit",
                        minute: "2-digit"
                    });

            // Verificar si existe preclínica para esta cita
            const hasPre = Boolean(preclinicas[c.ID_CITA]);
            const estadoClass = safeEstadoClass(c.ESTADO || "");
            const mostrarPreclinica = String(c.ESTADO || "").toUpperCase() !== "CANCELADA";

            html += `
                <tr data-id="${c.ID_CITA}">
                    <td>
                        #${c.ID_CITA}
                    </td>

                    <td>
                        ${fecha}
                        <br>
                        <small>${hora}</small>
                    </td>

                    <td>
                        <strong>
                            ${escapeHtml(
                                c.NOMBRE_PACIENTE
                            )}
                        </strong>

                        <br>

                        <small>
                            ${escapeHtml(
                                c.TELEFONO || ""
                            )}
                        </small>
                    </td>

                    <td>
                        ${escapeHtml(
                            c.NOMBRE_DOCTOR || ""
                        )}
                    </td>

                    <td>
                        ${fecha}
                    </td>

                    <td>
                        <span class="ctestado-badge ${estadoClass}">
                            ${escapeHtml(
                                c.ESTADO || ""
                            )}
                        </span>
                    </td>

                    <td>
                        <div class="ctacciones-preclinica">
            `;

            // Solo mostrar acciones si la cita no está cancelada
           if (mostrarPreclinica) {
    html += `
        <button
            class="ctbtn-accion ctbtn-icon"
            data-action="abrirPreclinica"
            data-id="${c.ID_CITA}"
            type="button"
            title="${hasPre ? "Editar Preclínica" : "Crear Preclínica"}"
            aria-label="${hasPre ? "Editar Preclínica" : "Crear Preclínica"}"
        >
            <i
                class="fas fa-stethoscope"
                aria-hidden="true"
            ></i>
        </button>
    `;

    html += `
        <button
            class="ctbtn-accion ctbtn-icon delete"
            data-action="eliminarPreclinica"
            data-id="${c.ID_CITA}"
            type="button"
            title="Eliminar Preclínica"
            aria-label="Eliminar Preclínica"
        >
            <i
                class="fas fa-trash-can"
                aria-hidden="true"
            ></i>
        </button>
    `;
} else {
    html += `
        <span class="text-muted">
            Sin acciones
        </span>
    `;
}

            html += `
                        </div>
                    </td>
                </tr>
            `;
        });

        html += `
                    </tbody>
                </table>
            </div>
        `;

        target.innerHTML = html;
    }

    function llenarSelectCitas() {
        const sel = $("selectCita");

        if (!sel) return;

        sel.innerHTML = `
            <option value="">
                Seleccionar cita...
            </option>
        `;

        citas.forEach(c => {
            const opt =
                document.createElement("option");

            opt.value = c.ID_CITA;

            opt.textContent =
                `#${c.ID_CITA} — ` +
                `${c.NOMBRE_PACIENTE} • ` +
                `${new Date(c.FECHA_CITA)
                    .toLocaleString("es-ES")}`;

            opt.dataset.telefono =
                c.TELEFONO || "";

            opt.dataset.correo =
                c.CORREO_ELECTRONICO || "";

            sel.appendChild(opt);
        });
    }

    function llenarSelectDoctores() {
        const sel = $("filtroDoctor");

        if (!sel) return;

        const doctoresMap = new Map();

        citas.forEach(cita => {
            const nombre = String(
                cita.NOMBRE_DOCTOR || ""
            ).trim();

            if (!nombre) return;

            const value =
                cita.ID_DOCTOR != null &&
                String(cita.ID_DOCTOR).trim() !== ""
                    ? String(cita.ID_DOCTOR)
                    : nombre;

            if (!doctoresMap.has(value)) {
                doctoresMap.set(value, {
                    value,
                    nombre
                });
            }
        });

        const doctores = Array.from(
            doctoresMap.values()
        ).sort((a, b) =>
            a.nombre.localeCompare(
                b.nombre,
                "es",
                { sensitivity: "base" }
            )
        );

        const valorActual =
            filtroBusquedaDoctor ||
            sel.value;

        sel.innerHTML = `
            <option value="">
                Todos los doctores
            </option>
        `;

        doctores.forEach(doctor => {
            const opt =
                document.createElement("option");

            opt.value = doctor.value;
            opt.textContent = doctor.nombre;

            sel.appendChild(opt);
        });

        if (
            doctores.some(
                doctor => doctor.value === valorActual
            )
        ) {
            sel.value = valorActual;
            filtroBusquedaDoctor = valorActual;
        } else {
            sel.value = "";
            filtroBusquedaDoctor = "";
        }
    }

    function llenarSelectEstados() {
        const sel = $("filtroEstadoCita");

        if (!sel) return;

        const estadosUnicos = [
            ...new Set(
                citas
                    .map(c => c.ESTADO)
                    .filter(e => e)
            )
        ].sort();

        const valorActual = sel.value;

        sel.innerHTML = `
            <option value="">
                Todos
            </option>
        `;

        estadosUnicos.forEach(estado => {
            const opt =
                document.createElement("option");

            opt.value = estado;
            opt.textContent = estado;

            sel.appendChild(opt);
        });

        if (estadosUnicos.includes(valorActual)) {
            sel.value = valorActual;
        } else {
            filtroBusquedaEstado = "";
        }
    }

    // ============================================================
    // CONTROL DEL BLOQUEO Y DESPLAZAMIENTO DE LOS MODALES
    // ============================================================

    function modalEstaVisible(id) {
        const modal = $(id);

        if (!modal) return false;

        return (
            modal.style.display !== "none" &&
            modal.getAttribute("aria-hidden") !==
            "true"
        );
    }

    function sincronizarBloqueoPagina() {
        const hayModalAbierto =
            modalEstaVisible("modalPreclinica") ||
            modalEstaVisible(
                "confirmPreclinicaModal"
            );

        document.documentElement.classList.toggle(
            "preclinica-modal-open",
            hayModalAbierto
        );

        document.body.classList.toggle(
            "preclinica-modal-open",
            hayModalAbierto
        );
    }

    function reiniciarScrollModal() {
        const modalBody =
            document.querySelector(
                "#modalPreclinica .pre-modal-body"
            );

        if (modalBody) {
            modalBody.scrollTop = 0;
        }

        const contenidoModal =
            document.querySelector(
                "#modalPreclinica .ctmodal-contenido"
            );

        if (contenidoModal) {
            contenidoModal.scrollTop = 0;
        }
    }

    function abrirModal() {
        const modal = $("modalPreclinica");

        if (!modal) return;

        modal.style.display = "flex";
        modal.setAttribute(
            "aria-hidden",
            "false"
        );

        sincronizarBloqueoPagina();
        limpiarModal();

        requestAnimationFrame(() => {
            reiniciarScrollModal();
        });
    }

    function closePreclinicaModal() {
        const modal = $("modalPreclinica");

        if (!modal) return;

        modal.style.display = "none";
        modal.setAttribute(
            "aria-hidden",
            "true"
        );

        sincronizarBloqueoPagina();
        renderValidationMessages([]);
        clearAllFieldErrors();
        clearInfoField("talla-info");
        renderConfirmVitalAlerts([]);
    }

    function limpiarModal() {
        ultimaValidacion = null;

        const form = $("formPreclinica");

        if (form) {
            form.reset();
        }

        if ($("idPreclinica")) {
            $("idPreclinica").value = "";
        }

        if ($("imc")) {
            $("imc").value = "";
        }

        if ($("finIMC")) {
            $("finIMC").textContent = "-";
        }

        if ($("modalError")) {
            $("modalError").style.display =
                "none";
        }

        if ($("selectCita")) {
            $("selectCita").value = "";
        }

        if ($("pacienteInfo")) {
            $("pacienteInfo").textContent =
                "";
        }

        renderValidationMessages([]);
        clearAllFieldErrors();
        clearInfoField("talla-info");
        renderConfirmVitalAlerts([]);
        actualizarModoModal();
        actualizarEstadosVisuales();
    }

    // ============================================================
    // ELIMINAR PRECLÍNICA O CITA (CORREGIDO - Maneja el 404)
    // ============================================================

    async function eliminarPreclinica(
        idCita,
        boton = null
    ) {
        // 1. Asegurar que sea un número entero positivo
        const id = parseInt(idCita, 10);

        if (!id || isNaN(id) || id <= 0) {
            mostrarAlerta(
                "error",
                "El ID de la cita no es válido para eliminar."
            );
            return;
        }

        // Guardar contenido original si el botón existe
        const contenidoOriginal =
            boton?.innerHTML || "";

        if (boton) {
            boton.disabled = true;
            boton.innerHTML = `
                <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
            `;
        }

        try {
            // 2. Intentar eliminar la preclínica
            const res = await fetch(
                `/preclinica/eliminar/${id}`,
                {
                    method: "DELETE",
                    credentials: "same-origin",
                    headers: {
                        Accept: "application/json"
                    }
                }
            );

            const contentType =
                res.headers.get("content-type") || "";

            const json =
                contentType.includes("application/json")
                    ? await res.json().catch(() => null)
                    : null;

            // 3. Manejar la respuesta del servidor
            if (!res.ok) {
                // SI EL ERROR ES 404 (NO EXISTE PRECLÍNICA)
                if (res.status === 404) {
                    // Preguntar si quiere eliminar la cita completa
                    const eliminarCita = window.confirm(
                        `No existe una preclínica asociada a la cita #${id}.\n\n` +
                        `¿Desea eliminar la cita médica completa? (Esto borrará la cita permanentemente)`
                    );

                    if (!eliminarCita) {
                        // El usuario canceló, no hacemos nada
                        if (boton && boton.isConnected) {
                            boton.disabled = false;
                            boton.innerHTML = contenidoOriginal;
                        }
                        return;
                    }

                    // 🟢 LLAMADA A LA NUEVA RUTA PARA ELIMINAR LA CITA 🟢
                    const resCita = await fetch(`/citas/eliminar/${id}`, { 
                        method: "DELETE",
                        credentials: "same-origin",
                        headers: {
                            Accept: "application/json"
                        }
                    });

                    const jsonCita = resCita.ok ? await resCita.json().catch(() => null) : null;

                    if (resCita.ok) {
                        mostrarAlerta("success", jsonCita?.message || "Cita y registros asociados eliminados correctamente.");
                        await cargarDatos(); // Recargar la tabla para que desaparezca la fila
                    } else {
                        throw new Error(
                            jsonCita?.message || 
                            `No se pudo eliminar la cita. Código HTTP ${resCita.status}.`
                        );
                    }
                    
                    // Salir de la función después de borrar la cita
                    if (boton && boton.isConnected) {
                        boton.disabled = false;
                        boton.innerHTML = contenidoOriginal;
                    }
                    return;
                }

                // Si es otro error (500, etc.)
                throw new Error(
                    json?.message ||
                    `No se pudo eliminar la preclínica. Código HTTP ${res.status}.`
                );
            }

            // 4. Si se eliminó la preclínica correctamente
            // Eliminar del objeto local
            delete preclinicas[id];

            mostrarAlerta(
                "success",
                json?.message ||
                "Preclínica eliminada correctamente."
            );

            // Recargar la tabla
            await cargarDatos();

            // 5. Notificar cambios a otros módulos
            try {
                const bc =
                    new BroadcastChannel(
                        "citas_channel"
                    );

                bc.postMessage({
                    type: "preclinica_deleted",
                    idCita: id,
                    nuevoEstado:
                        json?.nuevoEstado ||
                        "PRECLINICA"
                });

                bc.postMessage({
                    type: "estado_cita",
                    id: id,
                    nuevoEstado:
                        json?.nuevoEstado ||
                        "PRECLINICA"
                });

                bc.close();
            } catch (error) {
                console.warn(
                    "BroadcastChannel no disponible:",
                    error
                );
            }
        } catch (err) {
            console.error(
                "Error eliminando preclínica:",
                err
            );

            mostrarAlerta(
                "error",
                err.message ||
                "No se pudo eliminar la preclínica."
            );
        } finally {
            // 6. Restaurar el botón si sigue existiendo en el DOM
            if (
                boton &&
                boton.isConnected
            ) {
                boton.disabled = false;
                boton.innerHTML =
                    contenidoOriginal;
            }
        }
    }

    async function generarVentanaImpresionPreclinica(
        logoBase64
    ) {
        const tabla =
            document.querySelector(
                ".cttabla-preclinica"
            );

        if (!tabla) {
            alert(
                "No se encontró la tabla de preclínica para imprimir."
            );

            return;
        }

        const tablaClon =
            tabla.cloneNode(true);

        const filasTabla =
            tablaClon.querySelectorAll("tr");

        filasTabla.forEach(fila => {
            const celdas =
                fila.querySelectorAll(
                    "td, th"
                );

            if (celdas.length > 0) {
                const ultimaCelda =
                    celdas[
                        celdas.length - 1
                    ];

                if (ultimaCelda) {
                    ultimaCelda.remove();
                }
            }
        });

        const totalSpan =
            document.getElementById(
                "totalRegistros"
            );

        const totalTexto =
            totalSpan
                ? totalSpan.textContent
                : "";

        const ventana = window.open(
            "",
            "",
            "width=900,height=700"
        );

        if (!ventana) {
            alert(
                "El navegador bloqueó la ventana de impresión."
            );

            return;
        }

        ventana.document.write(`
            <!DOCTYPE html>
            <html lang="es">
                <head>
                    <meta charset="UTF-8">

                    <title>
                        Preclínica - Clínicas Roca Maya
                    </title>

                    <style>
                        body {
                            font-family:
                                "Times New Roman",
                                Times,
                                serif;
                            padding: 20px;
                            margin: 0;
                            color: #1f2937;
                        }

                        .header {
                            display: flex;
                            align-items: center;
                            margin-bottom: 20px;
                            border-bottom:
                                2px solid #215fa5;
                            padding-bottom: 15px;
                        }

                        .logo {
                            height: 80px;
                            margin-right: 20px;
                            max-width: 200px;
                            object-fit: contain;
                        }

                        .logo-placeholder {
                            height: 80px;
                            width: 200px;
                            background: #f0f0f0;
                            border:
                                2px dashed #ccc;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            margin-right: 20px;
                            color: #666;
                            font-size: 12px;
                            text-align: center;
                        }

                        .company-info {
                            flex: 1;
                        }

                        .company-name {
                            font-size: 20px;
                            font-weight: bold;
                            color: #153f6d;
                            margin-bottom: 5px;
                        }

                        .company-slogan {
                            font-size: 14px;
                            color: #666;
                            font-style: italic;
                        }

                        h2 {
                            text-align: center;
                            margin: 20px 0;
                            color: #153f6d;
                        }

                        table {
                            width: 100%;
                            border-collapse: collapse;
                            margin-top: 20px;
                        }

                        th,
                        td {
                            border:
                                1px solid #ccc;
                            padding: 8px;
                            text-align: left;
                            font-size: 12px;
                        }

                        th {
                            background: #215fa5;
                            color: #ffffff;
                            font-weight: bold;
                        }

                        tbody tr:nth-child(even) {
                            background: #f6f9fc;
                        }
                    </style>
                </head>

                <body>
                    <div class="header">
                        ${
                            logoBase64
                                ? `
                                    <img
                                        src="${logoBase64}"
                                        alt="Clínicas Roca Maya"
                                        class="logo"
                                    >
                                `
                                : `
                                    <div class="logo-placeholder">
                                        Logo no disponible
                                    </div>
                                `
                        }

                        <div class="company-info">
                            <div class="company-name">
                                Clínicas Médicas Roca Maya
                            </div>

                            <div class="company-slogan">
                                Tu salud es nuestra seguridad
                            </div>
                        </div>
                    </div>

                    <h2>
                        Lista de Preclínica
                    </h2>

                    ${tablaClon.outerHTML}

                    <div
                        style="
                            margin-top:20px;
                            font-size:12px;
                            text-align:right;
                        "
                    >
                        <strong>
                            Total de registros:
                        </strong>

                        ${totalTexto}

                        <br>

                        <strong>
                            Generado el:
                        </strong>

                        ${new Date()
                            .toLocaleString()}
                    </div>
                </body>
            </html>
        `);

        ventana.document.close();

        setTimeout(() => {
            ventana.focus();
            ventana.print();
            ventana.close();
        }, 500);
    }

    async function cargarPreclinicaEnModal(
        idCita
    ) {
        try {
            const res = await fetch(
                `/preclinica/por-cita/${idCita}`,
                {
                    credentials:
                        "same-origin"
                }
            );

            if (res.status === 404) {
                abrirModal();

                if ($("selectCita")) {
                    $("selectCita").value =
                        idCita;

                    $("selectCita")
                        .dispatchEvent(
                            new Event("change")
                        );
                }

                return;
            }

            if (!res.ok) {
                throw new Error(
                    "HTTP " + res.status
                );
            }

            const j = await res.json();

            if (
                j &&
                j.success &&
                j.preclinica
            ) {
                const p = j.preclinica;

                abrirModal();

                if ($("idPreclinica")) {
                    $("idPreclinica").value =
                        p.ID_PRECLINICA || "";
                }

                if ($("selectCita")) {
                    $("selectCita").value =
                        p.ID_CITA;

                    $("selectCita")
                        .dispatchEvent(
                            new Event("change")
                        );
                }

                if ($("temperatura")) {
                    $("temperatura").value =
                        p.TEMPERATURA || "";
                }

                if ($("presionSistolica")) {
                    $("presionSistolica").value =
                        p.PRESION_SISTOLICA || "";
                }

                if ($("presionDiastolica")) {
                    $("presionDiastolica").value =
                        p.PRESION_DIASTOLICA || "";
                }

                if ($("frecuenciaCardiaca")) {
                    $("frecuenciaCardiaca").value =
                        p.FRECUENCIA_CARDIACA || "";
                }

                if ($("frecuenciaRespiratoria")) {
                    $("frecuenciaRespiratoria").value =
                        p.FRECUENCIA_RESPIRATORIA || "";
                }

                if ($("saturacionOxigeno")) {
                    $("saturacionOxigeno").value =
                        p.SATURACION_OXIGENO || "";
                }

                if ($("peso")) {
                    $("peso").value =
                        p.PESO || "";
                }

                if ($("talla")) {
                    $("talla").value =
                        p.TALLA || "";
                }

                if ($("glucosa")) {
                    $("glucosa").value =
                        p.GLUCOSA || "";
                }

                if ($("perimetroAbdominal")) {
                    $("perimetroAbdominal").value =
                        p.PERIMETRO_ABDOMINAL ||
                        "";
                }

                if ($("observaciones")) {
                    $("observaciones").value =
                        p.OBSERVACIONES || "";
                }

                if ($("estadoGeneral")) {
                    $("estadoGeneral").value =
                        p.ESTADO_GENERAL ||
                        "BUENO";
                }

                calcularIMC();
                actualizarModoModal();
                actualizarEstadosVisuales();

                requestAnimationFrame(() => {
                    reiniciarScrollModal();
                });
            }
        } catch (err) {
            console.error(
                "Error cargando preclínica por cita:",
                err
            );

            mostrarModalError(
                "No se pudo cargar la preclínica: " +
                err.message
            );
        }
    }

    function calcularIMC() {
        const peso = parseFloat(
            $("peso")?.value || 0
        );

        let tallaVal = parseFloat(
            $("talla")?.value || 0
        );

        if (
            !isNaN(tallaVal) &&
            tallaVal > 3 &&
            tallaVal <= 300
        ) {
            const converted =
                tallaVal / 100;

            if ($("talla")) {
                $("talla").value =
                    converted.toFixed(2);
            }

            tallaVal = converted;

            showInfoField(
                "talla-info",
                `Se interpretó ${
                    Math.round(
                        tallaVal * 100
                    )
                } cm y se convirtió a ${
                    tallaVal.toFixed(2)
                } m.`
            );
        } else {
            clearInfoField("talla-info");
        }

        if (!peso || !tallaVal) {
            if ($("imc")) {
                $("imc").value = "";
            }

            if ($("finIMC")) {
                $("finIMC").textContent =
                    "-";
            }

            actualizarEstadosVisuales();

            return;
        }

        const imc =
            peso /
            (tallaVal * tallaVal);

        const valor =
            isFinite(imc)
                ? imc.toFixed(2)
                : "";

        if ($("imc")) {
            $("imc").value = valor;
        }

        if ($("finIMC")) {
            $("finIMC").textContent =
                valor;
        }

        actualizarEstadosVisuales();
    }

    // ============================================================
    // VALIDACIÓN
    // ============================================================
    function validatePreclinicaFromForm() {
        const getRaw = id =>
            document.getElementById(id)
                ? document.getElementById(id).value
                : "";

        const idCita = Number(getRaw("selectCita") || 0);
        const temperatura = parseFloat(getRaw("temperatura") || "");
        const presionS = parseInt(getRaw("presionSistolica") || "", 10);
        const presionD = parseInt(getRaw("presionDiastolica") || "", 10);
        const fc = parseInt(getRaw("frecuenciaCardiaca") || "", 10);
        const fr = parseInt(getRaw("frecuenciaRespiratoria") || "", 10);
        const sat = parseFloat(getRaw("saturacionOxigeno") || "");
        const peso = parseFloat(getRaw("peso") || "");
        const tallaRaw = parseFloat(getRaw("talla") || "");
        const glucosa = parseFloat(getRaw("glucosa") || "");
        const perim = parseFloat(getRaw("perimetroAbdominal") || "");
        const observ = sanitizeInput(getRaw("observaciones") || "");
        const estadoGeneral = getRaw("estadoGeneral") || "BUENO";

        const errors = [];
        const infos = [];
        let talla = tallaRaw;

        if (!isNaN(tallaRaw) && tallaRaw > 3 && tallaRaw <= 300) {
            talla = tallaRaw / 100;
            infos.push({
                field: "talla",
                message: `Se detectó ${tallaRaw} como centímetros y se convirtió a ${talla.toFixed(2)} m.`,
                severity: "info"
            });
            if ($("talla")) $("talla").value = talla.toFixed(2);
        }

        if (!idCita || isNaN(idCita)) {
            errors.push({
                field: "selectCita",
                message: "Seleccione la cita.",
                severity: "critical"
            });
        }

        const camposPendientes = obtenerCamposPendientesFormulario();
        camposPendientes.forEach(campo => {
            errors.push({
                field: campo.id,
                message: `${campo.label}: dato pendiente de registrar.`,
                severity: "warning",
                pending: true
            });
        });

        const validarRango = (field, value, min, max, message) => {
            if (!isNaN(value) && (value < min || value > max)) {
                errors.push({ field, message, severity: "critical" });
            }
        };

        validarRango("temperatura", temperatura, 32, 42,
            "Temperatura fuera del rango permitido (32 - 42 °C). Verifique el valor.");
        validarRango("presionSistolica", presionS, 70, 220,
            "Presión sistólica fuera del rango permitido (70 - 220 mmHg). Verifique el valor.");
        validarRango("presionDiastolica", presionD, 40, 140,
            "Presión diastólica fuera del rango permitido (40 - 140 mmHg). Verifique el valor.");
        validarRango("frecuenciaCardiaca", fc, 30, 200,
            "Frecuencia cardíaca fuera del rango permitido (30 - 200 lpm). Verifique el valor.");
        validarRango("frecuenciaRespiratoria", fr, 8, 60,
            "Frecuencia respiratoria fuera del rango permitido (8 - 60 rpm). Verifique el valor.");
        validarRango("saturacionOxigeno", sat, 50, 100,
            "Saturación O₂ fuera del rango permitido (50 - 100%). Verifique el valor.");
        validarRango("peso", peso, 2, 500,
            "Peso fuera del rango permitido (2 - 500 kg). Verifique el valor.");
        validarRango("talla", talla, 0.5, 2.5,
            "Talla fuera del rango permitido (0.50 - 2.50 m). Verifique el valor.");
        validarRango("glucosa", glucosa, 30, 900,
            "Glucosa fuera del rango permitido (30 - 900 mg/dL). Verifique el valor.");
        validarRango("perimetroAbdominal", perim, 10, 300,
            "Perímetro abdominal fuera del rango permitido (10 - 300 cm). Verifique el valor.");

        const alertasClinicas = obtenerAlertasClinicas();
        alertasClinicas.forEach(alerta => {
            const duplicada = errors.some(
                error => error.field === alerta.field && error.severity === "critical"
            );
            if (!duplicada) {
                errors.push({
                    field: alerta.field,
                    message: alerta.message,
                    severity: "warning",
                    clinicalLevel: alerta.level
                });
            }
        });

        infos.forEach(info => errors.push(info));

        const imc =
            !isNaN(peso) && peso > 0 && !isNaN(talla) && talla > 0
                ? peso / (talla * talla)
                : null;

        const summary = {
            idCita,
            temperatura: isNaN(temperatura) ? "" : temperatura,
            presionS: isNaN(presionS) ? "" : presionS,
            presionD: isNaN(presionD) ? "" : presionD,
            fc: isNaN(fc) ? "" : fc,
            fr: isNaN(fr) ? "" : fr,
            sat: isNaN(sat) ? "" : sat,
            peso: isNaN(peso) ? "" : peso,
            talla: isNaN(talla) ? "" : talla,
            imc: imc ? imc.toFixed(2) : "",
            glucosa: isNaN(glucosa) ? "" : glucosa,
            perimetroAbdominal: isNaN(perim) ? "" : perim,
            observaciones: observ,
            estadoGeneral
        };

        const criticalPresent = errors.some(error => error.severity === "critical");

        return {
            ok: !criticalPresent,
            errors,
            summary,
            alertasClinicas,
            camposPendientes,
            incompleta: camposPendientes.length > 0
        };
    }

    function setFieldError(
        field,
        message,
        severity
    ) {
        const el =
            document.getElementById(field);

        const errEl =
            document.getElementById(
                field + "-error"
            );

        if (severity === "critical") {
            if (el) {
                el.classList.add(
                    "field-error"
                );
            }

            if (errEl) {
                errEl.textContent =
                    message;

                errEl.style.display =
                    "block";

                errEl.className =
                    "error-text";
            }
        } else if (
            severity === "warning"
        ) {
            if (el) {
                el.classList.add(
                    "field-warning"
                );
            }

            if (errEl) {
                errEl.textContent =
                    message;

                errEl.style.display =
                    "block";

                errEl.className =
                    "error-text";
            }
        } else if (
            severity === "info"
        ) {
            const infoTarget =
                document.getElementById(
                    field + "-info"
                ) ||
                document.getElementById(
                    field + "-error"
                );

            if (infoTarget) {
                infoTarget.textContent =
                    message;

                infoTarget.style.display =
                    "block";

                infoTarget.className =
                    "info-text";
            }
        }
    }

    function clearFieldError(field) {
        const el =
            document.getElementById(field);

        if (el) {
            el.classList.remove(
                "field-error"
            );

            el.classList.remove(
                "field-warning"
            );
        }

        const errEl =
            document.getElementById(
                field + "-error"
            );

        if (errEl) {
            errEl.textContent = "";
            errEl.style.display = "none";
        }

        const infoEl =
            document.getElementById(
                field + "-info"
            );

        if (infoEl) {
            infoEl.textContent = "";
            infoEl.style.display = "none";
        }
    }

    function clearAllFieldErrors() {
        const ids = [
            "selectCita",
            "temperatura",
            "presionSistolica",
            "presionDiastolica",
            "frecuenciaCardiaca",
            "frecuenciaRespiratoria",
            "saturacionOxigeno",
            "peso",
            "talla",
            "glucosa",
            "perimetroAbdominal",
            "observaciones"
        ];

        ids.forEach(clearFieldError);
    }

    function showInfoField(id, message) {
        const el =
            document.getElementById(id);

        if (!el) return;

        el.textContent = message;
        el.style.display = "block";
    }

    function clearInfoField(id) {
        const el =
            document.getElementById(id);

        if (!el) return;

        el.textContent = "";
        el.style.display = "none";
    }

    function renderValidationMessages(
        errors
    ) {
        const container =
            $("validationMessages");

        if (!container) return;

        clearAllFieldErrors();

        if (
            !errors ||
            errors.length === 0
        ) {
            container.innerHTML = `
                <div class="validation-ok">
                    <i class="fas fa-check-circle"></i>
                    No se detectaron problemas críticos.
                    Puedes continuar y confirmar para guardar.
                </div>
            `;

            return;
        }

        const critical =
            errors.filter(
                e =>
                    e.severity ===
                    "critical"
            );

        const warnings =
            errors.filter(
                e =>
                    e.severity ===
                    "warning"
            );

        const infos =
            errors.filter(
                e =>
                    e.severity ===
                    "info"
            );

        errors.forEach(e => {
            setFieldError(
                e.field,
                e.message,
                e.severity || "warning"
            );
        });

        let html = "";

        if (critical.length) {
            html += `
                <div class="validation-error">
                    <strong>
                        <i class="fas fa-times-circle"></i>
                        Errores obligatorios:
                    </strong>

                    <ul>
            `;

            critical.forEach(e => {
                html += `
                    <li>
                        ${escapeHtml(e.message)}
                    </li>
                `;
            });

            html += `
                    </ul>
                </div>
            `;
        }

        if (warnings.length) {
            html += `
                <div class="validation-list">
                    <strong>
                        <i class="fas fa-exclamation-triangle"></i>
                        Advertencias:
                    </strong>

                    <ul>
            `;

            warnings.forEach(e => {
                html += `
                    <li>
                        ${escapeHtml(e.message)}
                    </li>
                `;
            });

            html += `
                    </ul>
                </div>
            `;
        }

        if (infos.length) {
            html += `
                <div class="validation-info">
                    <strong>
                        <i class="fas fa-info-circle"></i>
                        Información:
                    </strong>

                    <ul>
            `;

            infos.forEach(e => {
                html += `
                    <li>
                        ${escapeHtml(e.message)}
                    </li>
                `;
            });

            html += `
                    </ul>
                </div>
            `;
        }

        container.innerHTML = html;
    }

    function renderConfirmSummary(summary) {
        const container =
            $("confirmSummary");

        if (!container) return;

        const rows = [
            {
                icon: "fa-calendar-check",
                label: "Cita ID",
                value: summary.idCita
            },
            {
                icon: "fa-weight",
                label: "Peso (kg)",
                value: summary.peso
            },
            {
                icon: "fa-ruler-vertical",
                label: "Talla (m)",
                value: summary.talla
            },
            {
                icon: "fa-calculator",
                label: "IMC",
                value: summary.imc
            },
            {
                icon: "fa-thermometer-half",
                label: "Temperatura (°C)",
                value: summary.temperatura
            },
            {
                icon: "fa-heartbeat",
                label: "Presión (S/D)",
                value:
                    (summary.presionS || "") +
                    (
                        summary.presionS
                            ? " / " +
                            (
                                summary.presionD ||
                                ""
                            )
                            : ""
                    )
            },
            {
                icon: "fa-heart",
                label: "FC (lpm)",
                value: summary.fc
            },
            {
                icon: "fa-lungs",
                label: "FR (rpm)",
                value: summary.fr
            },
            {
                icon: "fa-wind",
                label: "Saturación (%)",
                value: summary.sat
            },
            {
                icon: "fa-tint",
                label: "Glucosa (mg/dL)",
                value: summary.glucosa
            },
            {
                icon: "fa-ruler-horizontal",
                label: "Perímetro abdominal (cm)",
                value:
                    summary.perimetroAbdominal
            },
            {
                icon: "fa-user-check",
                label: "Estado general",
                value:
                    summary.estadoGeneral
            },
            {
                icon: "fa-notes-medical",
                label: "Observaciones",
                value:
                    summary.observaciones
            }
        ];

        let html = "";

        rows.forEach(row => {
            html += `
                <div class="confirm-field">
                    <strong>
                        <i class="fas ${row.icon}"></i>
                        ${escapeHtml(row.label)}:
                    </strong>

                    <div>
                        ${escapeHtml(
                            String(row.value || "")
                        )}
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    }

    // ============================================================
    // ENVÍO DE LA PRECLÍNICA
    // ============================================================

    async function submitPreclinica(
        payload,
        isUpdate = false
    ) {
        if (submitting) return;

        submitting = true;

        const btn =
            $("btnConfirmPreclinica");

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `
                <i class="fas fa-spinner fa-spin"></i>
                Guardando...
            `;
        }

        try {
            let url =
                "/preclinica/nueva";

            if (isUpdate) {
                url =
                    "/preclinica/actualizar";

                payload.idPreclinica =
                    Number(
                        $("idPreclinica")
                            ?.value
                    ) ||
                    payload.idPreclinica;

                payload.idCita =
                    Number(payload.idCita);
            }

            const res = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type":
                        "application/json"
                },
                credentials:
                    "same-origin",
                body:
                    JSON.stringify(payload)
            });

            const contentType =
                res.headers.get(
                    "content-type"
                );

            const json =
                contentType?.includes(
                    "application/json"
                )
                    ? await res
                        .json()
                        .catch(() => null)
                    : null;

            if (!res.ok) {
                closeConfirmModal();

                mostrarModalError(
                    (
                        json &&
                        json.message
                    ) ||
                    "Error " + res.status
                );

                return;
            }

            mostrarAlerta(
                "success",
                (
                    json &&
                    json.message
                ) ||
                "Preclínica guardada correctamente"
            );

            closeConfirmModal();
            closePreclinicaModal();

            await cargarDatos();

            try {
                const bc =
                    new BroadcastChannel(
                        "citas_channel"
                    );

                const nuevoEstado =
                    (
                        json &&
                        json.nota_estado_actualizado
                    ) ||
                    "PRECLINICA";

                bc.postMessage({
                    type:
                        "preclinica_saved",
                    idCita:
                        Number(
                            payload.idCita
                        ),
                    nuevoEstado
                });

                bc.postMessage({
                    type:
                        "estado_cita",
                    id:
                        Number(
                            payload.idCita
                        ),
                    nuevoEstado
                });

                bc.close();
            } catch (error) {
                console.warn(
                    "BroadcastChannel no disponible:",
                    error
                );
            }
        } catch (err) {
            console.error(
                "Error guardando preclínica:",
                err
            );

            closeConfirmModal();

            mostrarModalError(
                "Error guardando: " +
                err.message
            );
        } finally {
            submitting = false;

            if (btn) {
                btn.disabled = false;

                btn.innerHTML = `
                    <i class="fas fa-check"></i>
                    Confirmar y Guardar
                `;
            }
        }
    }

    function configurarAccionesConfirmacion(validation) {
        const btnEnviar = $("btnConfirmPreclinica");
        const btnGuardarSinEnviar = $("btnGuardarSinEnviar");
        const mensajeFooter = document.querySelector(
            "#confirmPreclinicaModal .pre-footer-message"
        );

        const incompleta = Boolean(validation?.camposPendientes?.length);

        if (btnGuardarSinEnviar) {
            btnGuardarSinEnviar.style.display = incompleta ? "inline-flex" : "none";
        }

        if (btnEnviar) {
            btnEnviar.innerHTML = incompleta
                ? '<i class="fas fa-paper-plane"></i> Guardar y enviar con alerta'
                : '<i class="fas fa-paper-plane"></i> Guardar y enviar a consulta';
        }

        if (mensajeFooter) {
            mensajeFooter.textContent = incompleta
                ? "La preclínica puede guardarse sin enviar, o enviarse a Consulta Médica con datos pendientes."
                : "La preclínica se guardará y la cita pasará a Consulta Médica.";
        }
    }
    async function guardarHandler() {
        const validation = validatePreclinicaFromForm();
        ultimaValidacion = validation;

        renderValidationMessages(validation.errors);
        actualizarEstadosVisuales();

        if (!validation.ok) {
            const firstCritical = validation.errors.find(
                error => error.severity === "critical"
            );

            if (firstCritical && document.getElementById(firstCritical.field)) {
                const campo = document.getElementById(firstCritical.field);
                campo.focus();
                campo.scrollIntoView({ behavior: "smooth", block: "center" });
            }
            return;
        }

        renderConfirmVitalAlerts(
            validation.alertasClinicas || [],
            validation.camposPendientes || []
        );
        renderConfirmSummary(validation.summary);
        configurarAccionesConfirmacion(validation);
        openConfirmModal();
    }
    function gatherPayloadFromForm(enviarAConsulta = true) {
        const get = id =>
            document.getElementById(id)
                ? document.getElementById(id).value
                : "";

        const numeroOpcional = (id, parser = parseFloat) => {
            const raw = String(get(id) || "").trim();
            if (!raw) return null;
            const value = parser === parseInt ? parseInt(raw, 10) : parser(raw);
            return Number.isFinite(value) ? value : null;
        };

        const camposPendientes = obtenerCamposPendientesFormulario();
        const alertasClinicas = obtenerAlertasClinicas();

        return {
            idCita: Number(get("selectCita") || 0),
            temperatura: numeroOpcional("temperatura"),
            presionSistolica: numeroOpcional("presionSistolica", parseInt),
            presionDiastolica: numeroOpcional("presionDiastolica", parseInt),
            frecuenciaCardiaca: numeroOpcional("frecuenciaCardiaca", parseInt),
            frecuenciaRespiratoria: numeroOpcional("frecuenciaRespiratoria", parseInt),
            saturacionOxigeno: numeroOpcional("saturacionOxigeno"),
            peso: numeroOpcional("peso"),
            talla: numeroOpcional("talla"),
            glucosa: numeroOpcional("glucosa"),
            perimetroAbdominal: numeroOpcional("perimetroAbdominal"),
            observaciones: sanitizeInput(get("observaciones") || ""),
            estadoGeneral: get("estadoGeneral") || "BUENO",
            enviarAConsulta: Boolean(enviarAConsulta),
            signosVitalesJson: {
                temperatura: get("temperatura") || null,
                presionSistolica: get("presionSistolica") || null,
                presionDiastolica: get("presionDiastolica") || null,
                frecuenciaCardiaca: get("frecuenciaCardiaca") || null,
                frecuenciaRespiratoria: get("frecuenciaRespiratoria") || null,
                saturacionOxigeno: get("saturacionOxigeno") || null,
                peso: get("peso") || null,
                talla: get("talla") || null,
                glucosa: get("glucosa") || null,
                perimetroAbdominal: get("perimetroAbdominal") || null,
                controlConsulta: {
                    incompleta: camposPendientes.length > 0,
                    camposPendientes: camposPendientes.map(campo => campo.label),
                    alertaActiva: Boolean(enviarAConsulta && camposPendientes.length),
                    mensaje: camposPendientes.length
                        ? "La preclínica fue enviada con datos pendientes de registrar."
                        : "Preclínica completa.",
                    alertasClinicas: alertasClinicas.map(alerta => ({
                        field: alerta.field,
                        level: alerta.level,
                        message: alerta.message
                    }))
                }
            }
        };
    }

    function openConfirmModal() {
        const modal =
            $("confirmPreclinicaModal");

        if (!modal) return;

        modal.style.display = "flex";

        modal.setAttribute(
            "aria-hidden",
            "false"
        );

        sincronizarBloqueoPagina();

        const confirmSummary =
            $("confirmSummary");

        if (confirmSummary) {
            confirmSummary.scrollTop = 0;
        }
    }

    function closeConfirmModal() {
        const modal =
            $("confirmPreclinicaModal");

        if (!modal) return;

        modal.style.display = "none";

        modal.setAttribute(
            "aria-hidden",
            "true"
        );

        sincronizarBloqueoPagina();
    }

    function mostrarAlerta(tipo, texto) {
        const el =
            tipo === "success"
                ? $("alertSuccessPre")
                : $("alertErrorPre");

        if (!el) {
            alert(texto);
            return;
        }

        const contenido =
            tipo === "success"
                ? $("successMessagePre")
                : $("errorMessagePre");

        if (contenido) {
            contenido.textContent =
                texto;
        }

        el.style.display = "flex";

        setTimeout(() => {
            el.style.display = "none";
        }, 3000);
    }

    function mostrarModalError(texto) {
        const el = $("modalError");

        if (!el) {
            alert(texto);
            return;
        }

        el.innerHTML = `
            <i class="fas fa-exclamation-circle"></i>
            <span>
                ${escapeHtml(texto)}
            </span>
        `;

        el.style.display = "flex";

        const modalBody =
            document.querySelector(
                "#modalPreclinica .pre-modal-body"
            );

        if (modalBody) {
            modalBody.scrollTo({
                top: 0,
                behavior: "smooth"
            });
        }
    }

    // ============================================================
    // MANEJO DE CLICS
    // ============================================================

    document.addEventListener(
        "click",
        ev => {
            const button =
                ev.target.closest("button");

            if (!button) return;

            const action =
                button.dataset.action;

            const id =
                button.dataset.id;

            // Manejar abrir/editar preclínica
            if (action === "abrirPreclinica") {
                ev.preventDefault();
                cargarPreclinicaEnModal(id);
                return;
            }

            // Manejar eliminar preclínica
            if (action === "eliminarPreclinica") {
                ev.preventDefault();
                eliminarPreclinica(id, button);
                return;
            }

            if (
                button.id ===
                "btnNuevaPreclinica"
            ) {
                ev.preventDefault();

                abrirModal();

                return;
            }

            if (
                button.id ===
                "btnCerrarModalPreclinica" ||
                button.id ===
                "btnCancelarPreclinica"
            ) {
                ev.preventDefault();

                closePreclinicaModal();

                return;
            }

            if (
                button.id ===
                "btnGuardarPreclinica"
            ) {
                ev.preventDefault();

                guardarHandler();

                return;
            }

            if (
                button.id ===
                "btnConfirmPreclinica"
            ) {
                ev.preventDefault();

                const payload =
                    gatherPayloadFromForm(true);

                const isUpdate =
                    Boolean(
                        $("idPreclinica") &&
                        $("idPreclinica")
                            .value
                    );

                submitPreclinica(
                    payload,
                    isUpdate
                );

                return;
            }

            if (
                button.id ===
                "btnGuardarSinEnviar"
            ) {
                ev.preventDefault();

                const payload =
                    gatherPayloadFromForm(false);

                const isUpdate =
                    Boolean(
                        $("idPreclinica") &&
                        $("idPreclinica")
                            .value
                    );

                submitPreclinica(
                    payload,
                    isUpdate
                );

                return;
            }

            if (
                button.id ===
                "btnEditPreclinica" ||
                button.id ===
                "btnCloseConfirm"
            ) {
                ev.preventDefault();

                closeConfirmModal();

                return;
            }
        }
    );

    const handleFilterChange =
        debounce(() => {
            renderTabla();
        }, 300);

    // ============================================================
    // INICIALIZACIÓN
    // ============================================================

    document.addEventListener(
        "DOMContentLoaded",
        () => {
            [
                "btnGuardarPreclinica",
                "btnNuevaPreclinica",
                "btnCancelarPreclinica",
                "btnCerrarModalPreclinica",
                "btnConfirmPreclinica",
                "btnGuardarSinEnviar",
                "btnEditPreclinica",
                "btnCloseConfirm",
                "btnImprimirPreclinica"
            ].forEach(id => {
                const el = $(id);

                if (
                    el &&
                    el.tagName === "BUTTON"
                ) {
                    el.type = "button";
                }
            });

            const logoBtn =
                $("logoBtn");

            if (logoBtn) {
                logoBtn.type = "button";

                logoBtn.addEventListener(
                    "click",
                    event => {
                        event.preventDefault();

                        window.location.href =
                            "/";
                    }
                );
            }

            const btnImprimir =
                $("btnImprimirPreclinica");

            if (btnImprimir) {
                btnImprimir.addEventListener(
                    "click",
                    async () => {
                        try {
                            const logoBase64 =
                                await imageToBase64(
                                    "/roca-maya-oct.jpg"
                                );

                            await generarVentanaImpresionPreclinica(
                                logoBase64
                            );
                        } catch (error) {
                            console.log(
                                "No se pudo cargar el logo, usando versión sin logo",
                                error
                            );

                            await generarVentanaImpresionPreclinica(
                                null
                            );
                        }
                    }
                );
            }

            cargarDatos();

            const inputBusqueda =
                $("filtroPaciente");

            if (inputBusqueda) {
                inputBusqueda.addEventListener(
                    "input",
                    event => {
                        const cleanValue =
                            sanitizeSearch(
                                event.target.value
                            );

                        event.target.value =
                            cleanValue;

                        filtroBusquedaPaciente =
                            cleanValue;

                        handleFilterChange();
                    }
                );
            }

            const selectDoctor =
                $("filtroDoctor");

            if (selectDoctor) {
                selectDoctor.addEventListener(
                    "change",
                    event => {
                        filtroBusquedaDoctor =
                            event.target.value;

                        renderTabla();
                    }
                );
            }

            const inputFecha =
                $("filtroFecha");

            if (inputFecha) {
                inputFecha.addEventListener(
                    "change",
                    event => {
                        filtroBusquedaFecha =
                            event.target.value;

                        renderTabla();
                    }
                );
            }

            const selectEstado =
                $("filtroEstadoCita");

            if (selectEstado) {
                selectEstado.addEventListener(
                    "change",
                    event => {
                        filtroBusquedaEstado =
                            event.target.value;

                        renderTabla();
                    }
                );
            }

            const inputObservaciones =
                $("observaciones");

            if (inputObservaciones) {
                inputObservaciones.addEventListener(
                    "input",
                    event => {
                        const cleanValue =
                            sanitizeInput(
                                event.target.value
                            );

                        event.target.value =
                            cleanValue;
                    }
                );
            }

            $("peso")?.addEventListener(
                "input",
                debounce(
                    calcularIMC,
                    80
                )
            );

            $("talla")?.addEventListener(
                "input",
                debounce(
                    calcularIMC,
                    80
                )
            );

            $("selectCita")
                ?.addEventListener(
                    "change",
                    () => {
                        const opt =
                            $("selectCita")
                                .selectedOptions[0];

                        const info = [];

                        if (
                            opt?.dataset.telefono
                        ) {
                            info.push(
                                "Tel: " +
                                opt.dataset.telefono
                            );
                        }

                        if (
                            opt?.dataset.correo
                        ) {
                            info.push(
                                opt.dataset.correo
                            );
                        }

                        if ($("pacienteInfo")) {
                            $("pacienteInfo")
                                .textContent =
                                info.join(" • ");
                        }

                        actualizarEstadosVisuales();
                    }
                );

            [
                "temperatura",
                "presionSistolica",
                "presionDiastolica",
                "frecuenciaCardiaca",
                "frecuenciaRespiratoria",
                "saturacionOxigeno",
                "peso",
                "talla",
                "glucosa",
                "perimetroAbdominal",
                "observaciones",
                "estadoGeneral"
            ].forEach(id => {
                const el = $(id);

                if (!el) return;

                const eventName =
                    el.tagName === "SELECT"
                        ? "change"
                        : "input";

                el.addEventListener(
                    eventName,
                    debounce(
                        actualizarEstadosVisuales,
                        70
                    )
                );
            });

            // ============================================================
            // MEJORAS VISUALES: PLACEHOLDERS
            // ============================================================

            const fieldPlaceholders = {
                temperatura: 'Ej: 36.5 °C',
                presionSistolica: 'Ej: 120 mmHg',
                presionDiastolica: 'Ej: 80 mmHg',
                frecuenciaCardiaca: 'Ej: 72 lpm',
                frecuenciaRespiratoria: 'Ej: 16 rpm',
                saturacionOxigeno: 'Ej: 98 %',
                peso: 'Ej: 75.5 kg',
                talla: 'Ej: 1.80 m',
                glucosa: 'Ej: 90 mg/dL',
                perimetroAbdominal: 'Ej: 85 cm',
                observaciones: 'Observaciones clínicas relevantes...'
            };

            Object.entries(fieldPlaceholders).forEach(([id, placeholder]) => {
                const input = document.getElementById(id);
                if (input && !input.placeholder) {
                    input.placeholder = placeholder;
                }
            });

            // ============================================================
            // OBSERVADOR PARA MANTENER SCROLL
            // ============================================================

            const modalPreclinica = document.getElementById('modalPreclinica');
            if (modalPreclinica) {
                const observer = new MutationObserver(() => {
                    const modalBody = document.querySelector('#modalPreclinica .pre-modal-body');
                    if (modalBody && modalPreclinica.style.display !== 'none') {
                        // El scroll se mantiene automáticamente
                    }
                });
                observer.observe(modalPreclinica, { attributes: true, attributeFilter: ['style'] });
            }

            actualizarModoModal();
            actualizarEstadosVisuales();
            sincronizarBloqueoPagina();

            try {
                const bc =
                    new BroadcastChannel(
                        "citas_channel"
                    );

                bc.onmessage = event => {
                    const data =
                        event.data || {};

                    if (!data) return;

                    if (
                        data.type ===
                            "estado_cita" ||
                        data.type ===
                            "preclinica_saved" ||
                        data.type ===
                            "preclinica_deleted"
                    ) {
                        cargarDatos();
                    }
                };
            } catch (error) {
                console.warn(
                    "BroadcastChannel no disponible:",
                    error
                );
            }
        }
    );

    // ============================================================
// EXPONER FUNCIONES PARA CONSULTA MÉDICA
// ============================================================

/**
 * Renderiza los campos de preclínica en un contenedor dado
 * @param {number|string} idCita - ID de la cita
 * @param {string|Element} containerSelector - Selector o elemento donde renderizar
 */
window.Preclinica = window.Preclinica || {};
window.Preclinica.renderizarCampos = async function(idCita, containerSelector) {
    const container = typeof containerSelector === 'string' 
        ? document.querySelector(containerSelector) 
        : containerSelector;
    if (!container) {
        console.warn('Contenedor no encontrado para renderizar preclínica');
        return;
    }

    try {
        const res = await fetch(`/preclinica/por-cita/${idCita}`, {
            credentials: 'same-origin'
        });
        if (res.status === 404) {
            // Limpiar campos si no existe preclínica
            container.querySelectorAll('input, textarea').forEach(el => el.value = '');
            return;
        }
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        if (data.success && data.preclinica) {
            const p = data.preclinica;
            const setField = (id, val) => {
                const el = container.querySelector(`#${id}`) || document.getElementById(id);
                if (el) el.value = val == null ? '' : String(val);
            };
            setField('temperatura', p.TEMPERATURA);
            setField('presionSistolica', p.PRESION_SISTOLICA);
            setField('presionDiastolica', p.PRESION_DIASTOLICA);
            setField('frecuenciaCardiaca', p.FRECUENCIA_CARDIACA);
            setField('frecuenciaRespiratoria', p.FRECUENCIA_RESPIRATORIA);
            setField('saturacionOxigeno', p.SATURACION_OXIGENO);
            setField('peso', p.PESO);
            setField('talla', p.TALLA);
            setField('glucosa', p.GLUCOSA);
            setField('perimetroAbdominal', p.PERIMETRO_ABDOMINAL);
            setField('observaciones', p.OBSERVACIONES);
            const estadoGeneral = container.querySelector('#estadoGeneral') || document.getElementById('estadoGeneral');
            if (estadoGeneral) estadoGeneral.value = p.ESTADO_GENERAL || 'BUENO';
            const imcField = container.querySelector('#imc') || document.getElementById('imc');
            if (imcField) {
                const peso = parseFloat(p.PESO) || 0;
                const talla = parseFloat(p.TALLA) || 0;
                if (peso && talla) {
                    const imc = peso / (talla * talla);
                    if (isFinite(imc)) imcField.value = imc.toFixed(2);
                }
            }
        }
    } catch (err) {
        console.warn('Error renderizando preclínica:', err);
    }
};

/**
 * Obtiene los datos del formulario de preclínica desde un contenedor
 * @param {Element} container - El contenedor de los campos
 * @returns {Object} Datos de preclínica
 */
window.Preclinica.obtenerDatosFormulario = function(container) {
    if (!container) return {};
    const getVal = (id) => {
        const el = container.querySelector(`#${id}`) || document.getElementById(id);
        return el ? el.value : null;
    };
    const data = {
        temperatura: parseFloat(getVal('temperatura')) || null,
        presionSistolica: parseInt(getVal('presionSistolica'), 10) || null,
        presionDiastolica: parseInt(getVal('presionDiastolica'), 10) || null,
        peso: parseFloat(getVal('peso')) || null,
        talla: parseFloat(getVal('talla')) || null,
        imc: parseFloat(getVal('imc')) || null,
        frecuenciaCardiaca: parseInt(getVal('frecuenciaCardiaca'), 10) || null,
        frecuenciaRespiratoria: parseInt(getVal('frecuenciaRespiratoria'), 10) || null,
        saturacionOxigeno: parseInt(getVal('saturacionOxigeno'), 10) || null,
        glucosa: parseInt(getVal('glucosa'), 10) || null,
        perimetroAbdominal: parseInt(getVal('perimetroAbdominal'), 10) || null,
        observaciones: getVal('observaciones') || null,
        estadoGeneral: getVal('estadoGeneral') || 'BUENO'
    };
    return data;
};

/**
 * Guarda la preclínica (crea o actualiza)
 * @param {Object} payload - Datos de preclínica (debe incluir idCita y campos)
 * @returns {Promise<Object>} Respuesta del servidor
 */
window.Preclinica.guardarPreclinica = async function(payload) {
    if (!payload || !payload.idCita) {
        throw new Error('Falta idCita para guardar preclínica');
    }
    // Verificar si ya existe para decidir entre POST /nueva o POST /actualizar
    let idPreclinica = payload.idPreclinica || null;
    if (!idPreclinica) {
        // Intentar obtener la existente
        try {
            const existing = await window.Preclinica.obtenerPreclinicaPorCita(payload.idCita);
            if (existing && existing.success && existing.preclinica) {
                idPreclinica = existing.preclinica.ID_PRECLINICA;
            }
        } catch (e) { /* ignorar */ }
    }
    const url = idPreclinica ? '/preclinica/actualizar' : '/preclinica/nueva';
    if (idPreclinica) payload.idPreclinica = idPreclinica;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload)
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Error desconocido' }));
        throw new Error(err.message || `HTTP ${res.status}`);
    }
    return await res.json();
};

/**
 * Obtiene la preclínica existente por ID de cita
 * @param {number} idCita
 * @returns {Promise<Object>} Respuesta del servidor
 */
window.Preclinica.obtenerPreclinicaPorCita = async function(idCita) {
    const res = await fetch(`/preclinica/por-cita/${idCita}`, {
        credentials: 'same-origin'
    });
    if (res.status === 404) return { success: false, preclinica: null };
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
};

/**
 * Alterna la visibilidad del bloque de preclínica en el modal de consulta
 * (esta función usa window.togglePreclinica si está definida, o la implementa localmente)
 */
window.Preclinica.toggleVisibility = function() {
    if (typeof window.togglePreclinica === 'function') {
        window.togglePreclinica();
        return;
    }
    // Fallback local
    const fields = document.getElementById('preclinicaFields');
    const btn = document.getElementById('togglePreclinica');
    if (!fields || !btn) return;
    const isHidden = fields.style.display === 'none';
    fields.style.display = isHidden ? 'grid' : 'none';
    btn.innerHTML = isHidden
        ? '<i class="fas fa-eye-slash"></i> Ocultar'
        : '<i class="fas fa-eye"></i> Mostrar';
    localStorage.setItem('preclinicaVisible', isHidden ? 'true' : 'false');
};
    // ============================================================
    // PROTECCIÓN CONTRA CIERRES ACCIDENTALES
    // ============================================================
    // Los modales no se cierran al hacer clic en el fondo ni al pulsar Escape.
    // La preclínica solo se cierra mediante los botones Cancelar o X.
    // La confirmación solo se cierra mediante Editar o X.

    window.__preclinica_debug = {
        cargarDatos,
        preclinicas,
        llenarSelectDoctores,
        obtenerAlertasClinicas,
        actualizarPanelAlertasClinicas,
        actualizarEstadosVisuales,
        sincronizarBloqueoPagina
    };
})();