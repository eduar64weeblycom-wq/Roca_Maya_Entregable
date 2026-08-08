// public/js/citas.js
// Gestión de citas médicas + vista calendario

(function() {
    console.log("✅ public/js/citas.js V9 cargado");
    let citasData = [];
    let doctoresData = [];
    let pacientesData = [];
    let processingCitas = new Set();
    let submitInProgress = false;
    let editSubmitInProgress = false;

    let fechaActual = new Date();
    let mesCalendarioActual = fechaActual.getMonth();
    let anioCalendarioActual = fechaActual.getFullYear();
    const nombresMeses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

    let metadata = { tipos: [], prioridades: [], canales: [], duraciones: [] };
    let vistaCitasActual = "tabla";
    let datosFiltrados = [];
    let fechaCalendarioSeleccionada = null;
    let citaPendienteEspecialidad = null;
    let asignacionEspecialidadEnProceso = false;

    // Caché compartida para evitar peticiones repetidas y errores 429.
    let directorioEspecialidadesCache = null;
    let directorioEspecialidadesPromise = null;

    const $ = id => document.getElementById(id);

    function escapeHtml(s) {
        if (s === undefined || s === null) return "";
        return String(s)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function debounce(fn, wait = 300) {
        let t;
        return (...args) => {
            clearTimeout(t);
            t = setTimeout(() => {
                fn(...args);
            }, wait);
        };
    }

    async function imageToBase64(url) {
        const response = await fetch(url);
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    function normalizarFecha(fecha) {
        if (!fecha) return null;
        let fechaObj;
        if (fecha instanceof Date) {
            fechaObj = new Date(fecha);
        } else if (typeof fecha === 'string') {
            if (fecha.includes('/') || fecha.includes('-')) {
                const partes = fecha.split(/[\/\-]/);
                if (partes.length === 3) {
                    if (partes[0].length === 4) {
                        fechaObj = new Date(parseInt(partes[0]), parseInt(partes[1]) - 1, parseInt(partes[2]));
                    } else {
                        fechaObj = new Date(parseInt(partes[2]), parseInt(partes[1]) - 1, parseInt(partes[0]));
                    }
                } else {
                    fechaObj = new Date(fecha);
                }
            } else {
                fechaObj = new Date(fecha);
            }
        } else {
            return null;
        }
        if (isNaN(fechaObj.getTime())) return null;
        fechaObj.setHours(0, 0, 0, 0);
        return fechaObj;
    }

    function ordenarAlfabeticamente(arr, campo) {
        return [...arr].sort((a, b) => {
            const valA = (a[campo] || '').toLowerCase();
            const valB = (b[campo] || '').toLowerCase();
            return valA.localeCompare(valB);
        });
    }

    function normalizarDoctores(doctores = []) {
        const mapa = new Map();

        doctores.forEach(doctor => {
            const id = String(doctor.ID_DOCTOR || doctor.ID_USUARIO || "").trim();
            if (!id) return;

            if (!mapa.has(id)) {
                mapa.set(id, {
                    ...doctor,
                    ID_DOCTOR: doctor.ID_DOCTOR || doctor.ID_USUARIO,
                    ESPECIALIDADES: [],
                    ESPECIALIDADES_TEXTO: ""
                });
            }

            const actual = mapa.get(id);
            const idEspecialidad = doctor.ID_ESPECIALIDAD || doctor.ID_ESPECIALIDAD_CITA || null;
            const nombreEspecialidad = doctor.ESPECIALIDAD || doctor.NOMBRE_ESPECIALIDAD || "";

            if (nombreEspecialidad) {
                const existe = actual.ESPECIALIDADES.some(item =>
                    idEspecialidad
                        ? String(item.ID_ESPECIALIDAD) === String(idEspecialidad)
                        : String(item.NOMBRE_ESPECIALIDAD).toLowerCase() === String(nombreEspecialidad).toLowerCase()
                );

                if (!existe) {
                    actual.ESPECIALIDADES.push({
                        ID_ESPECIALIDAD: idEspecialidad,
                        NOMBRE_ESPECIALIDAD: nombreEspecialidad
                    });
                }
            }
        });

        const lista = [...mapa.values()].map(doctor => {
            doctor.ESPECIALIDADES_TEXTO = doctor.ESPECIALIDADES
                .map(item => item.NOMBRE_ESPECIALIDAD)
                .filter(Boolean)
                .join(", ");
            return doctor;
        });

        return ordenarAlfabeticamente(lista, "NOMBRE");
    }

    async function cargarDatosReales(force = false) {
        try {
            const res = await fetch("/citas/api/datos", {
                credentials: "same-origin",
                cache: force ? "no-store" : "default"
            });

            if (!res.ok) throw new Error("HTTP " + res.status);

            const json = await res.json();

            citasData = json.citas || [];
            doctoresData = normalizarDoctores(json.doctores || []);
            pacientesData = ordenarAlfabeticamente(json.pacientes || [], 'NOMBRES');
            metadata = json.metadata || metadata;

            const duplicadosOcultos = Number(
                metadata.duplicadosExactosOcultos || 0
            );

            if (duplicadosOcultos > 0) {
                console.warn(
                    `${duplicadosOcultos} cita(s) duplicada(s) exacta(s) fueron ocultadas en la vista.`
                );
            }

            actualizarContadorPacientes();
            llenarFiltroDoctores();
            llenarMetadataSelects();
            llenarFiltroEstados();

            aplicarFiltros();

        } catch (err) {
            console.error("Error cargando datos:", err);
            mostrarMensaje("error", "Error cargando datos: " + err.message);
        }
    }

    function llenarFiltroDoctores(filter = "") {
        const sel = $("filtroDoctor");
        if (!sel) return;

        sel.innerHTML = '<option value="">Todos los doctores</option>';
        const q = String(filter || "").trim().toLowerCase();

        doctoresData.forEach(d => {
            const especialidades = d.ESPECIALIDADES_TEXTO || d.ESPECIALIDAD || "Sin especialidad";
            const label = `Dr. ${d.NOMBRE} - ${especialidades}`;
            if (q && !label.toLowerCase().includes(q)) return;

            const opt = document.createElement("option");
            opt.value = d.ID_DOCTOR;
            opt.textContent = label;
            sel.appendChild(opt);
        });
    }

    function llenarFiltroEstados() {
        const sel = $("filtroEstado");
        if (!sel) return;

        const estados = new Set();
        citasData.forEach(c => {
            if (c.ESTADO) estados.add(c.ESTADO);
        });

        sel.innerHTML = '<option value="">Todos los estados</option>';
        const estadosOrdenados = ["PROGRAMADA", "CONFIRMADA", "PRECLINICA", "CONSULTA_MEDICA", "FINALIZADA", "NO_ASISTIO", "CANCELADA"];
        
        estadosOrdenados.forEach(e => {
            if (estados.has(e)) {
                const opt = document.createElement("option");
                opt.value = e;
                opt.textContent = formatLabel(e);
                sel.appendChild(opt);
            }
        });
    }

    function llenarMetadataSelects() {
        const selects = [
            { sel: $("selectTipoCita"), items: metadata.tipos, label: "Seleccionar tipo..." },
            { sel: $("selectPrioridad"), items: metadata.prioridades, label: "Seleccionar prioridad..." },
            { sel: $("selectCanal"), items: metadata.canales, label: "Seleccionar canal..." },
            { sel: $("editSelectTipoCita"), items: metadata.tipos, label: "Seleccionar tipo..." },
            { sel: $("editSelectPrioridad"), items: metadata.prioridades, label: "Seleccionar prioridad..." },
            { sel: $("editSelectCanal"), items: metadata.canales, label: "Seleccionar canal..." }
        ];

        selects.forEach(({ sel, items, label }) => {
            if (!sel) return;
            sel.innerHTML = `<option value="">${label}</option>`;
            if (items && items.length > 0) {
                items.forEach(item => {
                    const option = new Option(formatLabel(item), item);
                    sel.appendChild(option);
                });
            }
        });

        // Duraciones
        const duraciones = $("selectDuracion");
        const editDuraciones = $("editSelectDuracion");
        const duracionOptions = metadata.duraciones && metadata.duraciones.length > 0 ? metadata.duraciones : [15, 20, 30, 45, 60];
        
        [duraciones, editDuraciones].forEach(sel => {
            if (!sel) return;
            sel.innerHTML = '';
            duracionOptions.forEach(d => {
                const option = new Option(String(d) + " minutos", d);
                if (d === 30) option.selected = true;
                sel.appendChild(option);
            });
        });
    }

    function formatLabel(key) {
        return String(key).replace(/_/g, " ").toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
    }

    function obtenerEspecialidadesDoctorLocal(idDoctor) {
        const doctor = doctoresData.find(d => String(d.ID_DOCTOR) === String(idDoctor));
        return Array.isArray(doctor?.ESPECIALIDADES) ? doctor.ESPECIALIDADES : [];
    }

    function reiniciarSelectorEspecialidad(isEdit = false, mensaje = "Seleccione primero un doctor") {
        const select = isEdit ? $("editSelectEspecialidadCita") : $("selectEspecialidadCita");
        const info = isEdit ? $("editEspecialidadCitaInfo") : $("especialidadCitaInfo");

        if (select) {
            select.innerHTML = `<option value="">${escapeHtml(mensaje)}</option>`;
            select.value = "";
            select.disabled = true;
        }

        if (info) {
            info.textContent = "Solo se mostrarán las especialidades asignadas al médico seleccionado.";
            info.classList.remove("text-danger", "text-success");
        }
    }

    function poblarSelectorEspecialidad(especialidades, isEdit = false, seleccionada = "") {
        const select = isEdit ? $("editSelectEspecialidadCita") : $("selectEspecialidadCita");
        const info = isEdit ? $("editEspecialidadCitaInfo") : $("especialidadCitaInfo");

        if (!select) return;

        select.innerHTML = '<option value="">Seleccione una especialidad</option>';

        especialidades.forEach(especialidad => {
            const option = document.createElement("option");
            option.value = especialidad.ID_ESPECIALIDAD;
            option.textContent = especialidad.NOMBRE_ESPECIALIDAD;
            select.appendChild(option);
        });

        select.disabled = especialidades.length === 0;

        const seleccionExiste = especialidades.some(especialidad =>
            String(especialidad.ID_ESPECIALIDAD) === String(seleccionada)
        );

        if (seleccionExiste) {
            select.value = String(seleccionada);
        } else if (especialidades.length === 1) {
            select.value = String(especialidades[0].ID_ESPECIALIDAD);
        }

        if (info) {
            if (especialidades.length === 0) {
                info.textContent = "El médico seleccionado no tiene especialidades activas asignadas.";
                info.classList.add("text-danger");
                info.classList.remove("text-success");
            } else {
                info.textContent = especialidades.length === 1
                    ? `Especialidad asignada automáticamente: ${especialidades[0].NOMBRE_ESPECIALIDAD}.`
                    : `${especialidades.length} especialidades disponibles. Seleccione la correspondiente a esta cita.`;
                info.classList.add("text-success");
                info.classList.remove("text-danger");
            }
        }
    }

    async function obtenerDirectorioEspecialidades() {
        if (directorioEspecialidadesCache) {
            return directorioEspecialidadesCache;
        }

        if (!directorioEspecialidadesPromise) {
            directorioEspecialidadesPromise = fetch("/especialidades/api/datos", {
                credentials: "same-origin",
                headers: { Accept: "application/json" },
                cache: "no-store"
            })
                .then(async respuesta => {
                    const data = await respuesta.json().catch(() => ({}));
                    if (!respuesta.ok) {
                        throw new Error(data.message || `Error HTTP ${respuesta.status}`);
                    }
                    directorioEspecialidadesCache = data;
                    return data;
                })
                .finally(() => {
                    directorioEspecialidadesPromise = null;
                });
        }

        return directorioEspecialidadesPromise;
    }

    async function obtenerEspecialidadesDoctorDesdeDirectorio(idDoctor) {
        const data = await obtenerDirectorioEspecialidades();
        const resultado = [];
        const vistos = new Set();

        (Array.isArray(data.especialidades) ? data.especialidades : []).forEach(especialidad => {
            const medicos = Array.isArray(especialidad.medicos) ? especialidad.medicos : [];
            const pertenece = medicos.some(medico =>
                String(medico.ID_DOCTOR || medico.ID_USUARIO || "") === String(idDoctor)
            );

            if (!pertenece) return;

            const id = especialidad.ID_ESPECIALIDAD;
            const nombre = especialidad.NOMBRE_ESPECIALIDAD || "Especialidad sin nombre";
            const clave = String(id || nombre).toLowerCase();

            if (!vistos.has(clave)) {
                vistos.add(clave);
                resultado.push({
                    ID_ESPECIALIDAD: id,
                    NOMBRE_ESPECIALIDAD: nombre
                });
            }
        });

        return resultado.sort((a, b) =>
            String(a.NOMBRE_ESPECIALIDAD).localeCompare(String(b.NOMBRE_ESPECIALIDAD), "es", { sensitivity: "base" })
        );
    }

    async function cargarEspecialidadesDoctor(idDoctor, isEdit = false, seleccionada = "") {
        if (!idDoctor) {
            reiniciarSelectorEspecialidad(isEdit);
            return;
        }

        const select = isEdit ? $("editSelectEspecialidadCita") : $("selectEspecialidadCita");
        const info = isEdit ? $("editEspecialidadCitaInfo") : $("especialidadCitaInfo");

        if (!select) return;

        select.disabled = true;
        select.innerHTML = '<option value="">Cargando especialidades...</option>';
        if (info) {
            info.textContent = "Consultando especialidades del médico...";
            info.classList.remove("text-danger", "text-success");
        }

        const especialidadesLocales = obtenerEspecialidadesDoctorLocal(idDoctor)
            .filter(item => item.ID_ESPECIALIDAD);

        if (especialidadesLocales.length > 0) {
            poblarSelectorEspecialidad(especialidadesLocales, isEdit, seleccionada);
            return;
        }

        let errorRutaCitas = null;

        try {
            const respuesta = await fetch(`/citas/especialidades-doctor/${encodeURIComponent(idDoctor)}`, {
                credentials: "same-origin",
                headers: { Accept: "application/json" },
                cache: "no-store"
            });

            if (respuesta.ok) {
                const data = await respuesta.json().catch(() => ({}));
                const especialidades = Array.isArray(data.especialidades) ? data.especialidades : [];

                if (especialidades.length > 0) {
                    poblarSelectorEspecialidad(especialidades, isEdit, seleccionada);
                    return;
                }
            } else if (respuesta.status !== 404) {
                const data = await respuesta.json().catch(() => ({}));
                errorRutaCitas = new Error(data.message || `Error HTTP ${respuesta.status}`);
            }
        } catch (error) {
            errorRutaCitas = error;
        }

        // Compatibilidad: si el servidor aún no tiene la nueva ruta de Citas,
        // se usa el API ya existente del módulo Especialidades.
        try {
            const especialidades = await obtenerEspecialidadesDoctorDesdeDirectorio(idDoctor);
            poblarSelectorEspecialidad(especialidades, isEdit, seleccionada);
        } catch (errorDirectorio) {
            console.error("Error cargando especialidades del médico:", errorRutaCitas || errorDirectorio);
            reiniciarSelectorEspecialidad(isEdit, "No fue posible cargar las especialidades");
            if (info) {
                info.textContent = (errorRutaCitas || errorDirectorio).message;
                info.classList.add("text-danger");
            }
        }
    }

    function leerValorClinico(preclinica, nombres = []) {
        for (const nombre of nombres) {
            if (preclinica?.[nombre] !== undefined && preclinica?.[nombre] !== null) {
                return preclinica[nombre];
            }
        }
        return null;
    }

    function obtenerAlertasPreclinica(preclinica) {
        const campos = [
            [["TEMPERATURA", "temperatura"], "Temperatura"],
            [["PRESION_SISTOLICA", "presionSistolica"], "Presión sistólica"],
            [["PRESION_DIASTOLICA", "presionDiastolica"], "Presión diastólica"],
            [["FRECUENCIA_CARDIACA", "frecuenciaCardiaca"], "Frecuencia cardíaca"],
            [["FRECUENCIA_RESPIRATORIA", "frecuenciaRespiratoria"], "Frecuencia respiratoria"],
            [["SATURACION_OXIGENO", "saturacionOxigeno"], "Saturación de oxígeno"],
            [["PESO", "peso"], "Peso"],
            [["TALLA", "talla"], "Talla"]
        ];

        const camposPendientes = campos
            .filter(([nombres]) => {
                const valor = leerValorClinico(preclinica, nombres);
                return valor === null || valor === undefined || String(valor).trim() === "" || Number(valor) <= 0;
            })
            .map(([, etiqueta]) => etiqueta);

        let signos = preclinica?.SIGNOS_VITALES_JSON || preclinica?.signosVitalesJson || {};
        if (typeof signos === "string") {
            try { signos = JSON.parse(signos); } catch { signos = {}; }
        }

        const alertasRaw = signos?.controlConsulta?.alertasClinicas || signos?.alertasClinicas || [];
        const alertasClinicas = Array.isArray(alertasRaw)
            ? alertasRaw.map(alerta =>
                typeof alerta === "string"
                    ? alerta
                    : alerta?.mensaje || alerta?.message || alerta?.texto || ""
              ).filter(Boolean)
            : [];

        return { camposPendientes, alertasClinicas };
    }

    async function consultaExpressConRutasExistentes(idCita) {
        let preclinica = null;
        let tienePreclinica = false;

        const respuestaPreclinica = await fetch(`/preclinica/por-cita/${encodeURIComponent(idCita)}`, {
            credentials: "same-origin",
            headers: { Accept: "application/json" },
            cache: "no-store"
        });

        if (respuestaPreclinica.status === 404) {
            tienePreclinica = false;
        } else {
            const dataPreclinica = await respuestaPreclinica.json().catch(() => ({}));
            if (!respuestaPreclinica.ok) {
                throw new Error(dataPreclinica.message || `Error HTTP ${respuestaPreclinica.status}`);
            }
            preclinica = dataPreclinica.preclinica || null;
            tienePreclinica = Boolean(preclinica);
        }

        const { camposPendientes, alertasClinicas } = tienePreclinica
            ? obtenerAlertasPreclinica(preclinica)
            : { camposPendientes: ["Registro de preclínica"], alertasClinicas: [] };

        const partes = [
            tienePreclinica
                ? "Se verificó la preclínica de esta cita."
                : "Esta cita no tiene una preclínica registrada."
        ];

        if (camposPendientes.length > 0) {
            partes.push(`Datos pendientes de preclínica:\n• ${camposPendientes.join("\n• ")}`);
        }

        if (alertasClinicas.length > 0) {
            partes.push(`Alertas clínicas:\n• ${alertasClinicas.join("\n• ")}`);
        }

        partes.push("¿Desea continuar hacia Consulta Médica Express?");
        if (!window.confirm(partes.join("\n\n"))) return false;

        const cambiarEstado = await fetch("/citas/cambiar-estado", {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({
                idCita: Number(idCita),
                nuevoEstado: "CONSULTA_MEDICA"
            })
        });

        const resultado = await cambiarEstado.json().catch(() => ({}));
        if (!cambiarEstado.ok) {
            throw new Error(resultado.message || "No se pudo enviar la cita a Consulta Médica.");
        }

        window.location.href = `/consultaMedica?idCita=${encodeURIComponent(idCita)}&express=1`;
        return true;
    }

    async function abrirConsultaMedicaExpress(idCita, boton) {
        const clave = String(idCita);
        if (processingCitas.has(clave)) return;

        processingCitas.add(clave);
        const htmlOriginal = boton?.innerHTML;

        if (boton) {
            boton.disabled = true;
            boton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verificando...';
        }

        try {
            const verificar = await fetch(`/citas/consulta-express/${encodeURIComponent(idCita)}`, {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json", Accept: "application/json" },
                body: JSON.stringify({ confirmar: false })
            });

            // El servidor mostrado en la captura todavía usa el router anterior.
            // En ese caso se emplean las rutas ya existentes de Preclínica y Citas.
            if (verificar.status === 404) {
                await consultaExpressConRutasExistentes(idCita);
                return;
            }

            const datos = await verificar.json().catch(() => ({}));
            if (!verificar.ok) {
                throw new Error(datos.message || "No se pudo verificar la cita.");
            }

            const partes = [datos.message || "¿Desea abrir Consulta Médica Express?"];

            if (Array.isArray(datos.camposPendientes) && datos.camposPendientes.length > 0) {
                partes.push(`Datos pendientes de preclínica:\n• ${datos.camposPendientes.join("\n• ")}`);
            }

            if (Array.isArray(datos.alertasClinicas) && datos.alertasClinicas.length > 0) {
                partes.push(`Alertas clínicas:\n• ${datos.alertasClinicas.join("\n• ")}`);
            }

            partes.push("¿Desea continuar hacia Consulta Médica?");
            if (!window.confirm(partes.join("\n\n"))) return;

            if (boton) {
                boton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Abriendo...';
            }

            const confirmar = await fetch(`/citas/consulta-express/${encodeURIComponent(idCita)}`, {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json", Accept: "application/json" },
                body: JSON.stringify({ confirmar: true })
            });

            if (confirmar.status === 404) {
                await consultaExpressConRutasExistentes(idCita);
                return;
            }

            const resultado = await confirmar.json().catch(() => ({}));
            if (!confirmar.ok) {
                throw new Error(resultado.message || "No se pudo abrir Consulta Médica Express.");
            }

            window.location.href = resultado.redirectUrl || `/consultaMedica?idCita=${encodeURIComponent(idCita)}&express=1`;
        } catch (error) {
            console.error("Error en Consulta Médica Express:", error);
            mostrarMensaje("error", error.message);
        } finally {
            if (boton) {
                boton.disabled = false;
                if (htmlOriginal) boton.innerHTML = htmlOriginal;
            }
            setTimeout(() => processingCitas.delete(clave), 300);
        }
    }

    function aplicarFiltros() {
        const estado = $("filtroEstado")?.value || "";
        const doctor = $("filtroDoctor")?.value || "";
        const fechaDesde = $("filtroFechaDesde")?.value || "";
        const fechaHasta = $("filtroFechaHasta")?.value || "";
        const busqueda = $("filtroBusqueda")?.value?.toLowerCase().trim() || "";
        
        let lista = [...citasData];
        
        if (estado) {
            lista = lista.filter(c => String(c.ESTADO || "").toUpperCase() === estado.toUpperCase());
        }
        if (doctor) {
            lista = lista.filter(c => String(c.ID_DOCTOR || c.id_doctor || "").toString() === doctor);
        }
        if (fechaDesde) {
            const fechaDesdeObj = normalizarFecha(fechaDesde);
            if (fechaDesdeObj) {
                lista = lista.filter(c => {
                    const fechaCitaStr = c.FECHA_CITA || c.fecha_cita || c.FECHA || c.fecha;
                    const fechaCita = normalizarFecha(fechaCitaStr);
                    if (!fechaCita) return false;
                    return fechaCita.getTime() >= fechaDesdeObj.getTime();
                });
            }
        }
        if (fechaHasta) {
            const fechaHastaObj = normalizarFecha(fechaHasta);
            if (fechaHastaObj) {
                lista = lista.filter(c => {
                    const fechaCitaStr = c.FECHA_CITA || c.fecha_cita || c.FECHA || c.fecha;
                    const fechaCita = normalizarFecha(fechaCitaStr);
                    if (!fechaCita) return false;
                    return fechaCita.getTime() <= fechaHastaObj.getTime();
                });
            }
        }
        if (busqueda) {
            lista = lista.filter(c => {
                const nombrePaciente = (c.NOMBRE_PACIENTE || c.paciente_nombre || c.PACIENTE_NOMBRE || c.NOMBRE || "").toLowerCase();
                const apellidosPaciente = (c.APELLIDOS_PACIENTE || c.paciente_apellidos || c.PACIENTE_APELLIDOS || c.APELLIDOS || "").toLowerCase();
                const nombreDoctor = (c.NOMBRE_DOCTOR || c.doctor_nombre || c.DOCTOR_NOMBRE || c.DOCTOR || "").toLowerCase();
                const telefono = (c.TELEFONO_PACIENTE || c.telefono_paciente || c.TELEFONO || c.telefono || "").toLowerCase();
                const estadoCita = (c.ESTADO || c.estado || "").toLowerCase();
                const identidad = (c.IDENTIDAD_PACIENTE || c.identidad_paciente || c.IDENTIDAD || c.identidad || "").toLowerCase();
                const especialidadCita = (c.ESPECIALIDAD_CITA || c.NOMBRE_ESPECIALIDAD_CITA || c.ESPECIALIDAD || "").toLowerCase();
                const nombreCompleto = `${nombrePaciente} ${apellidosPaciente}`.trim();
                return nombreCompleto.includes(busqueda) || nombrePaciente.includes(busqueda) || apellidosPaciente.includes(busqueda) || nombreDoctor.includes(busqueda) || telefono.includes(busqueda) || estadoCita.includes(busqueda) || identidad.includes(busqueda) || especialidadCita.includes(busqueda);
            });
        }
        
        datosFiltrados = lista;
        
        if (vistaCitasActual === "tabla") {
            mostrarCitas(lista);
        } else {
            mostrarCalendario(lista);
        }
        
        if (lista.length === 0 && citasData.length > 0) {
            mostrarMensaje("info", "No se encontraron citas con los filtros aplicados");
        }
    }

    function construirFechaHoraLocal(fecha, hora) {
        if (!fecha || !hora) return null;

        const valor = new Date(`${fecha}T${hora}:00`);

        return Number.isNaN(valor.getTime())
            ? null
            : valor;
    }

    function esFechaHoraPasada(fecha, hora) {
        const fechaHora = construirFechaHoraLocal(fecha, hora);

        return fechaHora
            ? fechaHora.getTime() <= Date.now()
            : false;
    }

    function actualizarModoRegistroPasado() {
        const fecha = $("inputFecha")?.value;
        const hora = $("inputHora")?.value;
        const panel = $("registroAtendidoPasado");
        const check = $("checkRegistroAtendido");
        const boton = $("btnGuardarCita");

        const esPasada = esFechaHoraPasada(fecha, hora);

        if (panel) {
            panel.style.display = esPasada ? "flex" : "none";
        }

        if (check) {
            check.checked = esPasada;
        }

        if (boton) {
            boton.innerHTML = esPasada
                ? '<i class="fas fa-user-check"></i> REGISTRAR COMO ATENDIDO'
                : '<i class="fas fa-check"></i> CONFIRMAR CITA';
        }

        return esPasada;
    }

    function actualizarModoEdicionPasada() {
        const fecha = $("editInputFecha")?.value;
        const hora = $("editInputHora")?.value;
        const panel = $("editRegistroPasadoInfo");

        const esPasada = esFechaHoraPasada(fecha, hora);

        if (panel) {
            panel.style.display = esPasada ? "flex" : "none";
        }

        return esPasada;
    }

    function mostrarCitas(list) {
        const target = $("tablaContenido");
        if (!target) return;

        const listaMostrar = list || [];

        if (listaMostrar.length === 0) {
            target.innerHTML = `
                <div class="ctsin-citas">
                    <i class="fas fa-calendar-times"></i>
                    <h3>No hay citas</h3>
                    <p>${citasData.length > 0 ? 'No hay citas que coincidan con los filtros aplicados.' : 'Comienza creando una nueva cita médica.'}</p>
                    ${citasData.length === 0 ? `<button class="ctbtn-primary" id="btnCrearPrimera"><i class="fas fa-plus"></i> Crear Primera Cita</button>` : ''}
                </div>
            `;
            return;
        }

        let html = `
            <table class="table">
                <thead>
                    <tr>
                        <th>Paciente</th>
                        <th>Doctor</th>
                        <th>Especialidad de la cita</th>
                        <th>Fecha y Hora</th>
                        <th>Estado</th>
                        <th>Acciones</th>
                    </tr>
                </thead>
                <tbody>
        `;

        listaMostrar.forEach(c => {
            const fechaStr = c.FECHA_CITA || c.fecha_cita || c.FECHA || c.fecha;
            let fecha, hora;
            try {
                const fechaObj = new Date(fechaStr);
                if (!isNaN(fechaObj.getTime())) {
                    fecha = fechaObj.toLocaleDateString("es-ES");
                    hora = c.HORA_CITA || c.hora_cita || c.HORA || c.hora || fechaObj.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
                } else {
                    fecha = "Fecha no disponible";
                    hora = c.HORA_CITA || c.hora_cita || c.HORA || c.hora || "";
                }
            } catch (e) {
                fecha = "Fecha no disponible";
                hora = c.HORA_CITA || c.hora_cita || c.HORA || c.hora || "";
            }

            const nombrePaciente = c.NOMBRE_PACIENTE || c.paciente_nombre || c.PACIENTE_NOMBRE || c.NOMBRE || "";
            const apellidosPaciente = c.APELLIDOS_PACIENTE || c.paciente_apellidos || c.PACIENTE_APELLIDOS || c.APELLIDOS || "";
            const nombreCompleto = `${nombrePaciente} ${apellidosPaciente}`.trim() || nombrePaciente;
            const nombreDoctor = c.NOMBRE_DOCTOR || c.doctor_nombre || c.DOCTOR_NOMBRE || c.DOCTOR || "";
            const telefonoPaciente = c.TELEFONO_PACIENTE || c.telefono_paciente || c.TELEFONO || c.telefono || "";
            const especialidadCita =
                c.ESPECIALIDAD_CITA ||
                c.NOMBRE_ESPECIALIDAD_CITA ||
                c.ESPECIALIDAD ||
                "Pendiente de asignar";

            const especialidadPendiente =
                c.ESPECIALIDAD_PENDIENTE === true ||
                c.ESPECIALIDAD_ASIGNADA === false ||
                !c.ID_ESPECIALIDAD_CITA;

            const estadoCita = c.ESTADO || c.estado || "";
            const estadoNormalizado = String(estadoCita).toUpperCase();
            const idCita = c.ID_CITA || c.id_cita || c.id;
            const esEstadoCerrado = ["FINALIZADA", "CANCELADA", "NO_ASISTIO"].includes(estadoNormalizado);
            const fueAtendido = estadoNormalizado === "FINALIZADA";

            html += `
                <tr class="${esEstadoCerrado ? "fila-cita-cerrada" : ""}">
                    <td>
                        <div class="paciente-cita-nombre">
                            <strong>${escapeHtml(nombreCompleto)}</strong>
                            ${
                                fueAtendido
                                    ? `
                                        <span class="paciente-atendido-badge">
                                            <i class="fas fa-user-check"></i>
                                            ATENDIDO
                                        </span>
                                    `
                                    : ""
                            }
                        </div>
                        <small>${escapeHtml(telefonoPaciente)}</small>
                    </td>
                    <td>Dr. ${escapeHtml(nombreDoctor)}</td>
                    <td>
                        ${
                            especialidadPendiente
                                ? `
                                    <div class="cita-especialidad-pendiente">
                                        <span class="cita-especialidad cita-especialidad--pendiente">
                                            <i class="fas fa-exclamation-triangle"></i>
                                            Pendiente
                                        </span>

                                        <button
                                            type="button"
                                            class="btn-asignar-especialidad"
                                            data-id-cita="${idCita}"
                                            title="Asignar la especialidad real de la cita"
                                        >
                                            <i class="fas fa-plus-circle"></i>
                                            Asignar
                                        </button>
                                    </div>
                                `
                                : `
                                    <span class="cita-especialidad">
                                        <i class="fas fa-stethoscope"></i>
                                        ${escapeHtml(especialidadCita)}
                                    </span>
                                `
                        }
                    </td>
                    <td>
                        <strong>${fecha}</strong><br>
                        <small>${hora}</small>
                    </td>
                    <td><span class="ctestado-badge ctestado-${String(estadoCita).toLowerCase()}">${escapeHtml(estadoCita)}</span></td>
                    <td class="ctacciones-columna">
                        <div class="ctacciones-cita ${esEstadoCerrado ? "ctacciones-cita--compacta" : ""}">
                            <button
                                class="btn-editar-cita"
                                data-action="editar"
                                data-id="${idCita}"
                                title="Editar cita"
                                aria-label="Editar cita"
                            >
                                <i class="fas fa-edit"></i>
                            </button>
                            ${generarBotonesEstado(c)}
                        </div>
                    </td>
                </tr>
            `;
        });

        html += `</tbody></table>`;
        target.innerHTML = html;

        activarBotonesAsignarEspecialidad();
    }

    function mostrarCalendario(lista = []) {
        const dias = document.getElementById("calendar-days");
        const titulo = document.getElementById("calendar-month-year");

        if (!dias || !titulo) return;

        titulo.textContent = `${nombresMeses[mesCalendarioActual]} ${anioCalendarioActual}`;
        dias.innerHTML = "";

        const primerDia = new Date(anioCalendarioActual, mesCalendarioActual, 1).getDay();
        const totalDias = new Date(anioCalendarioActual, mesCalendarioActual + 1, 0).getDate();

        for (let i = 0; i < primerDia; i++) {
            const vacio = document.createElement("div");
            vacio.className = "calendar-day empty";
            dias.appendChild(vacio);
        }

        for (let dia = 1; dia <= totalDias; dia++) {
            const celda = document.createElement("div");
            celda.className = "calendar-day";
            celda.dataset.dia = dia;
            celda.dataset.mes = mesCalendarioActual;
            celda.dataset.anio = anioCalendarioActual;

            const numero = document.createElement("div");
            numero.className = "day-number";
            numero.textContent = dia;
            celda.appendChild(numero);

            const citasDia = lista.filter(cita => {
                const fechaStr = cita.FECHA_CITA || cita.fecha_cita || cita.FECHA || cita.fecha;
                if (!fechaStr) return false;
                try {
                    const fecha = new Date(fechaStr);
                    if (isNaN(fecha.getTime())) return false;
                    return (fecha.getDate() === dia && fecha.getMonth() === mesCalendarioActual && fecha.getFullYear() === anioCalendarioActual);
                } catch (e) {
                    return false;
                }
            });

            citasDia.forEach(cita => {
                const badge = document.createElement("div");
                badge.className = "cita-badge editable";
                const horaCita = cita.HORA_CITA || cita.hora_cita || cita.HORA || cita.hora || "";
                const nombrePaciente = cita.NOMBRE_PACIENTE || cita.paciente_nombre || cita.PACIENTE_NOMBRE || cita.NOMBRE || "";
                const apellidosPaciente = cita.APELLIDOS_PACIENTE || cita.paciente_apellidos || cita.PACIENTE_APELLIDOS || cita.APELLIDOS || "";
                const nombreCompleto = `${nombrePaciente} ${apellidosPaciente}`.trim() || nombrePaciente;
                const idCita = cita.ID_CITA || cita.id_cita || cita.id;
                const especialidadCita = cita.ESPECIALIDAD_CITA || cita.NOMBRE_ESPECIALIDAD_CITA || cita.ESPECIALIDAD || "Especialidad no asignada";
                const fueAtendido = String(cita.ESTADO || cita.estado || "").toUpperCase() === "FINALIZADA";
                badge.innerHTML = `
                    <strong>${horaCita}</strong><br>
                    ${escapeHtml(nombreCompleto)}
                    ${fueAtendido ? '<span class="calendar-atendido"> · ATENDIDO</span>' : ""}
                `;
                badge.title = `${nombreCompleto} · ${especialidadCita}${fueAtendido ? " · ATENDIDO" : ""}`;
                badge.dataset.id = idCita;

                const estadoCita = cita.ESTADO || cita.estado || "";
                switch (estadoCita.toUpperCase()) {
                    case "PROGRAMADA": badge.style.background = "#0d6efd"; break;
                    case "CONFIRMADA": badge.style.background = "#198754"; break;
                    case "FINALIZADA": badge.style.background = "#6c757d"; break;
                    case "CANCELADA": badge.style.background = "#dc3545"; break;
                    case "NO_ASISTIO": badge.style.background = "#fd7e14"; break;
                    default: badge.style.background = "#0d6efd";
                }
                badge.style.color = "#fff";
                badge.style.fontSize = "11px";
                badge.style.padding = "2px 4px";
                badge.style.marginTop = "3px";
                badge.style.borderRadius = "4px";
                badge.style.cursor = "pointer";
                badge.style.overflow = "hidden";
                badge.style.whiteSpace = "nowrap";
                badge.style.textOverflow = "ellipsis";

                badge.addEventListener("click", (e) => {
                    e.stopPropagation();
                    const id = badge.dataset.id;
                    if (id) {
                        cerrarCalendario();
                        setTimeout(() => editarCitaPorId(id), 300);
                    }
                });

                celda.appendChild(badge);
            });

            const btnAdd = document.createElement("button");
            btnAdd.className = "add-cita-quick";
            btnAdd.innerHTML = "+";
            btnAdd.title = "Agregar cita en este día";
            btnAdd.addEventListener("click", (e) => {
                e.stopPropagation();
                const fechaStr = `${anioCalendarioActual}-${String(mesCalendarioActual + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
                fechaCalendarioSeleccionada = fechaStr;
                cerrarCalendario();
                setTimeout(() => abrirModalNuevaCitaConFecha(fechaStr), 300);
            });
            celda.appendChild(btnAdd);

            dias.appendChild(celda);
        }
    }

    function generarBotonesEstado(c) {
        const id =
            c.ID_CITA ||
            c.id_cita ||
            c.id;

        const estado = String(
            c.ESTADO ||
            c.estado ||
            ""
        ).toUpperCase();

        if (estado === "FINALIZADA") {
            return `
                <span class="estado-accion-compacto estado-accion-compacto--finalizada">
                    <i class="fas fa-check-circle"></i>
                    FINALIZADA
                </span>
            `;
        }

        if (estado === "CANCELADA") {
            return `
                <span class="estado-accion-compacto estado-accion-compacto--cancelada">
                    <i class="fas fa-ban"></i>
                    CANCELADA
                </span>
            `;
        }

        if (estado === "NO_ASISTIO") {
            return `
                <span class="estado-accion-compacto estado-accion-compacto--no-asistio">
                    <i class="fas fa-user-times"></i>
                    NO ASISTIÓ
                </span>
            `;
        }

        const botonExpress = `
            <button
                type="button"
                class="ctbtn-accion btn-consulta-express"
                data-action="consulta-express"
                data-id="${id}"
                title="Abrir Consulta Médica Express"
            >
                <i class="fas fa-bolt"></i>
                <span>Consulta Médica Express</span>
            </button>
        `;

        const botones = [];

        switch (estado) {
            case "PROGRAMADA":
                botones.push(`
                    <button
                        type="button"
                        class="ctbtn-accion ctbtn-confirmar"
                        data-action="confirmar"
                        data-id="${id}"
                        title="Confirmar cita"
                    >
                        <i class="fas fa-check"></i>
                        <span>Confirmar</span>
                    </button>
                `);

                botones.push(`
                    <button
                        type="button"
                        class="ctbtn-accion ctbtn-cancelar"
                        data-action="cancelar"
                        data-id="${id}"
                        title="Cancelar cita"
                    >
                        <i class="fas fa-times"></i>
                        <span>Cancelar</span>
                    </button>
                `);

                botones.push(`
                    <button
                        type="button"
                        class="ctbtn-accion ctbtn-no-asistio"
                        data-action="no_asistio"
                        data-id="${id}"
                        title="Marcar como no asistió"
                    >
                        <i class="fas fa-user-times"></i>
                        <span>No asistió</span>
                    </button>
                `);

                botones.push(botonExpress);
                break;

            case "CONFIRMADA":
                botones.push(`
                    <button
                        type="button"
                        class="ctbtn-accion ctbtn-preclinica"
                        data-action="preclinica"
                        data-id="${id}"
                        title="Abrir preclínica"
                    >
                        <i class="fas fa-stethoscope"></i>
                        <span>Preclínica</span>
                    </button>
                `);

                botones.push(`
                    <button
                        type="button"
                        class="ctbtn-accion ctbtn-cancelar"
                        data-action="cancelar"
                        data-id="${id}"
                        title="Cancelar cita"
                    >
                        <i class="fas fa-times"></i>
                        <span>Cancelar</span>
                    </button>
                `);

                botones.push(`
                    <button
                        type="button"
                        class="ctbtn-accion ctbtn-no-asistio"
                        data-action="no_asistio"
                        data-id="${id}"
                        title="Marcar como no asistió"
                    >
                        <i class="fas fa-user-times"></i>
                        <span>No asistió</span>
                    </button>
                `);

                botones.push(botonExpress);
                break;

            case "PRECLINICA":
            case "CONSULTA_MEDICA":
                botones.push(botonExpress);

                botones.push(`
                    <button
                        type="button"
                        class="ctbtn-accion ctbtn-cancelar"
                        data-action="cancelar"
                        data-id="${id}"
                        title="Cancelar cita"
                    >
                        <i class="fas fa-times"></i>
                        <span>Cancelar</span>
                    </button>
                `);
                break;

            default:
                botones.push(`
                    <button
                        type="button"
                        class="ctbtn-accion ctbtn-cancelar"
                        data-action="cancelar"
                        data-id="${id}"
                        title="Cancelar cita"
                    >
                        <i class="fas fa-times"></i>
                        <span>Cancelar</span>
                    </button>
                `);

                botones.push(`
                    <button
                        type="button"
                        class="ctbtn-accion ctbtn-no-asistio"
                        data-action="no_asistio"
                        data-id="${id}"
                        title="Marcar como no asistió"
                    >
                        <i class="fas fa-user-times"></i>
                        <span>No asistió</span>
                    </button>
                `);
                break;
        }

        return botones.join("");
    }

    function activarBotonesAsignarEspecialidad() {
        const botones = document.querySelectorAll(
            "#tablaContenido .btn-asignar-especialidad"
        );

        botones.forEach((boton) => {
            if (boton.dataset.asignarListener === "activo") {
                return;
            }

            boton.dataset.asignarListener = "activo";
            boton.addEventListener(
                "click",
                manejarClickAsignarEspecialidad
            );
        });
    }

    async function manejarClickAsignarEspecialidad(event) {
        event.preventDefault();
        event.stopPropagation();

        const boton = event.currentTarget;

        if (!boton) return;

        const idCita = boton.dataset.idCita;

        if (!idCita) {
            mostrarMensaje(
                "error",
                "El botón no contiene el ID de la cita."
            );
            return;
        }

        const contenidoOriginal = boton.innerHTML;

        boton.disabled = true;
        boton.innerHTML = `
            <i class="fas fa-spinner fa-spin"></i>
            Abriendo...
        `;

        try {
            await abrirModalAsignarEspecialidad(idCita);
        } catch (error) {
            console.error(
                "Error abriendo el modal de especialidad:",
                error
            );

            mostrarMensaje(
                "error",
                error.message ||
                "No se pudo abrir el selector de especialidad."
            );
        } finally {
            boton.disabled = false;
            boton.innerHTML = contenidoOriginal;
        }
    }

    function ocultarErrorAsignarEspecialidad() {
        const alerta =
            $("errorAsignarEspecialidad");

        if (alerta) {
            alerta.style.display = "none";
        }
    }

    function mostrarErrorAsignarEspecialidad(
        mensaje
    ) {
        const alerta =
            $("errorAsignarEspecialidad");

        const texto =
            $("mensajeErrorAsignarEspecialidad");

        if (!alerta || !texto) {
            alert(mensaje);
            return;
        }

        texto.textContent = mensaje;
        alerta.style.display = "flex";
    }

    async function abrirModalAsignarEspecialidad(
        idCita
    ) {
        const cita = citasData.find(
            (item) =>
                String(
                    item.ID_CITA ||
                    item.id_cita ||
                    item.id
                ) === String(idCita)
        );

        if (!cita) {
            mostrarMensaje(
                "error",
                "No se encontró la cita seleccionada."
            );
            return;
        }

        citaPendienteEspecialidad = cita;
        ocultarErrorAsignarEspecialidad();

        const modal =
            $("modalAsignarEspecialidad");

        const select =
            $("selectAsignarEspecialidad");

        if (!modal || !select) {
            const faltantes = [];

            if (!modal) {
                faltantes.push("modalAsignarEspecialidad");
            }

            if (!select) {
                faltantes.push("selectAsignarEspecialidad");
            }

            throw new Error(
                `No se encontró en citas.ejs: ${faltantes.join(", ")}.`
            );
        }

        const inputIdCita = $("idCitaAsignarEspecialidad");
        const pacienteResumen = $("pacienteAsignarEspecialidad");
        const doctorResumen = $("doctorAsignarEspecialidad");

        if (!inputIdCita || !pacienteResumen || !doctorResumen) {
            throw new Error(
                "El modal de especialidad está incompleto en citas.ejs."
            );
        }

        inputIdCita.value = String(idCita);

        pacienteResumen.textContent =
            cita.NOMBRE_PACIENTE ||
            "Paciente no disponible";

        doctorResumen.textContent =
            `Dr. ${cita.NOMBRE_DOCTOR || "No disponible"}`;

        select.disabled = true;
        select.innerHTML = `
            <option value="">
                Cargando especialidades...
            </option>
        `;

        document.body.style.overflow = "hidden";

        modal.style.display = "flex";
        modal.setAttribute(
            "aria-hidden",
            "false"
        );

        console.log(
            "🩺 Modal de especialidad abierto para cita:",
            idCita
        );

        try {
            let especialidades =
                Array.isArray(
                    cita.ESPECIALIDADES_DOCTOR_DISPONIBLES
                )
                    ? cita.ESPECIALIDADES_DOCTOR_DISPONIBLES
                    : [];

            if (especialidades.length === 0) {
                especialidades =
                    obtenerEspecialidadesDoctorLocal(
                        cita.ID_DOCTOR
                    ).filter(
                        item => item.ID_ESPECIALIDAD
                    );
            }

            if (especialidades.length === 0) {
                try {
                    const respuesta = await fetch(
                        `/citas/especialidades-doctor/${encodeURIComponent(
                            cita.ID_DOCTOR
                        )}`,
                        {
                            credentials: "same-origin",
                            headers: {
                                Accept: "application/json"
                            },
                            cache: "no-store"
                        }
                    );

                    const datos = await respuesta
                        .json()
                        .catch(() => ({}));

                    if (respuesta.ok) {
                        especialidades = Array.isArray(
                            datos.especialidades
                        )
                            ? datos.especialidades
                            : [];
                    } else if (respuesta.status !== 404) {
                        throw new Error(
                            datos.message ||
                            `Error HTTP ${respuesta.status}`
                        );
                    }
                } catch (errorRuta) {
                    console.warn(
                        "No se pudieron obtener especialidades desde /citas:",
                        errorRuta
                    );
                }
            }

            if (especialidades.length === 0) {
                especialidades =
                    await obtenerEspecialidadesDoctorDesdeDirectorio(
                        cita.ID_DOCTOR
                    );
            }

            select.innerHTML = `
                <option value="">
                    Seleccione una especialidad
                </option>
            `;

            especialidades.forEach(
                (especialidad) => {
                    const option =
                        document.createElement(
                            "option"
                        );

                    option.value =
                        especialidad.ID_ESPECIALIDAD;

                    option.textContent =
                        especialidad.NOMBRE_ESPECIALIDAD;

                    select.appendChild(option);
                }
            );

            select.disabled =
                especialidades.length === 0;

            if (especialidades.length === 1) {
                select.value = String(
                    especialidades[0]
                        .ID_ESPECIALIDAD
                );
            }

            if (especialidades.length === 0) {
                mostrarErrorAsignarEspecialidad(
                    "El médico no tiene especialidades activas asignadas."
                );
            }
        } catch (error) {
            console.error(
                "Error cargando especialidades de la cita:",
                error
            );

            select.innerHTML = `
                <option value="">
                    No fue posible cargar
                </option>
            `;

            mostrarErrorAsignarEspecialidad(
                error.message
            );
        }
    }

    function cerrarModalAsignarEspecialidad() {
        const modal =
            $("modalAsignarEspecialidad");

        if (modal) {
            modal.style.display = "none";
            modal.setAttribute(
                "aria-hidden",
                "true"
            );
        }

        document.body.style.overflow = "";

        citaPendienteEspecialidad = null;
        ocultarErrorAsignarEspecialidad();

        const select =
            $("selectAsignarEspecialidad");

        if (select) {
            select.innerHTML = `
                <option value="">
                    Seleccione una especialidad
                </option>
            `;
        }
    }

    async function guardarAsignacionEspecialidad() {
        if (asignacionEspecialidadEnProceso) {
            return;
        }

        const idCita =
            $("idCitaAsignarEspecialidad")
                ?.value;

        const especialidad =
            $("selectAsignarEspecialidad")
                ?.value;

        if (!idCita || !especialidad) {
            mostrarErrorAsignarEspecialidad(
                "Seleccione una especialidad."
            );
            return;
        }

        const boton =
            $("btnGuardarAsignarEspecialidad");

        asignacionEspecialidadEnProceso = true;

        if (boton) {
            boton.disabled = true;
            boton.innerHTML = `
                <i class="fas fa-spinner fa-spin"></i>
                GUARDANDO...
            `;
        }

        try {
            const respuesta = await fetch(
                `/citas/asignar-especialidad/${encodeURIComponent(
                    idCita
                )}`,
                {
                    method: "POST",
                    credentials: "same-origin",
                    headers: {
                        "Content-Type":
                            "application/json",
                        Accept:
                            "application/json"
                    },
                    body: JSON.stringify({
                        especialidad:
                            Number(especialidad)
                    })
                }
            );

            const datos =
                await respuesta.json();

            if (!respuesta.ok) {
                throw new Error(
                    datos.message ||
                    "No se pudo guardar la especialidad."
                );
            }

            cerrarModalAsignarEspecialidad();
            await cargarDatosReales(true);

            mostrarMensaje(
                "success",
                datos.message ||
                "Especialidad asignada correctamente."
            );
        } catch (error) {
            console.error(
                "Error asignando especialidad:",
                error
            );

            mostrarErrorAsignarEspecialidad(
                error.message
            );
        } finally {
            asignacionEspecialidadEnProceso =
                false;

            if (boton) {
                boton.disabled = false;
                boton.innerHTML = `
                    <i class="fas fa-save"></i>
                    GUARDAR ESPECIALIDAD
                `;
            }
        }
    }

    async function tablaClickHandler(e) {
        const crearPrimera = e.target.closest("#btnCrearPrimera");
        if (crearPrimera) {
            abrirModalNuevaCita();
            return;
        }

        const btn = e.target.closest(".ctbtn-accion");
        if (btn) {
            const action = btn.dataset.action;
            const id = btn.dataset.id;
            if (!action || !id) return;

            if (action === "consulta-express") {
                await abrirConsultaMedicaExpress(id, btn);
                return;
            }

            if (processingCitas.has(String(id))) {
                console.warn("La cita ya está siendo procesada");
                return;
            }

            const estados = {
                confirmar: "CONFIRMADA",
                cancelar: "CANCELADA",
                no_asistio: "NO_ASISTIO",
                preclinica: "PRECLINICA",
                consulta: "CONSULTA_MEDICA",
                finalizar: "FINALIZADA"
            };

            const nuevoEstado = estados[action];
            if (!nuevoEstado) return;

            const nombres = {
                CONFIRMADA: "Confirmada",
                CANCELADA: "Cancelada",
                NO_ASISTIO: "No asistió",
                PRECLINICA: "Preclínica",
                CONSULTA_MEDICA: "Consulta médica",
                FINALIZADA: "Finalizada"
            };

            if (!confirm(`¿Desea cambiar el estado de la cita a ${nombres[nuevoEstado]}?`)) return;

            processingCitas.add(String(id));
            try {
                btn.disabled = true;
                await cambiarEstadoCita(id, nuevoEstado);
            } finally {
                btn.disabled = false;
                setTimeout(() => processingCitas.delete(String(id)), 300);
            }
            return;
        }

        const editBtn = e.target.closest(".btn-editar-cita");
        if (editBtn) {
            const id = editBtn.dataset.id;
            if (id) editarCitaPorId(id);
        }
    }

    async function cambiarEstadoCita(idCita, nuevoEstado) {
        try {
            const respuesta = await fetch("/citas/cambiar-estado", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({ idCita: Number(idCita), nuevoEstado })
            });

            const data = await respuesta.json();

            if (!respuesta.ok) {
                mostrarMensaje("error", data.message || "No se pudo actualizar la cita");
                return;
            }

            citasData = citasData.map(c => {
                const id = c.ID_CITA || c.id_cita || c.id;
                if (String(id) === String(idCita)) {
                    return { ...c, ESTADO: nuevoEstado };
                }
                return c;
            });

            await cargarDatosReales(true);
            mostrarMensaje("success", data.message || "Estado actualizado correctamente");
        } catch (error) {
            console.error(error);
            mostrarMensaje("error", "Error de conexión");
        }
    }

    // ==================== AUTOCOMPLETADO ====================

    function setupAutocompletePacientes(inputId, listId, hiddenId, infoId, isEdit = false) {
        const input = $(inputId);
        const list = $(listId);
        const hidden = $(hiddenId);
        const info = $(infoId);
        
        if (!input || !list) return;

        let currentFocus = -1;

        input.addEventListener('input', function() {
            const query = this.value.trim();
            const pacientes = pacientesData;
            
            if (query.length === 0) {
                list.classList.remove('show');
                list.innerHTML = '';
                if (hidden) hidden.value = '';
                if (info) info.textContent = '';
                return;
            }

            const q = query.toLowerCase();
            const resultados = pacientes.filter(p => {
                const nombre = (p.NOMBRES || '').toLowerCase();
                const apellidos = (p.APELLIDOS || '').toLowerCase();
                const telefono = (p.TELEFONO || '').toLowerCase();
                const identidad = (p.NUMERO_DOCUMENTO_IDENTIDAD || '').toLowerCase();
                const nombreCompleto = `${nombre} ${apellidos}`;
                return nombreCompleto.includes(q) || telefono.includes(q) || identidad.includes(q);
            });

            if (resultados.length === 0) {
                list.innerHTML = `<div class="autocomplete-item no-results">No se encontraron pacientes</div>`;
                list.classList.add('show');
                return;
            }

            const mostrar = resultados.slice(0, 10);
            
            list.innerHTML = '';
            mostrar.forEach((p, index) => {
                const div = document.createElement('div');
                div.className = 'autocomplete-item';
                
                const nombre = `${p.NOMBRES} ${p.APELLIDOS}`;
                const infoText = [];
                if (p.TELEFONO) infoText.push(`📱 ${p.TELEFONO}`);
                if (p.NUMERO_DOCUMENTO_IDENTIDAD) infoText.push(`🆔 ${p.NUMERO_DOCUMENTO_IDENTIDAD}`);
                
                div.innerHTML = `
                    <strong>${escapeHtml(nombre)}</strong>
                    <span class="sub-info">${infoText.join(' • ')}</span>
                `;
                
                div.dataset.id = p.ID_PACIENTE;
                div.dataset.nombre = nombre;
                div.dataset.telefono = p.TELEFONO || '';
                div.dataset.correo = p.CORREO_ELECTRONICO || '';
                div.dataset.identidad = p.NUMERO_DOCUMENTO_IDENTIDAD || '';
                
                div.addEventListener('click', function() {
                    selectPaciente(this, input, list, hidden, info);
                });
                
                div.addEventListener('mouseenter', function() {
                    list.querySelectorAll('.autocomplete-item').forEach(el => el.classList.remove('active'));
                    this.classList.add('active');
                    currentFocus = Array.from(list.children).indexOf(this);
                });
                
                list.appendChild(div);
            });
            
            list.classList.add('show');
            currentFocus = -1;
        });

        input.addEventListener('keydown', function(e) {
            const items = list.querySelectorAll('.autocomplete-item:not(.no-results)');
            if (items.length === 0) return;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                currentFocus = (currentFocus + 1) % items.length;
                items.forEach(el => el.classList.remove('active'));
                items[currentFocus].classList.add('active');
                items[currentFocus].scrollIntoView({ block: 'nearest' });
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                currentFocus = (currentFocus - 1 + items.length) % items.length;
                items.forEach(el => el.classList.remove('active'));
                items[currentFocus].classList.add('active');
                items[currentFocus].scrollIntoView({ block: 'nearest' });
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (currentFocus >= 0 && currentFocus < items.length) {
                    items[currentFocus].click();
                }
            } else if (e.key === 'Escape') {
                list.classList.remove('show');
            }
        });

        input.addEventListener('blur', function() {
            setTimeout(() => {
                list.classList.remove('show');
            }, 200);
        });
    }

    function selectPaciente(element, input, list, hidden, info) {
        const id = element.dataset.id;
        const nombre = element.dataset.nombre;
        const telefono = element.dataset.telefono;
        const correo = element.dataset.correo;
        const identidad = element.dataset.identidad;
        
        input.value = nombre;
        if (hidden) hidden.value = id;
        if (info) {
            let infoText = [];
            if (telefono) infoText.push(`📱 ${telefono}`);
            if (correo) infoText.push(`📧 ${correo}`);
            if (identidad) infoText.push(`🆔 ${identidad}`);
            info.textContent = infoText.join(' • ');
        }
        list.classList.remove('show');
    }

    function setupAutocompleteDoctores(inputId, listId, hiddenId, infoId, isEdit = false) {
        const input = $(inputId);
        const list = $(listId);
        const hidden = $(hiddenId);
        const info = $(infoId);

        if (!input || !list) return;

        let currentFocus = -1;

        input.addEventListener("input", function() {
            const query = this.value.trim();

            if (hidden) hidden.value = "";
            reiniciarSelectorEspecialidad(isEdit);

            if (query.length === 0) {
                list.classList.remove("show");
                list.innerHTML = "";
                if (info) info.textContent = "";
                return;
            }

            const q = query.toLowerCase();
            const resultados = doctoresData.filter(d => {
                const nombre = (d.NOMBRE || "").toLowerCase();
                const especialidades = (d.ESPECIALIDADES_TEXTO || d.ESPECIALIDAD || "").toLowerCase();
                const identidad = (d.IDENTIDAD || "").toLowerCase();
                const correo = (d.CORREO_ELECTRONICO || "").toLowerCase();
                return nombre.includes(q) || especialidades.includes(q) || identidad.includes(q) || correo.includes(q);
            });

            if (resultados.length === 0) {
                list.innerHTML = '<div class="autocomplete-item no-results">No se encontraron doctores</div>';
                list.classList.add("show");
                return;
            }

            list.innerHTML = "";
            resultados.slice(0, 10).forEach(d => {
                const div = document.createElement("div");
                div.className = "autocomplete-item";

                const nombre = `Dr. ${d.NOMBRE}`;
                const especialidades = d.ESPECIALIDADES_TEXTO || d.ESPECIALIDAD || "Sin especialidad";
                const infoText = [`🏥 ${especialidades}`];
                if (d.CORREO_ELECTRONICO) infoText.push(`📧 ${d.CORREO_ELECTRONICO}`);

                div.innerHTML = `
                    <strong>${escapeHtml(nombre)}</strong>
                    <span class="sub-info">${escapeHtml(infoText.join(" • "))}</span>
                `;

                div.dataset.id = d.ID_DOCTOR;
                div.dataset.nombre = nombre;
                div.dataset.especialidad = especialidades;
                div.dataset.correo = d.CORREO_ELECTRONICO || "";
                div.dataset.identidad = d.IDENTIDAD || "";

                div.addEventListener("click", function() {
                    selectDoctor(this, input, list, hidden, info, isEdit);
                });

                div.addEventListener("mouseenter", function() {
                    list.querySelectorAll(".autocomplete-item").forEach(el => el.classList.remove("active"));
                    this.classList.add("active");
                    currentFocus = Array.from(list.children).indexOf(this);
                });

                list.appendChild(div);
            });

            list.classList.add("show");
            currentFocus = -1;
        });

        input.addEventListener("keydown", function(e) {
            const items = list.querySelectorAll(".autocomplete-item:not(.no-results)");
            if (items.length === 0) return;

            if (e.key === "ArrowDown") {
                e.preventDefault();
                currentFocus = (currentFocus + 1) % items.length;
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                currentFocus = (currentFocus - 1 + items.length) % items.length;
            } else if (e.key === "Enter") {
                e.preventDefault();
                if (currentFocus >= 0 && currentFocus < items.length) items[currentFocus].click();
                return;
            } else if (e.key === "Escape") {
                list.classList.remove("show");
                return;
            } else {
                return;
            }

            items.forEach(el => el.classList.remove("active"));
            items[currentFocus].classList.add("active");
            items[currentFocus].scrollIntoView({ block: "nearest" });
        });

        input.addEventListener("blur", function() {
            setTimeout(() => list.classList.remove("show"), 200);
        });
    }

    async function selectDoctor(element, input, list, hidden, info, isEdit = false) {
        const id = element.dataset.id;
        const nombre = element.dataset.nombre;
        const especialidades = element.dataset.especialidad;
        const correo = element.dataset.correo;
        const identidad = element.dataset.identidad;

        input.value = nombre;
        if (hidden) hidden.value = id;

        if (info) {
            const infoText = [];
            if (especialidades) infoText.push(`🏥 ${especialidades}`);
            if (correo) infoText.push(`📧 ${correo}`);
            if (identidad) infoText.push(`🆔 ${identidad}`);
            info.textContent = infoText.join(" • ");
        }

        list.classList.remove("show");
        await cargarEspecialidadesDoctor(id, isEdit);
    }

    // ==================== FUNCIONES DE EDICIÓN ====================
    // ==================== FUNCIONES DE EDICIÓN ====================

    async function editarCitaPorId(idCita) {
        try {
            const cita = citasData.find(c => String(c.ID_CITA || c.id_cita || c.id) === String(idCita));
            if (!cita) {
                mostrarMensaje("error", "Cita no encontrada");
                return;
            }

            const modal = $("modalEditarCita");
            if (!modal) return;

            $("editIdCita").value = idCita;
            
            // Paciente
            const pacienteId = cita.ID_PACIENTE || cita.id_paciente;
            const paciente = pacientesData.find(p => String(p.ID_PACIENTE) === String(pacienteId));
            if (paciente) {
                const inputPaciente = $("buscarPacienteEditar");
                const hiddenPaciente = $("editPacienteSeleccionado");
                const infoPaciente = $("editPacienteInfo");
                inputPaciente.value = `${paciente.NOMBRES} ${paciente.APELLIDOS}`;
                hiddenPaciente.value = paciente.ID_PACIENTE;
                let infoText = [];
                if (paciente.TELEFONO) infoText.push(`📱 ${paciente.TELEFONO}`);
                if (paciente.CORREO_ELECTRONICO) infoText.push(`📧 ${paciente.CORREO_ELECTRONICO}`);
                if (paciente.NUMERO_DOCUMENTO_IDENTIDAD) infoText.push(`🆔 ${paciente.NUMERO_DOCUMENTO_IDENTIDAD}`);
                infoPaciente.textContent = infoText.join(' • ');
            }

            // Doctor
            const doctorId = cita.ID_DOCTOR || cita.id_doctor;
            const doctor = doctoresData.find(d => String(d.ID_DOCTOR) === String(doctorId));
            if (doctor) {
                const inputDoctor = $("buscarDoctorEditar");
                const hiddenDoctor = $("editDoctorSeleccionado");
                const infoDoctor = $("editDoctorInfo");
                inputDoctor.value = `Dr. ${doctor.NOMBRE}`;
                hiddenDoctor.value = doctor.ID_DOCTOR;
                let infoText = [];
                if (doctor.ESPECIALIDAD) infoText.push(`🏥 ${doctor.ESPECIALIDAD}`);
                if (doctor.CORREO_ELECTRONICO) infoText.push(`📧 ${doctor.CORREO_ELECTRONICO}`);
                if (doctor.IDENTIDAD) infoText.push(`🆔 ${doctor.IDENTIDAD}`);
                infoDoctor.textContent = infoText.join(' • ');

                await cargarEspecialidadesDoctor(
                    doctor.ID_DOCTOR,
                    true,
                    cita.ID_ESPECIALIDAD_CITA || cita.id_especialidad_cita || ""
                );
            } else {
                reiniciarSelectorEspecialidad(true);
            }

            // Fecha y hora
            const fechaStr = cita.FECHA_CITA || cita.fecha_cita || cita.FECHA || cita.fecha;
            if (fechaStr) {
                const fecha = new Date(fechaStr);
                if (!isNaN(fecha.getTime())) {
                    $("editInputFecha").value = fecha.toISOString().split('T')[0];
                    $("editInputHora").value = fecha.toTimeString().slice(0, 5);
                }
            }

            $("editSelectDuracion").value = cita.DURACION_ESTIMADA_MIN || cita.duracion_estimada_min || 30;
            $("editSelectTipoCita").value = cita.TIPO_CITA || cita.tipo_cita || "PRIMERA_VEZ";
            $("editSelectPrioridad").value = cita.PRIORIDAD || cita.prioridad || "NORMAL";
            $("editSelectCanal").value = cita.CANAL_REGISTRO || cita.canal_registro || "PRESENCIAL";
            $("editSelectEstado").value = cita.ESTADO || cita.estado || "PROGRAMADA";
            $("editTextareaMotivo").value = cita.MOTIVO_CONSULTA || cita.motivo_consulta || "";

            calcularFinEstimadoEditar();
            actualizarModoEdicionPasada();

            modal.style.display = "flex";
            modal.setAttribute("aria-hidden", "false");

        } catch (error) {
            console.error("Error al editar cita:", error);
            mostrarMensaje("error", "Error al cargar datos para edición");
        }
    }

    function cerrarModalEditar() {
        const modal = $("modalEditarCita");
        if (modal) {
            modal.style.display = "none";
            modal.setAttribute("aria-hidden", "true");
            $("formEditarCita")?.reset();
            reiniciarSelectorEspecialidad(true);
        }
    }

    async function guardarEdicionCita() {
        if (editSubmitInProgress) return;
        editSubmitInProgress = true;

        const idCita = $("editIdCita")?.value;
        const paciente = $("editPacienteSeleccionado")?.value;
        const doctor = $("editDoctorSeleccionado")?.value;
        const especialidad = $("editSelectEspecialidadCita")?.value;
        const fecha = $("editInputFecha")?.value;
        const hora = $("editInputHora")?.value;
        const duracion = $("editSelectDuracion")?.value;
        const tipoCita = $("editSelectTipoCita")?.value;
        const prioridad = $("editSelectPrioridad")?.value;
        const canal = $("editSelectCanal")?.value;
        const estado = $("editSelectEstado")?.value;
        const motivo = $("editTextareaMotivo")?.value;

        if (!paciente || !doctor || !especialidad || !fecha || !hora) {
            mostrarErrorModalEditar("Complete paciente, médico, especialidad, fecha y hora.");
            editSubmitInProgress = false;
            return;
        }

        const fechaHora = `${fecha}T${hora}:00`;
        const fechaSeleccionada = new Date(fechaHora);
        const ahora = new Date();

        const esFechaPasada = fechaSeleccionada <= ahora;
        const estadoNormalizado = String(estado || "").toUpperCase();

        if (esFechaPasada && estadoNormalizado !== "FINALIZADA") {
            mostrarErrorModalEditar(
                "Las citas con una fecha anterior deben conservarse con estado FINALIZADA."
            );
            editSubmitInProgress = false;
            return;
        }

        const btn = $("btnGuardarEdicion");
        if (btn) btn.disabled = true;

        try {
            const respuesta = await fetch("/citas/editar", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({ 
                    idCita, 
                    paciente, 
                    doctor,
                    especialidad,
                    fechaCita: fechaHora, 
                    tipoCita, 
                    prioridad, 
                    motivo, 
                    duracion, 
                    canal,
                    estado 
                })
            });

            const contenido = respuesta.headers.get("content-type") || "";

            if (respuesta.status === 409) {
                const error = contenido.includes("application/json") ? await respuesta.json() : null;
                mostrarErrorModalEditar(error?.message || "Ya existe una cita registrada.");
                return;
            }

            if (!respuesta.ok) {
                const error = contenido.includes("application/json") ? await respuesta.json() : null;
                mostrarErrorModalEditar(error?.message || "Error actualizando la cita.");
                return;
            }

            const data = contenido.includes("application/json") ? await respuesta.json() : null;

            if (data?.success) {
                mostrarMensaje("success", data.message || "Cita actualizada correctamente");
                cerrarModalEditar();
                await cargarDatosReales(true);
            } else {
                mostrarMensaje("success", "Cita actualizada");
                cerrarModalEditar();
                await cargarDatosReales(true);
            }
        } catch (error) {
            console.error("Error actualizando cita:", error);
            mostrarErrorModalEditar("Error de conexión: " + error.message);
        } finally {
            if (btn) btn.disabled = false;
            setTimeout(() => { editSubmitInProgress = false; }, 400);
        }
    }

    async function eliminarCita() {
        const idCita = $("editIdCita")?.value;
        if (!idCita) return;

        if (!confirm(`¿Está seguro de eliminar la cita #${idCita}? Esta acción no se puede deshacer.`)) return;

        try {
            const respuesta = await fetch(`/citas/eliminar/${idCita}`, {
                method: "DELETE",
                credentials: "same-origin"
            });

            const data = await respuesta.json();

            if (!respuesta.ok) {
                mostrarMensaje("error", data.message || "No se pudo eliminar la cita");
                return;
            }

            mostrarMensaje("success", data.message || "Cita eliminada correctamente");
            cerrarModalEditar();
            await cargarDatosReales(true);
        } catch (error) {
            console.error("Error eliminando cita:", error);
            mostrarMensaje("error", "Error de conexión");
        }
    }

    function mostrarErrorModalEditar(texto) {
        const error = $("modalErrorEditar");
        if (!error) { alert(texto); return; }
        const msg = $("modalErrorMessageEditar");
        if (msg) msg.textContent = texto;
        error.style.display = "block";
    }

    // ==================== FUNCIONES DE CREACIÓN ====================

    async function guardarCitaHandler() {
        if (submitInProgress) return;
        submitInProgress = true;

        const paciente = $("pacienteSeleccionado")?.value;
        const doctor = $("doctorSeleccionado")?.value;
        const especialidad = $("selectEspecialidadCita")?.value;
        const fecha = $("inputFecha")?.value;
        const hora = $("inputHora")?.value;
        const duracion = $("selectDuracion")?.value;
        const tipoCita = $("selectTipoCita")?.value;
        const prioridad = $("selectPrioridad")?.value;
        const canal = $("selectCanal")?.value;
        const motivo = $("textareaMotivo")?.value;

        if (!paciente || !doctor || !especialidad || !fecha || !hora) {
            mostrarErrorModal("Complete paciente, médico, especialidad, fecha y hora.");
            submitInProgress = false;
            return;
        }

        const fechaHora = `${fecha}T${hora}:00`;
        const fechaSeleccionada = new Date(fechaHora);
        const ahora = new Date();

        const esRegistroPasado = fechaSeleccionada <= ahora;
        const registrarComoAtendido =
            esRegistroPasado &&
            Boolean($("checkRegistroAtendido")?.checked);

        if (esRegistroPasado && !registrarComoAtendido) {
            mostrarErrorModal(
                "Para registrar una fecha anterior debe confirmar que el paciente ya fue atendido."
            );
            submitInProgress = false;
            return;
        }

        const btn = $("btnGuardarCita");
        if (btn) btn.disabled = true;

        try {
            const respuesta = await fetch("/citas/nueva", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({
                    paciente,
                    doctor,
                    especialidad,
                    fechaCita: fechaHora,
                    tipoCita,
                    prioridad,
                    motivo,
                    duracion,
                    canal,
                    registroAtendido: registrarComoAtendido
                })
            });

            const contenido = respuesta.headers.get("content-type") || "";

            if (respuesta.status === 409) {
                const error = contenido.includes("application/json") ? await respuesta.json() : null;
                mostrarErrorModal(error?.message || "Ya existe una cita registrada.");
                return;
            }

            if (!respuesta.ok) {
                const error = contenido.includes("application/json") ? await respuesta.json() : null;
                mostrarErrorModal(error?.message || "Error creando la cita.");
                return;
            }

            const data = contenido.includes("application/json") ? await respuesta.json() : null;

            if (data?.success) {
                mostrarMensaje("success", data.message || "Cita creada correctamente");
                cerrarModalNuevaCita();
                await cargarDatosReales(true);
            } else {
                mostrarMensaje("success", "Cita creada");
                cerrarModalNuevaCita();
                await cargarDatosReales(true);
            }
        } catch (error) {
            console.error("Error creando cita:", error);
            mostrarErrorModal("Error de conexión: " + error.message);
        } finally {
            if (btn) btn.disabled = false;
            setTimeout(() => { submitInProgress = false; }, 400);
        }
    }

    function mostrarErrorModal(texto) {
        const error = $("modalError");
        if (!error) { alert(texto); return; }
        const msg = $("modalErrorMessage");
        if (msg) msg.textContent = texto;
        error.style.display = "block";
    }

    function abrirModalNuevaCita() {
        const modal = $("modalNuevaCita");
        if (modal) {
            modal.style.display = "flex";
            modal.setAttribute("aria-hidden", "false");
            if (!$("doctorSeleccionado")?.value) {
                reiniciarSelectorEspecialidad(false);
            }
            if (fechaCalendarioSeleccionada) {
                $("inputFecha").value = fechaCalendarioSeleccionada;
                fechaCalendarioSeleccionada = null;
            }

            actualizarModoRegistroPasado();
        }
    }

    function abrirModalNuevaCitaConFecha(fecha) {
        fechaCalendarioSeleccionada = fecha;
        abrirModalNuevaCita();
    }

    function cerrarModalNuevaCita() {
        const modal = $("modalNuevaCita");
        if (modal) {
            modal.style.display = "none";
            modal.setAttribute("aria-hidden", "true");
            $("formNuevaCita")?.reset();
            fechaCalendarioSeleccionada = null;
            // Limpiar campos de autocompletado
            const inputPaciente = $("buscarPacienteNueva");
            const hiddenPaciente = $("pacienteSeleccionado");
            const infoPaciente = $("pacienteInfo");
            if (inputPaciente) inputPaciente.value = '';
            if (hiddenPaciente) hiddenPaciente.value = '';
            if (infoPaciente) infoPaciente.textContent = '';
            
            const inputDoctor = $("buscarDoctorNueva");
            const hiddenDoctor = $("doctorSeleccionado");
            const infoDoctor = $("doctorInfo");
            if (inputDoctor) inputDoctor.value = '';
            if (hiddenDoctor) hiddenDoctor.value = '';
            if (infoDoctor) infoDoctor.textContent = '';
            reiniciarSelectorEspecialidad(false);

            const panelRegistro = $("registroAtendidoPasado");
            const checkRegistro = $("checkRegistroAtendido");
            const botonGuardar = $("btnGuardarCita");

            if (panelRegistro) panelRegistro.style.display = "none";
            if (checkRegistro) checkRegistro.checked = false;
            if (botonGuardar) {
                botonGuardar.innerHTML =
                    '<i class="fas fa-check"></i> CONFIRMAR CITA';
            }
        }
    }

    function mostrarMensaje(tipo, texto) {
        try {
            if (tipo === "success") {
                const alerta = $("alertSuccess");
                if (!alerta) { alert(texto); return; }
                const msg = $("successMessage");
                if (msg) msg.textContent = texto;
                alerta.style.display = "flex";
                setTimeout(() => { alerta.style.display = "none"; }, 3500);
            } else if (tipo === "info") {
                const alerta = $("alertInfo") || crearAlertaInfo();
                if (alerta) {
                    const msg = alerta.querySelector(".info-message") || alerta;
                    msg.textContent = texto;
                    alerta.style.display = "flex";
                    setTimeout(() => { alerta.style.display = "none"; }, 3000);
                }
            } else {
                const alerta = $("alertError");
                if (!alerta) { alert(texto); return; }
                const msg = $("errorMessage");
                if (msg) msg.textContent = texto;
                alerta.style.display = "flex";
                setTimeout(() => { alerta.style.display = "none"; }, 5000);
            }
        } catch (e) {
            console.warn(e);
        }
    }

    function crearAlertaInfo() {
        const container = document.querySelector(".alert-container") || document.body;
        const alerta = document.createElement("div");
        alerta.id = "alertInfo";
        alerta.className = "alert alert-info";
        alerta.style.cssText = "display:none; position:fixed; top:20px; right:20px; z-index:9999; padding:15px; background:#cce5ff; border:1px solid #b8daff; border-radius:4px;";
        alerta.innerHTML = `<span class="info-message"></span>`;
        container.appendChild(alerta);
        return alerta;
    }


    // ==================== DIRECTORIO DE PACIENTES ====================

    let pacienteDetalleAbortController = null;

    function normalizarTextoPaciente(valor) {
        return String(valor ?? "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .trim();
    }

    function actualizarContadorPacientes() {
        const contador = $("contadorPacientes");
        if (!contador) return;

        contador.textContent = String(pacientesData.length);
        contador.setAttribute(
            "aria-label",
            `${pacientesData.length} pacientes registrados`
        );
    }

    function obtenerInicialesPaciente(paciente) {
        const nombres = String(paciente?.NOMBRES || "").trim();
        const apellidos = String(paciente?.APELLIDOS || "").trim();
        const primera = nombres.charAt(0);
        const segunda = apellidos.charAt(0);

        return `${primera}${segunda}`.toUpperCase() || "P";
    }

    function obtenerNombreCompletoPaciente(paciente) {
        return `${paciente?.NOMBRES || ""} ${paciente?.APELLIDOS || ""}`
            .replace(/\s+/g, " ")
            .trim() || "Paciente sin nombre";
    }

    function valorPaciente(valor, textoVacio = "No registrado") {
        if (
            valor === null ||
            valor === undefined ||
            String(valor).trim() === ""
        ) {
            return textoVacio;
        }

        return String(valor);
    }

    function formatearEtiquetaPaciente(valor) {
        const texto = valorPaciente(valor, "No registrado");

        if (texto === "No registrado") {
            return texto;
        }

        return texto
            .replace(/_/g, " ")
            .toLowerCase()
            .replace(/\b\w/g, letra => letra.toUpperCase());
    }

    function formatearFechaPaciente(valor, incluirHora = false) {
        if (!valor) return "No registrada";

        const fecha = new Date(valor);
        if (Number.isNaN(fecha.getTime())) {
            return valorPaciente(valor, "No registrada");
        }

        const opciones = incluirHora
            ? {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit"
            }
            : {
                day: "2-digit",
                month: "2-digit",
                year: "numeric"
            };

        return fecha.toLocaleString("es-HN", opciones);
    }

    function calcularEdadPaciente(fechaNacimiento) {
        if (!fechaNacimiento) return null;

        const nacimiento = new Date(fechaNacimiento);
        if (Number.isNaN(nacimiento.getTime())) return null;

        const hoy = new Date();
        let edad = hoy.getFullYear() - nacimiento.getFullYear();
        const diferenciaMes = hoy.getMonth() - nacimiento.getMonth();

        if (
            diferenciaMes < 0 ||
            (diferenciaMes === 0 && hoy.getDate() < nacimiento.getDate())
        ) {
            edad--;
        }

        return edad >= 0 ? edad : null;
    }

    function normalizarListaMedica(valor) {
        if (Array.isArray(valor)) {
            return valor
                .map(item => String(item ?? "").trim())
                .filter(Boolean);
        }

        if (valor === null || valor === undefined || valor === "") {
            return [];
        }

        if (typeof valor === "string") {
            try {
                const parsed = JSON.parse(valor);
                if (Array.isArray(parsed)) {
                    return parsed
                        .map(item => String(item ?? "").trim())
                        .filter(Boolean);
                }
            } catch (_) {
                // Puede ser texto simple.
            }

            return valor
                .split(",")
                .map(item => item.trim())
                .filter(Boolean);
        }

        return [String(valor)];
    }

    function crearCampoDetalle(icono, etiqueta, valor, claseExtra = "") {
        return `
            <div class="paciente-detail-field ${claseExtra}">
                <span class="paciente-detail-field__icon">
                    <i class="${escapeHtml(icono)}"></i>
                </span>
                <div>
                    <small>${escapeHtml(etiqueta)}</small>
                    <strong>${escapeHtml(valorPaciente(valor))}</strong>
                </div>
            </div>
        `;
    }

    function crearListaMedicaDetalle(titulo, icono, valores) {
        const lista = normalizarListaMedica(valores);

        return `
            <article class="paciente-medical-card">
                <div class="paciente-medical-card__header">
                    <span><i class="${escapeHtml(icono)}"></i></span>
                    <h6>${escapeHtml(titulo)}</h6>
                    <em>${lista.length}</em>
                </div>

                ${
                    lista.length
                        ? `
                            <div class="paciente-medical-tags">
                                ${lista
                                    .map(
                                        item => `
                                            <span>
                                                <i class="fas fa-check-circle"></i>
                                                ${escapeHtml(item)}
                                            </span>
                                        `
                                    )
                                    .join("")}
                            </div>
                        `
                        : `
                            <p class="paciente-medical-empty">
                                Sin información registrada.
                            </p>
                        `
                }
            </article>
        `;
    }

    function mostrarVistaListaPacientes() {
        pacienteDetalleAbortController?.abort();
        pacienteDetalleAbortController = null;

        const vistaLista = $("vistaListaPacientes");
        const vistaDetalle = $("vistaDetallePaciente");
        const botonVolver = $("btnVolverListaPacientes");
        const titulo = $("tituloModalPacientes");
        const subtitulo = $("subtituloModalPacientes");

        if (vistaLista) vistaLista.style.display = "block";
        if (vistaDetalle) vistaDetalle.style.display = "none";
        if (botonVolver) botonVolver.style.display = "none";

        if (titulo) titulo.textContent = "Directorio de pacientes";
        if (subtitulo) {
            subtitulo.textContent =
                "Consulte pacientes y abra su ficha completa sin modificar información.";
        }

        renderPacientesModal();
    }

    function renderPacientesModal() {
        const contenedor = $("listaPacientesModal");
        if (!contenedor) return;

        const busqueda = normalizarTextoPaciente(
            $("buscarPacienteModal")?.value
        );

        const lista = pacientesData
            .filter(paciente => {
                if (!busqueda) return true;

                const contenido = [
                    paciente.NOMBRES,
                    paciente.APELLIDOS,
                    paciente.NUMERO_DOCUMENTO_IDENTIDAD,
                    paciente.TELEFONO,
                    paciente.CORREO_ELECTRONICO
                ]
                    .map(normalizarTextoPaciente)
                    .join(" ");

                return contenido.includes(busqueda);
            })
            .sort((a, b) =>
                obtenerNombreCompletoPaciente(a).localeCompare(
                    obtenerNombreCompletoPaciente(b),
                    "es",
                    { sensitivity: "base" }
                )
            );

        const conTelefono = pacientesData.filter(
            paciente => String(paciente.TELEFONO || "").trim()
        ).length;

        const conCorreo = pacientesData.filter(
            paciente => String(paciente.CORREO_ELECTRONICO || "").trim()
        ).length;

        if ($("totalPacientesModal")) {
            $("totalPacientesModal").textContent = String(pacientesData.length);
        }

        if ($("pacientesTelefonoModal")) {
            $("pacientesTelefonoModal").textContent = String(conTelefono);
        }

        if ($("pacientesCorreoModal")) {
            $("pacientesCorreoModal").textContent = String(conCorreo);
        }

        if ($("resultadoPacientesModal")) {
            $("resultadoPacientesModal").textContent = busqueda
                ? `${lista.length} resultado(s) de ${pacientesData.length} pacientes`
                : `Mostrando ${lista.length} pacientes`;
        }

        if (lista.length === 0) {
            contenedor.innerHTML = `
                <div class="pacientes-empty">
                    <i class="fas fa-user-slash"></i>
                    <h5>No se encontraron pacientes</h5>
                    <p>Revise el término de búsqueda e inténtelo nuevamente.</p>
                </div>
            `;
            return;
        }

        contenedor.innerHTML = `
            <div class="pacientes-table-scroll">
                <table class="pacientes-readonly-table">
                    <thead>
                        <tr>
                            <th>Paciente</th>
                            <th>Identidad</th>
                            <th>Teléfono</th>
                            <th>Correo electrónico</th>
                            <th>Ficha completa</th>
                        </tr>
                    </thead>

                    <tbody>
                        ${lista.map(paciente => {
                            const nombre = obtenerNombreCompletoPaciente(paciente);
                            const identidad =
                                paciente.NUMERO_DOCUMENTO_IDENTIDAD ||
                                "No registrada";
                            const telefono =
                                paciente.TELEFONO ||
                                "No registrado";
                            const correo =
                                paciente.CORREO_ELECTRONICO ||
                                "No registrado";

                            return `
                                <tr>
                                    <td>
                                        <div class="paciente-readonly-name">
                                            <span class="paciente-readonly-avatar">
                                                ${escapeHtml(obtenerInicialesPaciente(paciente))}
                                            </span>

                                            <div>
                                                <strong>${escapeHtml(nombre)}</strong>
                                                <small>
                                                    ID interno:
                                                    ${escapeHtml(paciente.ID_PACIENTE || "—")}
                                                </small>
                                            </div>
                                        </div>
                                    </td>

                                    <td>
                                        <span class="paciente-readonly-field">
                                            <i class="fas fa-id-card"></i>
                                            ${escapeHtml(identidad)}
                                        </span>
                                    </td>

                                    <td>
                                        <span class="paciente-readonly-field">
                                            <i class="fas fa-phone"></i>
                                            ${escapeHtml(telefono)}
                                        </span>
                                    </td>

                                    <td>
                                        <span class="paciente-readonly-field paciente-readonly-email">
                                            <i class="fas fa-envelope"></i>
                                            ${escapeHtml(correo)}
                                        </span>
                                    </td>

                                    <td>
                                        <button
                                            type="button"
                                            class="btn-ver-ficha-paciente"
                                            data-id-paciente="${escapeHtml(paciente.ID_PACIENTE)}"
                                            title="Ver todos los datos de ${escapeHtml(nombre)}"
                                        >
                                            <i class="fas fa-eye"></i>
                                            <span>Ver ficha completa</span>
                                        </button>
                                    </td>
                                </tr>
                            `;
                        }).join("")}
                    </tbody>
                </table>
            </div>
        `;
    }

    async function abrirFichaCompletaPaciente(idPaciente) {
        const id = Number(idPaciente);

        if (!Number.isInteger(id) || id <= 0) {
            mostrarMensaje("error", "El paciente seleccionado no es válido.");
            return;
        }

        const vistaLista = $("vistaListaPacientes");
        const vistaDetalle = $("vistaDetallePaciente");
        const contenido = $("detallePacienteContenido");
        const botonVolver = $("btnVolverListaPacientes");
        const titulo = $("tituloModalPacientes");
        const subtitulo = $("subtituloModalPacientes");

        if (!vistaDetalle || !contenido) return;

        if (vistaLista) vistaLista.style.display = "none";
        vistaDetalle.style.display = "block";
        if (botonVolver) botonVolver.style.display = "inline-flex";

        if (titulo) titulo.textContent = "Ficha completa del paciente";
        if (subtitulo) {
            subtitulo.textContent =
                "Información personal, contacto de emergencia, historial y datos administrativos.";
        }

        contenido.innerHTML = `
            <div class="pacientes-loading paciente-detail-loading">
                <i class="fas fa-spinner fa-spin"></i>
                Cargando información completa del paciente...
            </div>
        `;

        pacienteDetalleAbortController?.abort();
        pacienteDetalleAbortController = new AbortController();

        try {
            const respuesta = await fetch(
                `/pacientes/api/${encodeURIComponent(id)}`,
                {
                    method: "GET",
                    credentials: "same-origin",
                    headers: {
                        Accept: "application/json"
                    },
                    signal: pacienteDetalleAbortController.signal
                }
            );

            const datos = await respuesta.json().catch(() => null);

            if (!respuesta.ok || !datos?.success || !datos?.data) {
                throw new Error(
                    datos?.message ||
                    `No se pudo consultar el paciente. HTTP ${respuesta.status}`
                );
            }

            renderFichaCompletaPaciente(datos.data);
        } catch (error) {
            if (error?.name === "AbortError") return;

            console.error("Error consultando la ficha del paciente:", error);

            contenido.innerHTML = `
                <div class="paciente-detail-error">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h5>No fue posible cargar la ficha</h5>
                    <p>${escapeHtml(error.message)}</p>
                    <button
                        type="button"
                        class="ctbtn-secondary"
                        id="btnReintentarFichaPaciente"
                        data-id-paciente="${escapeHtml(id)}"
                    >
                        <i class="fas fa-redo"></i>
                        REINTENTAR
                    </button>
                </div>
            `;
        } finally {
            pacienteDetalleAbortController = null;
        }
    }

    function renderFichaCompletaPaciente(paciente) {
        const contenido = $("detallePacienteContenido");
        if (!contenido) return;

        const nombreCompleto = obtenerNombreCompletoPaciente(paciente);
        const edad = calcularEdadPaciente(paciente.FECHA_NACIMIENTO);
        const fechaNacimiento = formatearFechaPaciente(
            paciente.FECHA_NACIMIENTO
        );

        const contactoEmergenciaCompleto = Boolean(
            paciente.NOMBRE_CONTACTO_EMERGENCIA ||
            paciente.TELEFONO_CONTACTO_EMERGENCIA ||
            paciente.PARENTESCO_CONTACTO_EMERGENCIA
        );

        contenido.innerHTML = `
            <div class="paciente-detail-scroll">
                <section class="paciente-detail-hero">
                    <div class="paciente-detail-avatar">
                        ${escapeHtml(obtenerInicialesPaciente(paciente))}
                    </div>

                    <div class="paciente-detail-identity">
                        <div class="paciente-detail-identity__top">
                            <div>
                                <span>Paciente #${escapeHtml(paciente.ID_PACIENTE || "—")}</span>
                                <h5>${escapeHtml(nombreCompleto)}</h5>
                            </div>

                            <span class="paciente-status paciente-status--${normalizarTextoPaciente(paciente.ESTADO || "sin-estado").replace(/\s+/g, "-")}">
                                <i class="fas fa-circle"></i>
                                ${escapeHtml(formatearEtiquetaPaciente(paciente.ESTADO))}
                            </span>
                        </div>

                        <div class="paciente-detail-quick">
                            <span>
                                <i class="fas fa-id-card"></i>
                                ${escapeHtml(
                                    valorPaciente(
                                        paciente.NUMERO_DOCUMENTO_IDENTIDAD
                                    )
                                )}
                            </span>

                            <span>
                                <i class="fas fa-phone"></i>
                                ${escapeHtml(valorPaciente(paciente.TELEFONO))}
                            </span>

                            <span>
                                <i class="fas fa-birthday-cake"></i>
                                ${
                                    edad === null
                                        ? "Edad no disponible"
                                        : `${escapeHtml(edad)} años`
                                }
                            </span>
                        </div>
                    </div>
                </section>

                <section class="paciente-detail-section">
                    <div class="paciente-detail-section__title">
                        <span><i class="fas fa-user"></i></span>
                        <div>
                            <h6>Información personal</h6>
                            <p>Datos generales e identificación del paciente.</p>
                        </div>
                    </div>

                    <div class="paciente-detail-grid">
                        ${crearCampoDetalle(
                            "fas fa-calendar-day",
                            "Fecha de nacimiento",
                            fechaNacimiento
                        )}

                        ${crearCampoDetalle(
                            "fas fa-hourglass-half",
                            "Edad",
                            edad === null ? "No disponible" : `${edad} años`
                        )}

                        ${crearCampoDetalle(
                            "fas fa-venus-mars",
                            "Género",
                            formatearEtiquetaPaciente(paciente.GENERO)
                        )}

                        ${crearCampoDetalle(
                            "fas fa-heart",
                            "Estado civil",
                            formatearEtiquetaPaciente(paciente.ESTADO_CIVIL)
                        )}

                        ${crearCampoDetalle(
                            "fas fa-briefcase",
                            "Ocupación",
                            paciente.OCUPACION
                        )}

                        ${crearCampoDetalle(
                            "fas fa-file-alt",
                            "Tipo de documento",
                            formatearEtiquetaPaciente(
                                paciente.TIPO_DOCUMENTO_IDENTIDAD
                            )
                        )}

                        ${crearCampoDetalle(
                            "fas fa-id-card",
                            "Número de identidad",
                            paciente.NUMERO_DOCUMENTO_IDENTIDAD
                        )}

                        ${crearCampoDetalle(
                            "fas fa-receipt",
                            "RTN",
                            paciente.RTN_PACIENTE
                        )}
                    </div>
                </section>

                <section class="paciente-detail-section">
                    <div class="paciente-detail-section__title">
                        <span><i class="fas fa-map-marker-alt"></i></span>
                        <div>
                            <h6>Contacto y residencia</h6>
                            <p>Medios de comunicación y dirección registrada.</p>
                        </div>
                    </div>

                    <div class="paciente-detail-grid">
                        ${crearCampoDetalle(
                            "fas fa-phone",
                            "Teléfono",
                            paciente.TELEFONO
                        )}

                        ${crearCampoDetalle(
                            "fas fa-envelope",
                            "Correo electrónico",
                            paciente.CORREO_ELECTRONICO,
                            "paciente-detail-field--wide"
                        )}

                        ${crearCampoDetalle(
                            "fas fa-home",
                            "Dirección",
                            paciente.DIRECCION,
                            "paciente-detail-field--full"
                        )}
                    </div>
                </section>

                <section class="paciente-detail-section paciente-detail-section--emergency">
                    <div class="paciente-detail-section__title">
                        <span><i class="fas fa-phone-volume"></i></span>
                        <div>
                            <h6>Contacto de emergencia o familiar registrado</h6>
                            <p>Persona disponible para contactar en caso de emergencia.</p>
                        </div>
                    </div>

                    ${
                        contactoEmergenciaCompleto
                            ? `
                                <div class="paciente-emergency-card">
                                    <span class="paciente-emergency-card__avatar">
                                        <i class="fas fa-user-shield"></i>
                                    </span>

                                    <div class="paciente-emergency-card__body">
                                        <strong>
                                            ${escapeHtml(
                                                valorPaciente(
                                                    paciente.NOMBRE_CONTACTO_EMERGENCIA
                                                )
                                            )}
                                        </strong>

                                        <div>
                                            <span>
                                                <i class="fas fa-users"></i>
                                                ${escapeHtml(
                                                    valorPaciente(
                                                        paciente.PARENTESCO_CONTACTO_EMERGENCIA
                                                    )
                                                )}
                                            </span>

                                            <span>
                                                <i class="fas fa-phone-alt"></i>
                                                ${escapeHtml(
                                                    valorPaciente(
                                                        paciente.TELEFONO_CONTACTO_EMERGENCIA
                                                    )
                                                )}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            `
                            : `
                                <div class="paciente-detail-notice">
                                    <i class="fas fa-info-circle"></i>
                                    No existe un contacto de emergencia registrado.
                                </div>
                            `
                    }
                </section>

                <section class="paciente-detail-section">
                    <div class="paciente-detail-section__title">
                        <span><i class="fas fa-notes-medical"></i></span>
                        <div>
                            <h6>Información médica registrada</h6>
                            <p>Datos del historial médico disponibles para consulta.</p>
                        </div>
                    </div>

                    <div class="paciente-medical-grid">
                        ${crearListaMedicaDetalle(
                            "Alergias",
                            "fas fa-allergies",
                            paciente.ALERGIAS
                        )}

                        ${crearListaMedicaDetalle(
                            "Enfermedades crónicas",
                            "fas fa-heartbeat",
                            paciente.ENFERMEDADES_CRONICAS
                        )}

                        ${crearListaMedicaDetalle(
                            "Cirugías previas",
                            "fas fa-procedures",
                            paciente.CIRUGIAS_PREVIAS
                        )}

                        ${crearListaMedicaDetalle(
                            "Medicamentos actuales",
                            "fas fa-pills",
                            paciente.MEDICAMENTOS_ACTUALES
                        )}

                        ${crearListaMedicaDetalle(
                            "Vacunas",
                            "fas fa-syringe",
                            paciente.VACUNAS
                        )}
                    </div>
                </section>

                <section class="paciente-detail-section">
                    <div class="paciente-detail-section__title">
                        <span><i class="fas fa-clipboard-check"></i></span>
                        <div>
                            <h6>Información administrativa</h6>
                            <p>Estado y trazabilidad del registro del paciente.</p>
                        </div>
                    </div>

                    <div class="paciente-detail-grid">
                        ${crearCampoDetalle(
                            "fas fa-toggle-on",
                            "Estado",
                            formatearEtiquetaPaciente(paciente.ESTADO)
                        )}

                        ${crearCampoDetalle(
                            "fas fa-calendar-plus",
                            "Fecha de registro",
                            formatearFechaPaciente(
                                paciente.FECHA_REGISTRO,
                                true
                            )
                        )}

                        ${crearCampoDetalle(
                            "fas fa-calendar-check",
                            "Última actualización",
                            formatearFechaPaciente(
                                paciente.FECHA_ACTUALIZACION,
                                true
                            )
                        )}

                        ${crearCampoDetalle(
                            "fas fa-user-plus",
                            "Usuario creador",
                            paciente.USUARIO_CREACION
                        )}

                        ${crearCampoDetalle(
                            "fas fa-user-edit",
                            "Último usuario modificador",
                            paciente.USUARIO_MODIFICACION
                        )}
                    </div>
                </section>
            </div>
        `;
    }

    function abrirModalPacientes() {
        const modal = $("modalPacientes");
        if (!modal) return;

        const buscador = $("buscarPacienteModal");
        if (buscador) buscador.value = "";

        mostrarVistaListaPacientes();

        document.body.style.overflow = "hidden";

        modal.style.display = "flex";
        modal.setAttribute("aria-hidden", "false");

        window.setTimeout(() => {
            buscador?.focus();
        }, 100);
    }

    function cerrarModalPacientes() {
        pacienteDetalleAbortController?.abort();
        pacienteDetalleAbortController = null;

        const modal = $("modalPacientes");
        if (!modal) return;

        modal.style.display = "none";
        modal.setAttribute("aria-hidden", "true");

        document.body.style.overflow = "";

        const buscador = $("buscarPacienteModal");
        if (buscador) buscador.value = "";

        mostrarVistaListaPacientes();
    }

    // ==================== FUNCIONES DE CALENDARIO ====================

    async function abrirCalendario() {
        const modal = document.getElementById("modalCalendario");
        if (!modal) {
            console.error("No se encontró el modal del calendario");
            return;
        }

        vistaCitasActual = "calendario";
        modal.style.display = "flex";
        modal.setAttribute("aria-hidden", "false");

        try {
            await cargarDatosReales(true);
            mostrarCalendario(citasData);
        } catch (error) {
            console.error("Error abriendo calendario:", error);
            mostrarCalendario(citasData);
        }
    }

    function cerrarCalendario() {
        const modal = $("modalCalendario");
        if (modal) {
            modal.style.display = "none";
            modal.setAttribute("aria-hidden", "true");
        }
        vistaCitasActual = "tabla";
        if (datosFiltrados.length > 0) {
            mostrarCitas(datosFiltrados);
        } else {
            mostrarCitas(citasData);
        }
    }

    // ==================== FUNCIONES DE CÁLCULO ====================

    function calcularFinEstimado() {
        const fecha = $("inputFecha")?.value;
        const hora = $("inputHora")?.value;
        const duracion = parseInt($("selectDuracion")?.value || 30);
        if (!fecha || !hora) return;
        try {
            const fechaHora = new Date(`${fecha}T${hora}:00`);
            fechaHora.setMinutes(fechaHora.getMinutes() + duracion);
            const finEstimado = $("finEstimado");
            if (finEstimado) {
                finEstimado.textContent = fechaHora.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
            }
        } catch (e) {
            console.warn("Error calculando fin estimado:", e);
        }
    }

    function calcularFinEstimadoEditar() {
        const fecha = $("editInputFecha")?.value;
        const hora = $("editInputHora")?.value;
        const duracion = parseInt($("editSelectDuracion")?.value || 30);
        if (!fecha || !hora) return;
        try {
            const fechaHora = new Date(`${fecha}T${hora}:00`);
            fechaHora.setMinutes(fechaHora.getMinutes() + duracion);
            const finEstimado = $("editFinEstimado");
            if (finEstimado) {
                finEstimado.textContent = fechaHora.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
            }
        } catch (e) {
            console.warn("Error calculando fin estimado:", e);
        }
    }

    // ==================== FUNCIONES DE IMPRESIÓN ====================

    function generarVentanaImpresion(logoBase64) {
        const tabla = document.getElementById("tablaContenido");
        if (!tabla) {
            alert("No hay información para imprimir");
            return;
        }

        const contenido = tabla.cloneNode(true);
        contenido.querySelectorAll("th:last-child, td:last-child").forEach(el => el.remove());
        contenido.querySelectorAll("button, i").forEach(el => el.remove());

        const ventana = window.open("", "_blank", "width=900,height=700");
        if (!ventana) { alert("El navegador bloqueó la ventana"); return; }

        ventana.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Listado de Citas Médicas</title>
            <style>
                body { font-family: sans-serif; padding: 40px; color: #333; }
                .header-top { display: flex; align-items: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 30px; }
                .logo { width: 80px; margin-right: 20px; }
                .empresa-info h1 { margin: 0; font-size: 20px; }
                .empresa-info p { margin: 0; font-style: italic; font-size: 14px; color: #666; }
                h2 { text-align: center; text-decoration: underline; margin-bottom: 20px; }
                table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                th { border: 1px solid #ccc; padding: 10px; background: #f8f9fa; text-align: left; }
                td { border: 1px solid #ccc; padding: 10px; }
                .footer-info { margin-top: 30px; text-align: right; font-weight: bold; }
            </style>
        </head>
        <body>
            <div class="header-top">
                ${logoBase64 ? `<img class="logo" src="${logoBase64}">` : ""}
                <div class="empresa-info">
                    <h1>Clínicas Médicas Roca Maya</h1>
                    <p>Tu salud es nuestra seguridad</p>
                </div>
            </div>
            <h2>Lista de Citas Médicas</h2>
            ${contenido.innerHTML}
            <div class="footer-info">
                <p>Total de citas: ${contenido.querySelectorAll("tbody tr").length}</p>
                <p>Generado el: ${new Date().toLocaleString("es-HN")}</p>
            </div>
        </body>
        </html>
        `);

        ventana.document.close();
        setTimeout(() => { ventana.focus(); ventana.print(); }, 700);
    }

    // ==================== EVENT LISTENERS ====================

    document.addEventListener("DOMContentLoaded", () => {
        cargarDatosReales();

        // Logo - Dashboard
        $("logoBtn")?.addEventListener("click", () => {
            window.location.href = "/dashboard";
        });

        // Vista lista
        $("btn-vista-lista")?.addEventListener("click", () => {
            vistaCitasActual = "tabla";
            cerrarCalendario();
            if (datosFiltrados.length > 0) {
                mostrarCitas(datosFiltrados);
            } else {
                mostrarCitas(citasData);
            }
        });

        // Filtro búsqueda
        const filtroBusqueda = $("filtroBusqueda");
        if (filtroBusqueda) {
            filtroBusqueda.addEventListener("input", debounce(function() {
                aplicarFiltros();
            }, 300));
        }

        // Botón imprimir
        const btnImprimir = document.getElementById("btnImprimir");
        if (btnImprimir) {
            btnImprimir.addEventListener("click", async () => {
                try {
                    if (typeof setLoading === 'function') setLoading(true, "Preparando impresión...");
                    const logoBase64 = await imageToBase64("/roca-maya-oct.jpg");
                    generarVentanaImpresion(logoBase64);
                } catch (error) {
                    console.error("Error cargando logo:", error);
                    generarVentanaImpresion(null);
                } finally {
                    if (typeof setLoading === 'function') setLoading(false);
                }
            });
        }

        // Nueva Cita
        $("btnNuevaCitaHeader")?.addEventListener("click", abrirModalNuevaCita);
        $("btnCancelarModal")?.addEventListener("click", cerrarModalNuevaCita);
        $("btnCloseModal")?.addEventListener("click", cerrarModalNuevaCita);
        $("btnGuardarCita")?.addEventListener("click", guardarCitaHandler);

        // Editar Cita
        $("btnCloseModalEditar")?.addEventListener("click", cerrarModalEditar);
        $("btnCancelarEditar")?.addEventListener("click", cerrarModalEditar);
        $("btnGuardarEdicion")?.addEventListener("click", guardarEdicionCita);
        $("btnEliminarCita")?.addEventListener("click", eliminarCita);

        // Asignación de especialidad faltante
        $("btnCerrarAsignarEspecialidad")?.addEventListener(
            "click",
            cerrarModalAsignarEspecialidad
        );

        $("btnCancelarAsignarEspecialidad")?.addEventListener(
            "click",
            cerrarModalAsignarEspecialidad
        );

        $("btnGuardarAsignarEspecialidad")?.addEventListener(
            "click",
            guardarAsignacionEspecialidad
        );

        // Calendario
        $("btn-vista-calendario")?.addEventListener("click", abrirCalendario);
        $("btnCerrarCalendario")?.addEventListener("click", cerrarCalendario);

        // Directorio de pacientes - solo lectura
        $("btnVerPacientes")?.addEventListener("click", abrirModalPacientes);
        $("btnCerrarPacientes")?.addEventListener("click", cerrarModalPacientes);
        $("btnCerrarPacientesFooter")?.addEventListener(
            "click",
            cerrarModalPacientes
        );

        $("btnVolverListaPacientes")?.addEventListener(
            "click",
            mostrarVistaListaPacientes
        );

        $("buscarPacienteModal")?.addEventListener(
            "input",
            debounce(renderPacientesModal, 180)
        );

        $("btnLimpiarBusquedaPacientes")?.addEventListener("click", () => {
            const buscador = $("buscarPacienteModal");

            if (buscador) {
                buscador.value = "";
                buscador.focus();
            }

            renderPacientesModal();
        });

        $("listaPacientesModal")?.addEventListener("click", event => {
            const boton = event.target.closest(".btn-ver-ficha-paciente");
            if (!boton) return;

            abrirFichaCompletaPaciente(boton.dataset.idPaciente);
        });

        $("detallePacienteContenido")?.addEventListener("click", event => {
            const boton = event.target.closest("#btnReintentarFichaPaciente");
            if (!boton) return;

            abrirFichaCompletaPaciente(boton.dataset.idPaciente);
        });

        // Navegación calendario
        $("prev-month")?.addEventListener("click", () => {
            mesCalendarioActual--;
            if (mesCalendarioActual < 0) {
                mesCalendarioActual = 11;
                anioCalendarioActual--;
            }
            mostrarCalendario(datosFiltrados.length > 0 ? datosFiltrados : citasData);
        });

        $("next-month")?.addEventListener("click", () => {
            mesCalendarioActual++;
            if (mesCalendarioActual > 11) {
                mesCalendarioActual = 0;
                anioCalendarioActual++;
            }
            mostrarCalendario(datosFiltrados.length > 0 ? datosFiltrados : citasData);
        });

        // Eventos de tabla
        $("tablaContenido")?.addEventListener("click", tablaClickHandler);
        
        // Cálculo de fin estimado
        $("inputFecha")?.addEventListener("change", () => {
            calcularFinEstimado();
            actualizarModoRegistroPasado();
        });

        $("inputHora")?.addEventListener("change", () => {
            calcularFinEstimado();
            actualizarModoRegistroPasado();
        });

        $("selectDuracion")?.addEventListener("change", calcularFinEstimado);

        $("editInputFecha")?.addEventListener("change", () => {
            calcularFinEstimadoEditar();
            actualizarModoEdicionPasada();
        });

        $("editInputHora")?.addEventListener("change", () => {
            calcularFinEstimadoEditar();
            actualizarModoEdicionPasada();
        });

        $("editSelectDuracion")?.addEventListener("change", calcularFinEstimadoEditar);
        $("editSelectEstado")?.addEventListener("change", actualizarModoEdicionPasada);

        // Filtros principales
        $("filtroEstado")?.addEventListener("change", aplicarFiltros);
        $("filtroDoctor")?.addEventListener("change", aplicarFiltros);
        $("filtroFechaDesde")?.addEventListener("change", aplicarFiltros);
        $("filtroFechaHasta")?.addEventListener("change", aplicarFiltros);

        // Botón crear primera cita
        const btnCrearPrimera = $("btnCrearPrimera");
        if (btnCrearPrimera) {
            btnCrearPrimera.addEventListener("click", abrirModalNuevaCita);
        }

        // Los modales de nueva y editar cita permanecen fijos para evitar
        // pérdida accidental de información. El calendario sí puede cerrarse
        // al hacer clic fuera de su contenido.
        $("modalCalendario")?.addEventListener("click", (e) => {
            if (e.target === $("modalCalendario")) {
                cerrarCalendario();
            }
        });

        // ==================== AUTOCOMPLETADO ====================
        
        // Pacientes - Nueva Cita
        setupAutocompletePacientes('buscarPacienteNueva', 'autocompletePacientes', 'pacienteSeleccionado', 'pacienteInfo', false);
        
        // Doctores - Nueva Cita
        setupAutocompleteDoctores('buscarDoctorNueva', 'autocompleteDoctores', 'doctorSeleccionado', 'doctorInfo', false);
        
        // Pacientes - Editar
        setupAutocompletePacientes('buscarPacienteEditar', 'autocompletePacientesEditar', 'editPacienteSeleccionado', 'editPacienteInfo', true);
        
        // Doctores - Editar
        setupAutocompleteDoctores('buscarDoctorEditar', 'autocompleteDoctoresEditar', 'editDoctorSeleccionado', 'editDoctorInfo', true);
    });


    window.abrirEspecialidadDeCita = async function(idCita) {
        return abrirModalAsignarEspecialidad(idCita);
    };

})();
