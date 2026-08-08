document.addEventListener('DOMContentLoaded', async () => {
  const logoBtn = document.getElementById('logoBtn');
  const selectorPaciente = document.getElementById('selectorPaciente');
  const buscadorPaciente = document.getElementById('buscadorPaciente');
  const listaPacientes = document.getElementById('listaPacientes');
  const btnExportarPDF = document.getElementById('btnExportarPDF');
  const btnImprimir = document.getElementById('btnImprimir');
  const btnEditarHistorial = document.getElementById('btnEditarHistorial');
  const btnExportarExcel = document.getElementById('btnExportarExcel');
  const formEditarHistorial = document.getElementById('formEditarHistorial');
  const historialContainer = document.getElementById('historialContainer');

  let pacienteActualId = null;
  let listaCompletaPacientes = [];
  let indiceActivoLOV = -1;

  // ============================================================
  // FUNCIÓN ESCAPE HTML (seguridad)
  // ============================================================
  function escapeHtml(s) {
    if (s === undefined || s === null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // --- BOTÓN LOGO ---
  if (logoBtn) {
    logoBtn.addEventListener('click', () => window.location.href = '/dashboard');
  }

  // --- FORMULARIO EDITAR HISTORIAL ---
  if (formEditarHistorial) {
    formEditarHistorial.addEventListener('submit', async (e) => {
      e.preventDefault();
      await guardarHistorial();
    });
  }

  // --- CARGAR LISTA DE PACIENTES ---
  if (selectorPaciente) {
    await cargarPacientes();

    const params = new URLSearchParams(window.location.search);
    const pacienteId = params.get('pacienteId');
    if (pacienteId) {
      const encontrado = listaCompletaPacientes.find(p => String(p.ID_PACIENTE) === String(pacienteId));
      seleccionarPaciente(pacienteId, encontrado ? `${encontrado.NOMBRES} ${encontrado.APELLIDOS}` : '');
      await cargarHistorialConsolidado(pacienteId);
      pacienteActualId = pacienteId;
      habilitarBotones(true);
    }
  }

  // ============================================================
  // LISTA DE VALORES - Búsqueda avanzada en tiempo real
  // ============================================================
  if (buscadorPaciente) {
    buscadorPaciente.addEventListener('input', () => {
      const texto = buscadorPaciente.value.trim().toLowerCase();
      indiceActivoLOV = -1;

      if (texto === '') {
        limpiarSeleccionPaciente();
        renderizarListaLOV(listaCompletaPacientes.slice(0, 20));
        return;
      }

      const filtrados = listaCompletaPacientes.filter(p => coincidePaciente(p, texto));
      renderizarListaLOV(filtrados);
    });

    buscadorPaciente.addEventListener('focus', () => {
      const texto = buscadorPaciente.value.trim().toLowerCase();
      const base = texto === ''
        ? listaCompletaPacientes.slice(0, 20)
        : listaCompletaPacientes.filter(p => coincidePaciente(p, texto));
      renderizarListaLOV(base);
    });

    // Navegación con teclado
    buscadorPaciente.addEventListener('keydown', (e) => {
      const items = listaPacientes.querySelectorAll('.lov-paciente-item');
      if (!items.length) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        indiceActivoLOV = Math.min(indiceActivoLOV + 1, items.length - 1);
        marcarActivoLOV(items);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        indiceActivoLOV = Math.max(indiceActivoLOV - 1, 0);
        marcarActivoLOV(items);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (indiceActivoLOV >= 0 && items[indiceActivoLOV]) {
          items[indiceActivoLOV].click();
        }
      } else if (e.key === 'Escape') {
        listaPacientes.classList.remove('mostrar');
      }
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.lov-paciente-wrapper')) {
        listaPacientes.classList.remove('mostrar');
      }
    });
  }

  // Búsqueda avanzada: nombre, ID, teléfono, correo, documento
  function coincidePaciente(p, texto) {
    const nombreCompleto = `${p.NOMBRES} ${p.APELLIDOS}`.toLowerCase();
    const telefono = (p.TELEFONO || '').toLowerCase();
    const correo = (p.CORREO_ELECTRONICO || '').toLowerCase();
    const documento = (p.NUMERO_DOCUMENTO_IDENTIDAD || '').toLowerCase();
    return nombreCompleto.includes(texto)
      || String(p.ID_PACIENTE).includes(texto)
      || telefono.includes(texto)
      || correo.includes(texto)
      || documento.includes(texto);
  }

  function renderizarListaLOV(pacientesFiltrados) {
    if (!listaPacientes) return;

    if (pacientesFiltrados.length === 0) {
      listaPacientes.innerHTML = `<div class="lov-paciente-sin-resultados">No se encontraron pacientes</div>`;
      listaPacientes.classList.add('mostrar');
      return;
    }

    listaPacientes.innerHTML = pacientesFiltrados.map(p => `
      <div class="lov-paciente-item" data-id="${p.ID_PACIENTE}" data-nombre="${p.NOMBRES} ${p.APELLIDOS}">
        👤 ${p.NOMBRES} ${p.APELLIDOS}
        <small>ID: ${p.ID_PACIENTE} ${p.TELEFONO ? '· 📞 ' + p.TELEFONO : ''} ${p.CORREO_ELECTRONICO ? '· ✉️ ' + p.CORREO_ELECTRONICO : ''} ${p.NUMERO_DOCUMENTO_IDENTIDAD ? '· 🪪 ' + p.NUMERO_DOCUMENTO_IDENTIDAD : ''}</small>
      </div>
    `).join('');

    listaPacientes.querySelectorAll('.lov-paciente-item').forEach(item => {
      item.addEventListener('click', async () => {
        const id = item.dataset.id;
        const nombre = item.dataset.nombre;
        seleccionarPaciente(id, nombre);
        listaPacientes.classList.remove('mostrar');

        pacienteActualId = id;
        await cargarHistorialConsolidado(id);
        habilitarBotones(true);
      });
    });

    listaPacientes.classList.add('mostrar');
  }

  function marcarActivoLOV(items) {
    items.forEach(i => i.classList.remove('activo'));
    if (items[indiceActivoLOV]) {
      items[indiceActivoLOV].classList.add('activo');
      items[indiceActivoLOV].scrollIntoView({ block: 'nearest' });
    }
  }

  function seleccionarPaciente(id, nombre) {
    selectorPaciente.value = id;
    if (buscadorPaciente) buscadorPaciente.value = nombre || '';
    selectorPaciente.dispatchEvent(new Event('change'));
  }

  function limpiarSeleccionPaciente() {
    selectorPaciente.value = '';
    pacienteActualId = null;
    selectorPaciente.dispatchEvent(new Event('change'));
    historialContainer.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-file-medical"></i>
        <h4>Historial Médico</h4>
        <p class="mb-4">Seleccione un paciente para visualizar su historial médico completo</p>
      </div>
    `;
    habilitarBotones(false);
  }

  // ============================================================
  // FUNCIÓN: Habilitar/deshabilitar botones (INCLUYE EXCEL)
  // ============================================================
  function habilitarBotones(habilitado) {
    if (btnEditarHistorial) btnEditarHistorial.disabled = !habilitado;
    if (btnExportarPDF) btnExportarPDF.disabled = !habilitado;
    if (btnImprimir) btnImprimir.disabled = !habilitado;
    if (btnExportarExcel) btnExportarExcel.disabled = !habilitado;
  }

  // ============================================================
  // FUNCIÓN: Cargar pacientes
  // ============================================================
  async function cargarPacientes() {
    try {
      if (buscadorPaciente) buscadorPaciente.placeholder = 'Cargando pacientes...';

      const res = await fetch('/historial/pacientes');
      if (!res.ok) throw new Error('No se pudieron cargar los pacientes');

      listaCompletaPacientes = await res.json();

      if (buscadorPaciente) buscadorPaciente.placeholder = '🔍 Buscar por nombre, ID, teléfono, correo o documento...';
      actualizarContadorPacientes();

    } catch (err) {
      console.error('Error cargando pacientes:', err);
      mostrarNotificacion(err.message, 'danger');
    }
  }

  function actualizarContadorPacientes() {
    const contador = document.getElementById('totalPacientesCount');
    if (contador) {
      contador.textContent = `${listaCompletaPacientes.length} pacientes registrados`;
    }
  }

  // ============================================================
  // FUNCIÓN: Cargar historial consolidado
  // ============================================================
  async function cargarHistorialConsolidado(pacienteId) {
    try {
      mostrarLoading(historialContainer, 'Cargando historial médico...');

      const res = await fetch(`/historial/consolidado/${pacienteId}`);
      if (!res.ok) throw new Error('Error al cargar historial consolidado');

      const data = await res.json();

      if (!data.success || !data.paciente) {
        historialContainer.innerHTML = `<p class="text-danger">Paciente no encontrado.</p>`;
        return;
      }

      const paciente = data.paciente;
      const historial = data.historial;
      const consultas = data.consultas || [];
      const preclinicas = data.preclinicas || [];
      const citas = data.citas || [];
      const medicamentos = data.medicamentos || [];

      let edad = 'N/A';
      if (paciente.FECHA_NACIMIENTO) {
        const nacimiento = new Date(paciente.FECHA_NACIMIENTO);
        const hoy = new Date();
        edad = hoy.getFullYear() - nacimiento.getFullYear();
        const mes = hoy.getMonth() - nacimiento.getMonth();
        if (mes < 0 || (mes === 0 && hoy.getDate() < nacimiento.getDate())) edad--;
        edad = `${edad} años`;
      }

      let html = `
        <div class="paciente-header animate__animated animate__fadeIn">
          <div class="d-flex justify-content-between align-items-center flex-wrap">
            <div>
              <h4 class="mb-1"><i class="fas fa-user-circle me-2"></i>${paciente.NOMBRES} ${paciente.APELLIDOS}</h4>
              <div class="d-flex flex-wrap gap-3">
                <span><i class="fas fa-id-card me-1"></i>ID: ${paciente.ID_PACIENTE}</span>
                <span><i class="fas fa-calendar-alt me-1"></i>${edad}</span>
                <span><i class="fas fa-venus-mars me-1"></i>${paciente.GENERO || 'N/A'}</span>
                <span><i class="fas fa-phone me-1"></i>${paciente.TELEFONO || 'N/A'}</span>
                <span><i class="fas fa-envelope me-1"></i>${paciente.CORREO_ELECTRONICO || 'N/A'}</span>
                <span class="badge ${paciente.ESTADO === 'ACTIVO' ? 'bg-success' : 'bg-danger'}">${paciente.ESTADO || 'N/A'}</span>
              </div>
              <div class="d-flex flex-wrap gap-3 mt-2">
                <span><i class="fas fa-birthday-cake me-1"></i>Nacimiento: ${paciente.FECHA_NACIMIENTO ? new Date(paciente.FECHA_NACIMIENTO).toLocaleDateString() : 'N/A'}</span>
                <span><i class="fas fa-map-marker-alt me-1"></i>Dirección: ${paciente.DIRECCION || 'N/A'}</span>
                <span><i class="fas fa-file-invoice me-1"></i>RTN: ${paciente.RTN_PACIENTE || 'N/A'}</span>
                <span><i class="fas fa-briefcase me-1"></i>Ocupación: ${paciente.OCUPACION || 'N/A'}</span>
                <span><i class="fas fa-ring me-1"></i>Estado Civil: ${paciente.ESTADO_CIVIL || 'N/A'}</span>
                <span><i class="fas fa-calendar-plus me-1"></i>Registrado el: ${paciente.FECHA_REGISTRO ? new Date(paciente.FECHA_REGISTRO).toLocaleDateString() : 'N/A'}</span>
              </div>
            </div>
            <div class="mt-2 mt-md-0">
              <span class="badge bg-info me-1"><i class="fas fa-notes-medical me-1"></i>${data.totales?.consultas || 0} Consultas</span>
              <span class="badge bg-primary"><i class="fas fa-calendar-check me-1"></i>${data.totales?.citas || 0} Citas</span>
            </div>
          </div>
        </div>
      `;

      html += `
        <div class="stats-grid mb-4">
          <div class="stat-card">
            <div class="stat-number">${data.totales?.consultas || 0}</div>
            <div class="stat-label">Total Consultas</div>
          </div>
          <div class="stat-card">
            <div class="stat-number">${data.totales?.citas || 0}</div>
            <div class="stat-label">Total Citas</div>
          </div>
          <div class="stat-card">
            <div class="stat-number">${medicamentos.length}</div>
            <div class="stat-label">Medicamentos Prescritos</div>
          </div>
          <div class="stat-card">
            <div class="stat-number">${preclinicas.length}</div>
            <div class="stat-label">Registros Preclínicos</div>
          </div>
        </div>
      `;

      html += `<h6 class="mt-3 mb-2"><i class="fas fa-file-medical-alt text-primary"></i> Historial Clínico</h6>`;
      html += `<div class="row">`;

      const fields = [
        { key: 'ALERGIAS', icon: 'fa-allergies', color: 'warning', label: 'Alergias' },
        { key: 'ENFERMEDADES_CRONICAS', icon: 'fa-heartbeat', color: 'danger', label: 'Enfermedades Crónicas' },
        { key: 'CIRUGIAS_PREVIAS', icon: 'fa-procedures', color: 'info', label: 'Cirugías Previas' },
        { key: 'MEDICAMENTOS_ACTUALES', icon: 'fa-pills', color: 'success', label: 'Medicamentos Actuales' },
        { key: 'VACUNAS', icon: 'fa-syringe', color: 'primary', label: 'Vacunas' },
        { key: 'ANTECEDENTES_FAMILIARES', icon: 'fa-history', color: 'secondary', label: 'Antecedentes Familiares' },
        { key: 'HABITOS', icon: 'fa-dumbbell', color: 'dark', label: 'Hábitos' }
      ];

      fields.forEach(field => {
        let valor = 'No registrado';
        if (historial && historial[field.key]) {
          const parsed = parseJSONField(historial[field.key]);
          valor = parsed.length > 0 ? parsed.join(', ') : 'No registrado';
        }

        html += `
          <div class="col-md-6 col-lg-4 mb-3">
            <div class="card card-historial h-100">
              <div class="card-header bg-${field.color} bg-opacity-25">
                <h6 class="mb-0"><i class="fas ${field.icon} me-2"></i>${field.label}</h6>
              </div>
              <div class="card-body">
                <p class="card-text">${valor}</p>
              </div>
            </div>
          </div>
        `;
      });

      html += `</div>`;

      if (historial && historial.NOTAS_IMPORTANTES) {
        html += `
          <div class="card card-historial mb-3">
            <div class="card-header bg-warning bg-opacity-25">
              <h6 class="mb-0"><i class="fas fa-sticky-note me-2"></i>Notas Importantes</h6>
            </div>
            <div class="card-body">
              <p class="card-text">${historial.NOTAS_IMPORTANTES}</p>
            </div>
          </div>
        `;
      }

      if (consultas.length > 0) {
        html += `
          <h6 class="mt-4 mb-2"><i class="fas fa-notes-medical text-success"></i> Últimas Consultas Médicas</h6>
          <div class="table-responsive">
            <table class="table table-striped table-hover table-sm">
              <thead class="table-light">
                <tr>
                  <th>Fecha</th>
                  <th>Doctor</th>
                  <th>Diagnóstico</th>
                  <th>Tratamiento</th>
                  <th>Tipo</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
        `;

        consultas.forEach((consulta, idxCon) => {
          //  NUEVO: medicamentos recetados en ESTA consulta específica
          const medsDeConsulta = (medicamentos || []).filter(m => String(m.ID_CONSULTA) === String(consulta.ID_CONSULTA));

          html += `
            <tr>
              <td>${new Date(consulta.FECHA_CONSULTA).toLocaleDateString()}</td>
              <td>${consulta.DOCTOR || 'N/A'}</td>
              <td><strong>${consulta.DIAGNOSTICO_PRINCIPAL || 'N/A'}</strong></td>
              <td>${consulta.TRATAMIENTO || 'N/A'}</td>
              <td><span class="badge bg-info">${consulta.TIPO_CONSULTA || 'GENERAL'}</span></td>
              <td>
                <button type="button" class="btn btn-sm btn-outline-secondary btn-ver-consulta" data-index="${idxCon}" title="Ver todos los datos de la consulta"><i class="fas fa-eye"></i></button>
              </td>
            </tr>
          `;

          // ✅ NUEVO: fila expandible con TODOS los datos de la consulta médica
          const sintomas = parseJSONField(consulta.SINTOMAS);
          const examenFisico = parseJSONField(consulta.EXAMEN_FISICO);

          html += `
            <tr class="fila-detalle-consulta" id="detalleConsulta${idxCon}" style="display:none;">
              <td colspan="6" style="background:#f7f9fb; border-left: 3px solid #28a745;">
                <div style="padding:6px 4px;">
                  <p class="mb-2"><strong><i class="fas fa-comment-medical text-secondary"></i> Motivo:</strong> ${consulta.MOTIVO_CONSULTA ? escapeHtml(consulta.MOTIVO_CONSULTA) : 'N/A'}</p>
                  <p class="mb-2"><strong><i class="fas fa-thermometer-half text-secondary"></i> Síntomas:</strong> ${sintomas.length > 0 ? escapeHtml(sintomas.join(', ')) : 'N/A'}</p>
                  <p class="mb-2"><strong><i class="fas fa-stethoscope text-secondary"></i> Examen Físico:</strong> ${examenFisico.length > 0 ? escapeHtml(examenFisico.join(', ')) : 'N/A'}</p>
                  <p class="mb-2"><strong><i class="fas fa-user-md text-secondary"></i> Diagnóstico Principal:</strong> ${consulta.DIAGNOSTICO_PRINCIPAL ? escapeHtml(consulta.DIAGNOSTICO_PRINCIPAL) : 'N/A'}</p>
                  <p class="mb-2"><strong><i class="fas fa-pills text-secondary"></i> Tratamiento:</strong> ${consulta.TRATAMIENTO ? escapeHtml(consulta.TRATAMIENTO) : 'N/A'}</p>
                  <p class="mb-2"><strong><i class="fas fa-clipboard-list text-secondary"></i> Recomendaciones:</strong> ${consulta.RECOMENDACIONES ? escapeHtml(consulta.RECOMENDACIONES) : 'N/A'}</p>
                  ${consulta.OBSERVACIONES && consulta.OBSERVACIONES.trim() !== '' ? `
                  <p class="mb-2"><strong style="color:#17a2b8;"><i class="fas fa-flask"></i> Exámenes Complementarios:</strong> <span style="white-space:pre-line;">${escapeHtml(consulta.OBSERVACIONES)}</span></p>
                  ` : ''}
                  <p class="mb-0">
                    <strong><i class="fas fa-capsules text-secondary"></i> Medicamentos Prescritos:</strong>
                    ${medsDeConsulta.length > 0
                      ? '<ul class="mb-0 mt-1">' + medsDeConsulta.map(m => `<li>${escapeHtml(m.NOMBRE_MEDICAMENTO || 'N/A')} — ${escapeHtml(m.DOSIS || 'N/A')}, ${escapeHtml(m.FRECUENCIA || 'N/A')}, ${escapeHtml(m.DURACION || 'N/A')}</li>`).join('') + '</ul>'
                      : ' N/A'}
                  </p>
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
      }

      if (preclinicas.length > 0) {
        html += `
          <h6 class="mt-4 mb-2"><i class="fas fa-heartbeat text-danger"></i> Últimos Registros Preclínicos</h6>
          <div class="table-responsive">
            <table class="table table-striped table-hover table-sm">
              <thead class="table-light">
                <tr>
                  <th>Fecha</th>
                  <th>Enfermera</th>
                  <th>T°</th>
                  <th>Presión</th>
                  <th>FC</th>
                  <th>FR</th>
                  <th>Sat. O2</th>
                  <th>Peso</th>
                  <th>Talla</th>
                  <th>IMC</th>
                  <th>Glucosa</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
        `;

        preclinicas.forEach((pre, idxPre) => {
          html += `
            <tr>
              <td>${new Date(pre.FECHA_REGISTRO).toLocaleDateString()}</td>
              <td>${pre.ENFERMERA || 'N/A'}</td>
              <td>${pre.TEMPERATURA || 'N/A'}°C</td>
              <td>${pre.PRESION_SISTOLICA || 'N/A'}/${pre.PRESION_DIASTOLICA || 'N/A'}</td>
              <td>${pre.FRECUENCIA_CARDIACA || 'N/A'}</td>
              <td>${pre.FRECUENCIA_RESPIRATORIA || 'N/A'}</td>
              <td>${pre.SATURACION_OXIGENO || 'N/A'}%</td>
              <td>${pre.PESO || 'N/A'} kg</td>
              <td>${pre.TALLA || 'N/A'} cm</td>
              <td>${pre.IMC || 'N/A'}</td>
              <td>${pre.GLUCOSA || 'N/A'}</td>
              <td>
                <span class="badge ${pre.ESTADO_GENERAL === 'BUENO' ? 'bg-success' : pre.ESTADO_GENERAL === 'REGULAR' ? 'bg-warning' : 'bg-danger'}">
                  ${pre.ESTADO_GENERAL || 'N/A'}
                </span>
              </td>
              <td>
                ${pre.OBSERVACIONES ? `<button type="button" class="btn btn-sm btn-outline-secondary btn-ver-preclinica" data-index="${idxPre}" title="Ver observaciones completas"><i class="fas fa-eye"></i></button>` : ''}
              </td>
            </tr>
          `;
          if (pre.OBSERVACIONES) {
            html += `
            <tr class="fila-observaciones-preclinica" id="obsPreclinica${idxPre}" style="display:none;">
              <td colspan="13" style="background:#f7f9fb;">
                <i class="fas fa-notes-medical text-primary me-1"></i>
                <strong>Observaciones:</strong> <span style="white-space:pre-line;">${escapeHtml(pre.OBSERVACIONES)}</span>
              </td>
            </tr>
          `;
          }
        });

        html += `
              </tbody>
            </table>
          </div>
        `;
      }

      if (medicamentos.length > 0) {
        html += `
          <h6 class="mt-4 mb-2"><i class="fas fa-prescription-bottle text-success"></i> Medicamentos Prescritos</h6>
          <div class="table-responsive">
            <table class="table table-striped table-hover table-sm">
              <thead class="table-light">
                <tr>
                  <th>Fecha</th>
                  <th>Medicamento</th>
                  <th>Dosis</th>
                  <th>Frecuencia</th>
                  <th>Duración</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
        `;

        medicamentos.forEach(med => {
          html += `
            <tr>
              <td>${new Date(med.FECHA_PRESCRIPCION).toLocaleDateString()}</td>
              <td><strong>${med.NOMBRE_MEDICAMENTO || 'N/A'}</strong></td>
              <td>${med.DOSIS || 'N/A'}</td>
              <td>${med.FRECUENCIA || 'N/A'}</td>
              <td>${med.DURACION || 'N/A'}</td>
              <td>
                <span class="badge ${med.ESTADO === 'ACTIVA' ? 'bg-success' : 'bg-secondary'}">
                  ${med.ESTADO || 'N/A'}
                </span>
              </td>
            </tr>
          `;
        });

        html += `
              </tbody>
            </table>
          </div>
        `;
      }

      if (citas.length > 0) {
        const estadoColors = {
          'PROGRAMADA': 'bg-primary',
          'CONFIRMADA': 'bg-info',
          'PRECLINICA': 'bg-warning',
          'CONSULTA_MEDICA': 'bg-success',
          'FINALIZADA': 'bg-secondary',
          'CANCELADA': 'bg-danger',
          'NO_ASISTIO': 'bg-dark'
        };

        html += `
          <h6 class="mt-4 mb-2"><i class="fas fa-calendar-check text-primary"></i> Últimas Citas</h6>
          <div class="table-responsive">
            <table class="table table-striped table-hover table-sm">
              <thead class="table-light">
                <tr>
                  <th>Fecha</th>
                  <th>Doctor</th>
                  <th>Motivo</th>
                  <th>Prioridad</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
        `;

        citas.forEach(cita => {
          html += `
            <tr>
              <td>${new Date(cita.FECHA_CITA).toLocaleDateString()}</td>
              <td>${cita.DOCTOR || 'N/A'}</td>
              <td>${cita.MOTIVO_CONSULTA || 'N/A'}</td>
              <td>
                <span class="badge ${cita.PRIORIDAD === 'ALTA' ? 'bg-danger' : cita.PRIORIDAD === 'URGENTE' ? 'bg-warning' : 'bg-primary'}">
                  ${cita.PRIORIDAD || 'NORMAL'}
                </span>
              </td>
              <td>
                <span class="badge ${estadoColors[cita.ESTADO] || 'bg-secondary'}">
                  ${cita.ESTADO || 'N/A'}
                </span>
              </td>
            </tr>
          `;
        });

        html += `
              </tbody>
            </table>
          </div>
        `;
      }

      if (historial && historial.FECHA_ACTUALIZACION) {
        html += `
          <div class="text-muted text-end mt-3">
            <small><i class="fas fa-clock me-1"></i> Última actualización: ${new Date(historial.FECHA_ACTUALIZACION).toLocaleString()}</small>
          </div>
        `;
      }

      historialContainer.innerHTML = html;

      // Botones para mostrar observaciones de preclínica
      historialContainer.querySelectorAll('.btn-ver-preclinica').forEach(btn => {
        btn.addEventListener('click', () => {
          const fila = document.getElementById('obsPreclinica' + btn.dataset.index);
          if (!fila) return;
          const visible = fila.style.display !== 'none';
          fila.style.display = visible ? 'none' : 'table-row';
          btn.innerHTML = visible ? '<i class="fas fa-eye"></i>' : '<i class="fas fa-eye-slash"></i>';
        });
      });

      // ✅ NUEVO: botones para mostrar todos los datos de una consulta médica
      historialContainer.querySelectorAll('.btn-ver-consulta').forEach(btn => {
        btn.addEventListener('click', () => {
          const fila = document.getElementById('detalleConsulta' + btn.dataset.index);
          if (!fila) return;
          const visible = fila.style.display !== 'none';
          fila.style.display = visible ? 'none' : 'table-row';
          btn.innerHTML = visible ? '<i class="fas fa-eye"></i>' : '<i class="fas fa-eye-slash"></i>';
        });
      });

    } catch (err) {
      console.error('Error cargando historial consolidado:', err);
      historialContainer.innerHTML = `<p class="text-danger">Error al cargar el historial: ${err.message}</p>`;
      mostrarNotificacion(err.message, 'danger');
    }
  }

  // ============================================================
  // FUNCIÓN: Obtener historial (para editar)
  // ============================================================
  async function obtenerHistorial(pacienteId) {
    try {
      const res = await fetch(`/historial/${pacienteId}`);
      if (!res.ok) throw new Error('Error al cargar historial');
      const data = await res.json();
      return data;
    } catch (err) {
      console.error('Error obteniendo historial:', err);
      mostrarNotificacion(err.message, 'danger');
      return null;
    }
  }

  // ============================================================
  // FUNCIÓN: Guardar historial
  // ============================================================
  async function guardarHistorial() {
    if (!pacienteActualId) {
      mostrarNotificacion('Seleccione un paciente primero', 'warning');
      return;
    }

    const datosHistorial = {
      ALERGIAS: splitStringToArray(document.getElementById('editarAlergias').value),
      ENFERMEDADES_CRONICAS: splitStringToArray(document.getElementById('editarEnfermedades').value),
      CIRUGIAS_PREVIAS: splitStringToArray(document.getElementById('editarCirugias').value),
      MEDICAMENTOS_ACTUALES: splitStringToArray(document.getElementById('editarMedicamentos').value),
      VACUNAS: splitStringToArray(document.getElementById('editarVacunas').value),
      ANTECEDENTES_FAMILIARES: splitStringToArray(document.getElementById('editarAntecedentes').value),
      HABITOS: splitStringToArray(document.getElementById('editarHabitos')?.value || ''),
      NOTAS_IMPORTANTES: document.getElementById('editarNotas').value.trim(),
      USUARIO_MODIFICACION: 'admin'
    };

    try {
      const btn = document.getElementById('btnGuardarHistorial');
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Guardando...';
      }

      const res = await fetch(`/historial/${pacienteActualId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(datosHistorial)
      });

      if (!res.ok) throw new Error('Error al guardar historial');

      const result = await res.json();

      mostrarNotificacion(result.message || 'Historial guardado exitosamente', 'success');

      const modal = bootstrap.Modal.getInstance(document.getElementById('editarHistorialModal'));
      if (modal) modal.hide();

      await cargarHistorialConsolidado(pacienteActualId);

    } catch (err) {
      console.error('Error guardando historial:', err);
      mostrarNotificacion(err.message, 'danger');
    } finally {
      const btn = document.getElementById('btnGuardarHistorial');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-save me-2"></i>Guardar Cambios';
      }
    }
  }

  // ============================================================
  // FUNCIÓN: Exportar PDF
  // ============================================================
  if (btnExportarPDF) {
    btnExportarPDF.addEventListener('click', async () => {
      if (!pacienteActualId) {
        mostrarNotificacion('Seleccione un paciente primero', 'warning');
        return;
      }

      try {
        btnExportarPDF.disabled = true;
        btnExportarPDF.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Generando...';

        const res = await fetch(`/historial/${pacienteActualId}/exportar-pdf`);
        if (!res.ok) throw new Error('Error al generar PDF');

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `historial_${pacienteActualId}_${new Date().toISOString().split('T')[0]}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        mostrarNotificacion('PDF descargado exitosamente', 'success');
      } catch (err) {
        console.error('Error generando PDF:', err);
        mostrarNotificacion('Error al generar PDF: ' + err.message, 'danger');
      } finally {
        btnExportarPDF.disabled = false;
        btnExportarPDF.innerHTML = '<i class="fas fa-file-pdf me-2"></i>Exportar PDF';
      }
    });
  }

  // ============================================================
  // FUNCIÓN: BOTÓN EXCEL - DESCARGA
  // ============================================================
  if (btnExportarExcel) {
    btnExportarExcel.addEventListener('click', function(e) {
      e.preventDefault();

      if (!pacienteActualId) {
        mostrarNotificacion('Seleccione un paciente primero', 'warning');
        return;
      }

      const textoOriginal = this.innerHTML;
      this.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Generando Excel...';
      this.disabled = true;

      try {
        const url = `/historial/excel/historial/${pacienteActualId}`;
        console.log('📊 Descargando Excel desde:', url);

        const link = document.createElement('a');
        link.href = url;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setTimeout(() => {
          this.innerHTML = textoOriginal;
          habilitarBotones(true);
        }, 3000);

      } catch (error) {
        console.error('❌ Error al descargar Excel:', error);
        mostrarNotificacion('Error al generar Excel: ' + error.message, 'danger');
        this.innerHTML = textoOriginal;
        this.disabled = false;
      }
    });
  }

  // ============================================================
  // FUNCIÓN: Imprimir historial
  // ============================================================
  if (btnImprimir) {
    btnImprimir.addEventListener('click', async () => {
      if (!pacienteActualId) {
        mostrarNotificacion('Seleccione un paciente primero', 'warning');
        return;
      }

      try {
        const logoBase64 = await imageToBase64('/roca-maya-oct.jpg');
        generarVentanaImpresion(logoBase64);
      } catch {
        console.log('No se pudo cargar el logo, usando versión sin logo');
        generarVentanaImpresion(null);
      }
    });
  }

  // ============================================================
  // FUNCIÓN: Editar historial
  // ============================================================
  if (btnEditarHistorial) {
    btnEditarHistorial.addEventListener('click', async () => {
      if (!pacienteActualId) {
        mostrarNotificacion('Seleccione un paciente primero', 'warning');
        return;
      }

      try {
        const data = await obtenerHistorial(pacienteActualId);

        if (!data) return;

        if (data.historial) {
          const h = data.historial;
          document.getElementById('editarAlergias').value = parseJSONField(h.ALERGIAS).join(', ');
          document.getElementById('editarEnfermedades').value = parseJSONField(h.ENFERMEDADES_CRONICAS).join(', ');
          document.getElementById('editarCirugias').value = parseJSONField(h.CIRUGIAS_PREVIAS).join(', ');
          document.getElementById('editarMedicamentos').value = parseJSONField(h.MEDICAMENTOS_ACTUALES).join(', ');
          document.getElementById('editarVacunas').value = parseJSONField(h.VACUNAS).join(', ');
          document.getElementById('editarAntecedentes').value = parseJSONField(h.ANTECEDENTES_FAMILIARES).join(', ');
          document.getElementById('editarNotas').value = h.NOTAS_IMPORTANTES || '';
          const habitosInput = document.getElementById('editarHabitos');
          if (habitosInput) {
            habitosInput.value = parseJSONField(h.HABITOS).join(', ');
          }
        }

        const modal = new bootstrap.Modal(document.getElementById('editarHistorialModal'));
        modal.show();

      } catch (err) {
        console.error('Error cargando datos para editar:', err);
        mostrarNotificacion('Error al cargar datos del historial', 'danger');
      }
    });
  }

  // ============================================================
  // FUNCIÓN: Generar ventana de impresión
  // ============================================================
  function generarVentanaImpresion(logoBase64) {
    const contenedor = document.getElementById('historialContainer') || document.body;
    const pacienteNombre = document.querySelector('.paciente-header h4')?.textContent || 'Historial Médico';

    const ventana = window.open('', '', 'width=900,height=700');

    const estilo = `
      <style>
        body {
          font-family: "Times New Roman", serif;
          padding: 20px;
          margin: 0;
          line-height: 1.4;
          color: #333;
        }
        .header {
          display: flex;
          align-items: center;
          border-bottom: 2px solid #333;
          padding-bottom: 15px;
          margin-bottom: 20px;
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
          border: 2px dashed #ccc;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #666;
          font-size: 12px;
          margin-right: 20px;
        }
        .company-info {
          flex: 1;
        }
        .company-name {
          font-size: 20px;
          font-weight: bold;
          color: #333;
        }
        .company-slogan {
          font-size: 14px;
          color: #666;
          font-style: italic;
        }
        h2 {
          text-align: center;
          margin: 20px 0;
          color: #2c3e50;
          border-bottom: 1px solid #ddd;
          padding-bottom: 10px;
        }
        .card {
          border: 1px solid #ddd !important;
          margin-bottom: 15px !important;
          box-shadow: none !important;
        }
        .card-header {
          background-color: #f8f9fa !important;
          border-bottom: 1px solid #ddd !important;
          font-weight: bold;
        }
        .paciente-header {
          background-color: #f8f9fa !important;
          border: 1px solid #ddd !important;
          padding: 15px !important;
          margin-bottom: 20px !important;
        }
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 10px;
          margin-bottom: 20px;
        }
        .stat-card {
          background: #f8f9fa;
          padding: 10px;
          border-radius: 8px;
          text-align: center;
          border: 1px solid #ddd;
        }
        .stat-number {
          font-size: 1.5rem;
          font-weight: bold;
          color: #2c5aa0;
        }
        .stat-label {
          font-size: 0.8rem;
          color: #6c757d;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin: 10px 0;
          font-size: 12px;
        }
        th, td {
          border: 1px solid #ddd;
          padding: 6px 10px;
          text-align: left;
        }
        th {
          background-color: #f8f9fa;
        }
        .badge {
          display: inline-block;
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 10px;
          font-weight: bold;
        }
        .bg-success { background-color: #28a745; color: white; }
        .bg-danger { background-color: #dc3545; color: white; }
        .bg-warning { background-color: #ffc107; color: #333; }
        .bg-info { background-color: #17a2b8; color: white; }
        .bg-primary { background-color: #007bff; color: white; }
        .bg-secondary { background-color: #6c757d; color: white; }
        .bg-dark { background-color: #343a40; color: white; }
        @media print {
          .card { break-inside: avoid; }
        }
      </style>
    `;

    ventana.document.write(`
      <html>
        <head>
          <title>Historial Médico</title>
          ${estilo}
        </head>
        <body>
          <div class="header">
            ${logoBase64 ? `<img src="${logoBase64}" class="logo">` : '<div class="logo-placeholder">Logo no disponible</div>'}
            <div class="company-info">
              <div class="company-name">Clínicas Médicas Roca Maya</div>
              <div class="company-slogan">Tu salud es nuestra seguridad</div>
            </div>
          </div>
          <h2>${pacienteNombre}</h2>
          ${contenedor.innerHTML}
          <div style="margin-top: 30px; font-size: 12px; color: #666; text-align: center;">
            Generado el ${new Date().toLocaleDateString()} a las ${new Date().toLocaleTimeString()}
          </div>
        </body>
      </html>
    `);
    ventana.document.close();

    setTimeout(() => {
      ventana.print();
      setTimeout(() => ventana.close(), 500);
    }, 1000);
  }

  // ============================================================
  // FUNCIONES UTILITARIAS
  // ============================================================

  function parseJSONField(field) {
    if (!field) return [];
    let fieldString = String(field);
    try {
      const parsed = JSON.parse(fieldString);
      return Array.isArray(parsed) ? parsed.filter(item => item && item.trim() !== '') : [];
    } catch {
      return fieldString.split(',').map(item => item.trim()).filter(item => item !== '');
    }
  }

  function splitStringToArray(str) {
    if (!str) return [];
    return str.split(',').map(item => item.trim()).filter(item => item !== '');
  }

  function imageToBase64(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = function () {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  function mostrarNotificacion(mensaje, tipo = 'info') {
    const alertasAnteriores = document.querySelectorAll('.alert-notificacion');
    alertasAnteriores.forEach(alerta => alerta.remove());

    const alerta = document.createElement('div');
    alerta.className = `alert alert-${tipo} alert-notificacion alert-dismissible fade show position-fixed`;
    alerta.style.cssText = `top: 20px; right: 20px; z-index: 2000; min-width: 280px;`;
    alerta.innerHTML = `
      ${mensaje}
      <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    document.body.appendChild(alerta);

    setTimeout(() => {
      if (alerta.parentNode) {
        alerta.remove();
      }
    }, 5000);
  }

  function mostrarLoading(elemento, mensaje = 'Cargando...') {
    if (!elemento) return;
    if (elemento.tagName === 'SELECT') {
      elemento.innerHTML = `<option value="">${mensaje}</option>`;
      return;
    }
    elemento.innerHTML = `
      <div class="text-center py-4">
        <div class="spinner-border text-primary mb-2"></div>
        <p class="text-muted">${mensaje}</p>
      </div>
    `;
  }
});