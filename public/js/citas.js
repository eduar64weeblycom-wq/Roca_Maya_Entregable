// ==========================================
// MÓDULO DE GESTIÓN DE CITAS - CLÍNICAS ROCA MAYA
// ==========================================

(function() {
    'use strict';

    // Variables de Estado Global
    let citasData = [];
    let pacientesData = [];
    let doctoresData = [];
    let vistaCitasActual = 'tabla'; // 'tabla' o 'calendario'
    
    // Control del Calendario
    let fechaActual = new Date();
    let mesCalendarioActual = fechaActual.getMonth();
    let anioCalendarioActual = fechaActual.getFullYear();
    let fechaCalendarioSeleccionada = null;

    // Helper para selección de elementos del DOM
    const $ = (id) => document.getElementById(id);

    // Helper para escapar HTML y prevenir XSS
    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // Formatear etiquetas de estado o texto
    function formatLabel(texto) {
        if (!texto) return '';
        const limpio = String(texto).replace(/_/g, ' ').toLowerCase();
        return limpio.charAt(0).toUpperCase() + limpio.slice(1);
    }

    // Normalizar fechas para comparaciones seguras
    function normalizarFecha(fechaStr) {
        if (!fechaStr) return null;
        if (fechaStr instanceof Date) return fechaStr;
        const d = new Date(fechaStr);
        return isNaN(d.getTime()) ? null : d;
    }

    // Debounce para optimizar búsquedas en tiempo real
    function debounce(func, wait) {
        let timeout;
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    // ==========================================
    // CARGA DE DATOS DESDE EL BACKEND
    // ==========================================
    async function cargarDatosReales(mantenerFiltros = false) {
        try {
            const [resCitas, resPacientes, resDoctores] = await Promise.all([
                fetch("/citas/api/listar", { credentials: "same-origin" }),
                fetch("/pacientes/api/listar", { credentials: "same-origin" }),
                fetch("/doctores/api/listar", { credentials: "same-origin" })
            ]);

            if (resCitas.ok) {
                const data = await resCitas.json();
                citasData = Array.isArray(data) ? data : (data.citas || data.data || []);
            }

            if (resPacientes.ok) {
                const dataP = await resPacientes.json();
                pacientesData = Array.isArray(dataP) ? dataP : (dataP.pacientes || dataP.data || []);
                actualizarSelectPacientes();
                actualizarContadorPacientes();
            }

            if (resDoctores.ok) {
                const dataD = await resDoctores.json();
                doctoresData = Array.isArray(dataD) ? dataD : (dataD.doctores || dataD.data || []);
                actualizarSelectDoctores();
            }

            aplicarFiltros();
        } catch (err) {
            console.error("Error al cargar datos del sistema:", err);
            mostrarMensaje("error", "No se pudieron sincronizar los datos con el servidor.");
        }
    }

    // Actualizar selects de pacientes en modales
    function actualizarSelectPacientes() {
        const selects = [$("selectPaciente"), $("editSelectPaciente")];
        selects.forEach(select => {
            if (!select) return;
            const valorActual = select.value;
            let html = '<option value="">Seleccione un paciente...</option>';
            pacientesData.forEach(p => {
                const id = p.ID_PACIENTE || p.id_paciente;
                const nombre = `${p.NOMBRE_PACIENTE || p.nombre || ''} ${p.APELLIDOS_PACIENTE || p.apellidos || ''}`.trim();
                html += `<option value="${escapeHtml(id)}">${escapeHtml(nombre)}</option>`;
            });
            select.innerHTML = html;
            select.value = valorActual;
        });
    }

    // Actualizar selects de doctores en modales y filtros
    function actualizarSelectDoctores() {
        const selects = [$("selectDoctor"), $("editSelectDoctor"), $("filtroDoctor")];
        selects.forEach(select => {
            if (!select) return;
            const valorActual = select.value;
            let html = select.id === "filtroDoctor" ? '<option value="">Todos los doctores</option>' : '<option value="">Seleccione un doctor...</option>';
            doctoresData.forEach(d => {
                const id = d.ID_DOCTOR || d.id_doctor;
                const nombre = `Dr. ${d.NOMBRE_DOCTOR || d.nombre || ''} ${d.APELLIDOS_DOCTOR || d.apellidos || ''}`.trim();
                html += `<option value="${escapeHtml(id)}">${escapeHtml(nombre)}</option>`;
            });
            select.innerHTML = html;
            select.value = valorActual;
        });
    }

    // Cargar especialidades asociadas a un doctor específico
    async function cargarEspecialidadesDoctor(idDoctor, esEdicion = false, especialidadPreseleccionada = null) {
        const selectId = esEdicion ? "editSelectEspecialidad" : "selectEspecialidad";
        const selectElem = $(selectId);
        if (!selectElem) return;

        if (!idDoctor) {
            selectElem.innerHTML = '<option value="">Seleccione un doctor primero...</option>';
            return;
        }

        try {
            const res = await fetch(`/doctores/api/${idDoctor}/especialidades`, { credentials: "same-origin" });
            if (!res.ok) throw new Error("Error al obtener especialidades");
            const data = await res.json();
            const especialidades = Array.isArray(data) ? data : (data.especialidades || []);

            let html = '<option value="">Seleccione una especialidad...</option>';
            especialidades.forEach(esp => {
                const idEsp = esp.ID_ESPECIALIDAD || esp.id_especialidad;
                const nombreEsp = esp.NOMBRE_ESPECIALIDAD || esp.nombre_especialidad || esp.ESPECIALIDAD || "";
                html += `<option value="${escapeHtml(idEsp)}">${escapeHtml(nombreEsp)}</option>`;
            });
            selectElem.innerHTML = html;
            if (especialidadPreseleccionada) {
                selectElem.value = especialidadPreseleccionada;
            }
        } catch (err) {
            console.error("Error cargando especialidades:", err);
            selectElem.innerHTML = '<option value="">Error al cargar especialidades</option>';
        }
    }

    // ==========================================
    // FILTRADO Y RENDERIZADO DE VISTAS
    // ==========================================
    function aplicarFiltros() {
        const estadoFiltro = $("filtroEstado")?.value || "";
        const doctorFiltro = $("filtroDoctor")?.value || "";
        const fechaDesde = $("filtroFechaDesde")?.value || "";
        const fechaHasta = $("filtroFechaHasta")?.value || "";
        const textoBusqueda = ($("filtroBusqueda")?.value || "").toLowerCase().trim();

        const citasFiltradas = citasData.filter(c => {
            const estado = String(c.ESTADO || c.estado || "").toUpperCase();
            const idDoc = String(c.ID_DOCTOR || c.id_doctor || "");
            const fechaCitaStr = c.FECHA_CITA || c.fecha_cita || c.FECHA || c.fecha || "";
            const fechaObj = normalizarFecha(fechaCitaStr);
            const fechaKey = fechaObj ? fechaObj.toISOString().split('T')[0] : "";

            // Filtro por Estado
            if (estadoFiltro && estado !== estadoFiltro.toUpperCase()) return false;

            // Filtro por Doctor
            if (doctorFiltro && idDoc !== String(doctorFiltro)) return false;

            // Filtro por Rango de Fechas
            if (fechaDesde && fechaKey < fechaDesde) return false;
            if (fechaHasta && fechaKey > fechaHasta) return false;

            // Filtro de Búsqueda de Texto (Paciente, Doctor, Motivo)
            if (textoBusqueda) {
                const pacienteNom = `${c.NOMBRE_PACIENTE || ''} ${c.APELLIDOS_PACIENTE || ''}`.toLowerCase();
                const doctorNom = `${c.NOMBRE_DOCTOR || ''}`.toLowerCase();
                const motivoCita = `${c.MOTIVO_CITA || c.motivo || ''}`.toLowerCase();
                
                if (!pacienteNom.includes(textoBusqueda) && !doctorNom.includes(textoBusqueda) && !motivoCita.includes(textoBusqueda)) {
                    return false;
                }
            }

            return true;
        });

        if (vistaCitasActual === 'tabla') {
            mostrarTablaCitas(citasFiltradas);
        } else {
            mostrarCalendario(citasFiltradas);
        }
    }

    function mostrarTablaCitas(list) {
        const target = $("tablaCitasContenido") || $("tablaCitasBody");
        if (!target) return;

        if (!list || list.length === 0) {
            target.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center py-4 text-muted">
                        <i class="fas fa-calendar-times fa-2x mb-2"></i>
                        <p>No se encontraron citas registradas con los filtros actuales.</p>
                        <button class="ct-btn-primary mt-2" id="btnCrearPrimera">Registrar Nueva Cita</button>
                    </td>
                </tr>
            `;
            const btnPrimera = $("btnCrearPrimera");
            if (btnPrimera) {
                btnPrimera.addEventListener("click", () => {
                    const modal = $("modalCrearCita");
                    if (modal) modal.style.display = "flex";
                });
            }
            return;
        }

        let html = '';
        list.forEach(c => {
            const fechaRaw = c.FECHA_CITA || c.fecha_cita || c.FECHA || c.fecha || "";
            const fechaObj = normalizarFecha(fechaRaw);
            const fecha = fechaObj ? fechaObj.toLocaleDateString() : fechaRaw;
            const hora = (c.HORA_CITA || c.hora_cita || c.HORA || c.hora || "").substring(0, 5);
            
            const nombrePaciente = c.NOMBRE_PACIENTE || c.paciente_nombre || c.PACIENTE_NOMBRE || "";
            const apellidosPaciente = c.APELLIDOS_PACIENTE || c.paciente_apellidos || c.PACIENTE_APELLIDOS || c.APELLIDOS || "";
            const pacienteCompleto = `${nombrePaciente} ${apellidosPaciente}`.trim() || "Paciente sin nombre";
            const nombreDoctor = c.NOMBRE_DOCTOR || c.doctor_nombre || c.DOCTOR_NOMBRE || c.DOCTOR || "Sin asignar";
            const especialidadTexto = c.ESPECIALIDAD_CITA || c.NOMBRE_ESPECIALIDAD_CITA || c.ESPECIALIDAD || c.NOMBRE_ESPECIALIDAD || "Medicina General";
            const estado = c.ESTADO || c.estado || "PROGRAMADA";
            const telefono = c.TELEFONO_PACIENTE || c.telefono_paciente || c.TELEFONO || c.telefono || "";
            const idCita = c.ID_CITA || c.id_cita;

            const badgeClass = `estado-${String(estado).toLowerCase().replace(/_/g, "-")}`;
            const labelEstado = formatLabel(estado);

            html += `
                <tr data-id="${escapeHtml(idCita)}">
                    <td>
                        <div class="ct-paciente-info">
                            <strong>${escapeHtml(pacienteCompleto)}</strong>
                            ${telefono ? `<br><small><i class="fas fa-phone-alt"></i> ${escapeHtml(telefono)}</small>` : ''}
                        </div>
                    </td>
                    <td>Dr. ${escapeHtml(nombreDoctor)}</td>
                    <td><span class="badge bg-light text-dark">${escapeHtml(especialidadTexto)}</span></td>
                    <td>
                        <div class="ct-fecha-info">
                            <span><i class="far fa-calendar-alt"></i> ${escapeHtml(fecha)}</span>
                            <span><i class="far fa-clock"></i> ${escapeHtml(hora)}</span>
                        </div>
                    </td>
                    <td><span class="ct-badge ${badgeClass}">${escapeHtml(labelEstado)}</span></td>
                    <td>
                        <div class="ct-acciones-grupo">
                            <button class="ctbtn-icon btn-ver-cita" title="Ver Detalles" data-id="${escapeHtml(idCita)}"><i class="fas fa-eye"></i></button>
                            <button class="ctbtn-icon btn-editar-cita" title="Editar" data-id="${escapeHtml(idCita)}"><i class="fas fa-edit"></i></button>
                            <button class="ctbtn-icon ctbtn-icon-danger btn-cancelar-cita" title="Cancelar Cita" data-id="${escapeHtml(idCita)}"><i class="fas fa-ban"></i></button>
                            <button class="ctbtn-icon ctbtn-icon-success btn-consulta-express" title="Consulta Médica Express" data-id="${escapeHtml(idCita)}"><i class="fas fa-stethoscope"></i></button>
                        </div>
                    </td>
                </tr>
            `;
        });

        target.innerHTML = html;

        // Registrar manejadores para los botones generados dinámicamente
        target.querySelectorAll(".btn-ver-cita").forEach(btn => {
            btn.addEventListener("click", () => verDetalleCita(btn.dataset.id));
        });
        target.querySelectorAll(".btn-editar-cita").forEach(btn => {
            btn.addEventListener("click", () => abrirModalEditarCita(btn.dataset.id));
        });
        target.querySelectorAll(".btn-cancelar-cita").forEach(btn => {
            btn.addEventListener("click", () => cambiarEstadoCita(btn.dataset.id, "CANCELADA"));
        });
        target.querySelectorAll(".btn-consulta-express").forEach(btn => {
            btn.addEventListener("click", () => abrirConsultaMedicaExpress(btn.dataset.id, btn));
        });
    }

    function mostrarCalendario(list) {
        const target = $("calendarioContenido");
        if (!target) return;

        const primerDiaMes = new Date(anioCalendarioActual, mesCalendarioActual, 1);
        const ultimoDiaMes = new Date(anioCalendarioActual, mesCalendarioActual + 1, 0);
        
        const anioActualLbl = $("calendarioMesAnioLabel");
        const nombresMeses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
        if (anioActualLbl) {
            anioActualLbl.textContent = `${nombresMeses[mesCalendarioActual]} ${anioCalendarioActual}`;
        }

        let html = `
            <div class="calendario-grid">
                <div class="cal-header-dia">Lun</div>
                <div class="cal-header-dia">Mar</div>
                <div class="cal-header-dia">Mié</div>
                <div class="cal-header-dia">Jue</div>
                <div class="cal-header-dia">Vie</div>
                <div class="cal-header-dia">Sáb</div>
                <div class="cal-header-dia">Dom</div>
        `;

        let diaSemanaInicio = primerDiaMes.getDay();
        diaSemanaInicio = diaSemanaInicio === 0 ? 6 : diaSemanaInicio - 1;

        const ultimoDiaMesAnterior = new Date(anioCalendarioActual, mesCalendarioActual, 0).getDate();
        for (let i = diaSemanaInicio - 1; i >= 0; i--) {
            const diaNum = ultimoDiaMesAnterior - i;
            html += `<div class="cal-dia otro-mes"><span class="cal-num">${diaNum}</span></div>`;
        }

        const citasPorFecha = {};
        (list || []).forEach(c => {
            const fechaStr = c.FECHA_CITA || c.fecha_cita || c.FECHA || c.fecha;
            const fechaObj = normalizarFecha(fechaStr);
            if (!fechaObj) return;
            const key = fechaObj.toISOString().split('T')[0];
            if (!citasPorFecha[key]) citasPorFecha[key] = [];
            citasPorFecha[key].push(c);
        });

        const hoyStr = new Date().toISOString().split('T')[0];
        for (let dia = 1; dia <= ultimoDiaMes.getDate(); dia++) {
            const fechaIter = new Date(anioCalendarioActual, mesCalendarioActual, dia);
            const key = fechaIter.toISOString().split('T')[0];
            const citasDia = citasPorFecha[key] || [];
            const esHoy = key === hoyStr;

            html += `
                <div class="cal-dia ${esHoy ? 'hoy' : ''}" data-fecha="${key}">
                    <span class="cal-num">${dia}</span>
                    <div class="cal-citas-lista">
            `;

            citasDia.slice(0, 3).forEach(c => {
                const hora = c.HORA_CITA || c.hora_cita || c.HORA || c.hora || "";
                const nombre = c.NOMBRE_PACIENTE || c.paciente_nombre || c.PACIENTE_NOMBRE || "";
                const estado = c.ESTADO || "PROGRAMADA";
                html += `<div class="cal-cita-chip estado-${escapeHtml(estado.toLowerCase())}" title="${escapeHtml(nombre)} - ${escapeHtml(hora)}" data-id="${escapeHtml(c.ID_CITA || c.id_cita)}">${escapeHtml(hora.substring(0, 5))} ${escapeHtml(nombre)}</div>`;
            });

            if (citasDia.length > 3) {
                html += `<div class="cal-mas-citas">+${citasDia.length - 3} más</div>`;
            }

            html += `
                    </div>
                </div>
            `;
        }

        html += `</div>`;
        target.innerHTML = html;

        target.querySelectorAll(".cal-cita-chip").forEach(chip => {
            chip.addEventListener("click", (e) => {
                e.stopPropagation();
                verDetalleCita(chip.dataset.id);
            });
        });

        target.querySelectorAll(".cal-dia[data-fecha]").forEach(diaElem => {
            diaElem.addEventListener("click", () => {
                const fechaSel = diaElem.dataset.fecha;
                fechaCalendarioSeleccionada = fechaSel;
                const inputFecha = $("inputFecha");
                if (inputFecha) {
                    inputFecha.value = fechaSel;
                    actualizarModoRegistroPasado();
                    const modal = $("modalCrearCita");
                    if (modal) modal.style.display = "flex";
                }
            });
        });
    }

    function actualizarContadorPacientes() {
        const cont = $("totalPacientesCount");
        if (cont) {
            cont.textContent = pacientesData.length;
        }
    }

    function mostrarMensaje(tipo, texto) {
        console.log(`[${tipo.toUpperCase()}] ${texto}`);
        if (typeof window.showNotification === 'function') {
            window.showNotification(texto, tipo);
        } else {
            alert(texto);
        }
    }

    // ==========================================
    // GESTIÓN DE ACCIONES Y MODALES
    // ==========================================
    async function verDetalleCita(idCita) {
        const cita = citasData.find(c => String(c.ID_CITA || c.id_cita) === String(idCita));
        if (!cita) {
            mostrarMensaje("error", "No se encontró la información de la cita");
            return;
        }
        
        const modal = $("modalDetalleCita");
        const body = $("detalleCitaContenido");
        if (!modal || !body) return;

        const nombrePaciente = `${cita.NOMBRE_PACIENTE || cita.paciente_nombre || ''} ${cita.APELLIDOS_PACIENTE || cita.paciente_apellidos || ''}`.trim();
        const nombreDoctor = cita.NOMBRE_DOCTOR || cita.doctor_nombre || "Sin asignar";
        const especialidad = cita.ESPECIALIDAD_CITA || cita.NOMBRE_ESPECIALIDAD_CITA || "No especificada";
        const fecha = cita.FECHA_CITA || cita.fecha_cita || "";
        const hora = cita.HORA_CITA || cita.hora_cita || "";
        const estado = cita.ESTADO || "PROGRAMADA";
        const motivo = cita.MOTIVO_CITA || cita.motivo_cita || cita.MOTIVO || "Sin motivo especificado";
        const observaciones = cita.OBSERVACIONES || cita.observaciones || "Ninguna";

        body.innerHTML = `
            <div class="detalle-grupo"><strong>Paciente:</strong> ${escapeHtml(nombrePaciente)}</div>
            <div class="detalle-grupo"><strong>Doctor:</strong> Dr. ${escapeHtml(nombreDoctor)}</div>
            <div class="detalle-grupo"><strong>Especialidad:</strong> ${escapeHtml(especialidad)}</div>
            <div class="detalle-grupo"><strong>Fecha y Hora:</strong> ${escapeHtml(fecha)} a las ${escapeHtml(hora)}</div>
            <div class="detalle-grupo"><strong>Estado:</strong> <span class="ct-badge estado-${escapeHtml(estado.toLowerCase())}">${escapeHtml(formatLabel(estado))}</span></div>
            <div class="detalle-grupo"><strong>Motivo:</strong> ${escapeHtml(motivo)}</div>
            <div class="detalle-grupo"><strong>Observaciones:</strong> ${escapeHtml(observaciones)}</div>
        `;

        modal.style.display = "flex";
    }

    async function abrirModalEditarCita(idCita) {
        const cita = citasData.find(c => String(c.ID_CITA || c.id_cita) === String(idCita));
        if (!cita) {
            mostrarMensaje("error", "No se encontró la cita a editar");
            return;
        }

        const modal = $("modalEditarCita");
        if (!modal) return;

        $("editIdCita").value = cita.ID_CITA || cita.id_cita;
        $("editSelectPaciente").value = cita.ID_PACIENTE || cita.id_paciente || "";
        $("editSelectDoctor").value = cita.ID_DOCTOR || cita.id_doctor || "";
        
        const fechaCita = cita.FECHA_CITA || cita.fecha_cita || "";
        $("editInputFecha").value = fechaCita ? fechaCita.split('T')[0] : "";
        $("editInputHora").value = cita.HORA_CITA || cita.hora_cita || "";
        $("editSelectDuracion").value = cita.DURACION_MINUTOS || cita.duracion_minutos || 30;
        $("editSelectTipoCita").value = cita.TIPO_CITA || cita.tipo_cita || "";
        $("editSelectPrioridad").value = cita.PRIORIDAD || "NORMAL";
        $("editSelectCanal").value = cita.CANAL_ATENCION || cita.canal_atencion || "PRESENCIAL";
        $("editInputMotivo").value = cita.MOTIVO_CITA || cita.motivo_cita || "";
        $("editInputObservaciones").value = cita.OBSERVACIONES || cita.observaciones || "";

        const idDoctor = cita.ID_DOCTOR || cita.id_doctor;
        const idEspecialidad = cita.ID_ESPECIALIDAD || cita.id_especialidad;
        await cargarEspecialidadesDoctor(idDoctor, true, idEspecialidad);

        actualizarModoEdicionPasada();
        modal.style.display = "flex";
    }

    async function cambiarEstadoCita(idCita, nuevoEstado) {
        if (!window.confirm(`¿Está seguro de cambiar el estado de la cita a ${formatLabel(nuevoEstado)}?`)) return;

        try {
            const res = await fetch("/citas/cambiar-estado", {
                method: "POST",
                headers: { "Content-Type": "application/json", Accept: "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({ idCita: Number(idCita), nuevoEstado })
            });

            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json.message || "Error al actualizar estado");

            mostrarMensaje("success", "Estado de cita actualizado exitosamente");
            cargarDatosReales(true);
        } catch (err) {
            console.error("Error cambiando estado:", err);
            mostrarMensaje("error", err.message);
        }
    }

    function abrirConsultaMedicaExpress(idCita, btnElem) {
        const cita = citasData.find(c => String(c.ID_CITA || c.id_cita) === String(idCita));
        if (!cita) {
            mostrarMensaje("error", "No se encontró la información para la consulta express");
            return;
        }
        const idPaciente = cita.ID_PACIENTE || cita.id_paciente;
        if (idPaciente) {
            window.location.href = `/consultas/nueva?idPaciente=${idPaciente}&idCita=${idCita}`;
        } else {
            mostrarMensaje("error", "La cita no tiene un paciente válido asociado.");
        }
    }

    function actualizarModoRegistroPasado() {
        // Control opcional para manejar fechas anteriores al día actual
    }

    function actualizarModoEdicionPasada() {
        // Control opcional para manejar modo de edición
    }

    // ==========================================
    // INICIALIZACIÓN DE EVENTOS PRINCIPALES
    // ==========================================
    document.addEventListener("DOMContentLoaded", () => {
        cargarDatosReales();

        // Cambios de vista Tabla / Calendario
        $("btnVistaTabla")?.addEventListener("click", () => {
            vistaCitasActual = "tabla";
            $("vistaTablaContainer").style.display = "block";
            $("vistaCalendarioContainer").style.display = "none";
            aplicarFiltros();
        });

        $("btnVistaCalendario")?.addEventListener("click", () => {
            vistaCitasActual = "calendario";
            $("vistaTablaContainer").style.display = "none";
            $("vistaCalendarioContainer").style.display = "block";
            aplicarFiltros();
        });

        // Navegación de mes en calendario
        $("btnMesAnterior")?.addEventListener("click", () => {
            mesCalendarioActual--;
            if (mesCalendarioActual < 0) {
                mesCalendarioActual = 11;
                anioCalendarioActual--;
            }
            aplicarFiltros();
        });

        $("btnMesSiguiente")?.addEventListener("click", () => {
            mesCalendarioActual++;
            if (mesCalendarioActual > 11) {
                mesCalendarioActual = 0;
                anioCalendarioActual++;
            }
            aplicarFiltros();
        });

        // Filtros en tiempo real
        ["filtroEstado", "filtroDoctor", "filtroFechaDesde", "filtroFechaHasta"].forEach(id => {
            $(id)?.addEventListener("change", aplicarFiltros);
        });

        $("filtroBusqueda")?.addEventListener("input", debounce(aplicarFiltros, 300));

        // Manejadores para cerrar modales
        document.querySelectorAll(".ct-modal-cerrar, .btn-cerrar-modal").forEach(el => {
            el.addEventListener("click", () => {
                document.querySelectorAll(".ct-modal").forEach(m => m.style.display = "none");
            });
        });

        // Cambio de doctor en formulario de creación para cargar especialidades
        $("selectDoctor")?.addEventListener("change", (e) => {
            cargarEspecialidadesDoctor(e.target.value, false);
        });

        $("editSelectDoctor")?.addEventListener("change", (e) => {
            cargarEspecialidadesDoctor(e.target.value, true);
        });

        ["inputFecha", "inputHora"].forEach(id => {
            $(id)?.addEventListener("change", actualizarModoRegistroPasado);
        });

        ["editInputFecha", "editInputHora"].forEach(id => {
            $(id)?.addEventListener("change", actualizarModoEdicionPasada);
        });
    });
})();