// ============================================================
// CITAS DEL PACIENTE - Visualización CON ESPECIALIDAD
// ============================================================

console.log("citas-paciente-visualizar.js cargado");

// Cache para evitar múltiples peticiones
let citasCache = null;
let citasCacheTime = null;
const CACHE_TTL = 60000;

async function obtenerTodasLasCitas(forceRefresh = false) {
  if (!forceRefresh && citasCache && citasCacheTime && (Date.now() - citasCacheTime < CACHE_TTL)) {
    console.log('Usando caché de citas');
    return citasCache;
  }

  try {
    const url = '/citas/api/datos?_=' + Date.now();
    console.log(' Fetching:', url);
    const response = await fetch(url);
    if (!response.ok) throw new Error('Error al cargar citas');
    const data = await response.json();
    
    citasCache = data.citas || [];
    citasCacheTime = Date.now();
    console.log(' Citas obtenidas:', citasCache.length);
    
    if (citasCache.length > 0) {
      console.log(' Campos de la primera cita:', Object.keys(citasCache[0]));
      console.log(' Especialidad de la primera cita:', citasCache[0].ESPECIALIDAD);
    }
    
    return citasCache;
  } catch (error) {
    console.error('Error obteniendo citas:', error);
    return [];
  }
}

// ========== ABRIR MODAL ==========
function abrirCitas(idPaciente, nombrePaciente) {
  console.log(' abrirCitas llamado con ID:', idPaciente);
  console.log(' Nombre:', nombrePaciente);
  
  const overlay = document.getElementById('modalCitasOverlay');
  const cuerpo = document.getElementById('modalCitasCuerpo');
  
  if (!overlay || !cuerpo) {
    console.error(' Modal no encontrado');
    alert('Error: Modal no encontrado');
    return;
  }
  
  overlay.style.display = 'flex';
  overlay.style.visibility = 'visible';
  overlay.style.opacity = '1';
  overlay.classList.add('active');
  document.body.style.overflow = 'hidden';
  
  const titulo = document.getElementById('modalCitasTitulo');
  if (titulo) {
    titulo.innerHTML = `<i class="fas fa-calendar-check me-2"></i>Citas de ${nombrePaciente} (ID: ${idPaciente})`;
  }
  
  cuerpo.innerHTML = `
    <div class="text-center py-4">
      <div class="spinner-border text-primary" role="status">
        <span class="visually-hidden">Cargando...</span>
      </div>
      <p class="mt-2 text-muted">Cargando citas...</p>
    </div>
  `;
  
  cargarCitasPaciente(idPaciente, cuerpo);
}

async function cargarCitasPaciente(idPaciente, cuerpo) {
  try {
    const todasLasCitas = await obtenerTodasLasCitas(true);
    const idPacienteStr = String(idPaciente);
    
    const idsDisponibles = todasLasCitas
      .map(c => c.ID_PACIENTE)
      .filter(id => id !== undefined && id !== null)
      .map(id => String(id));
    
    const idsUnicos = [...new Set(idsDisponibles)];
    
    if (idsUnicos.length === 0) {
      cuerpo.innerHTML = `
        <div class="alert alert-danger text-center">
          <i class="fas fa-exclamation-triangle me-2"></i>
          <strong>Error: No se encontró el campo ID_PACIENTE</strong>
          <br><br>
          <div class="text-start small">
            <p><strong>Estructura de la cita:</strong></p>
            <pre style="background:#f4f4f4; padding:10px; border-radius:5px; overflow-x:auto; font-size:11px;">
${todasLasCitas.length > 0 ? JSON.stringify(todasLasCitas[0], null, 2) : 'No hay citas'}
            </pre>
          </div>
        </div>
      `;
      return;
    }
    
    if (!idsUnicos.includes(idPacienteStr)) {
      cuerpo.innerHTML = `
        <div class="alert alert-warning text-center">
          <i class="fas fa-exclamation-triangle me-2"></i>
          <strong>No se encontraron citas para el paciente ID: ${idPaciente}</strong>
          <br><br>
          <div class="text-start small">
            <p><strong>IDs disponibles:</strong></p>
            <ul>
              ${idsUnicos.map(id => `<li>ID: ${id}</li>`).join('')}
            </ul>
            <p class="text-muted">Total de citas en sistema: ${todasLasCitas.length}</p>
          </div>
        </div>
      `;
      return;
    }
    
    const citas = todasLasCitas.filter(c => String(c.ID_PACIENTE) === idPacienteStr);
    console.log(' Citas encontradas:', citas.length);
    
    if (citas.length === 0) {
      cuerpo.innerHTML = `
        <div class="alert alert-info text-center">
          <i class="fas fa-info-circle me-2"></i>
          Este paciente no tiene citas registradas.
        </div>
      `;
      return;
    }
    
    // ========== GENERAR TABLA CON ESPECIALIDAD ==========
    const estadosActivos = ['PROGRAMADA', 'CONFIRMADA', 'PRE_CLINICA', 'CONSULTA_MEDICA'];
    const citasActivas = citas.filter(c => estadosActivos.includes(c.ESTADO));
    const citasHistorial = citas.filter(c => !estadosActivos.includes(c.ESTADO));
    
    const formatearFecha = (fecha) => {
      if (!fecha) return 'N/A';
      const d = new Date(fecha);
      return d.toLocaleString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    };
    
    const badgeEstado = (estado) => {
      const clases = {
        'PROGRAMADA': 'badge-programada',
        'CONFIRMADA': 'badge-confirmada',
        'PRE_CLINICA': 'badge-preclinica',
        'CONSULTA_MEDICA': 'badge-consulta_medica',
        'FINALIZADA': 'badge-finalizada',
        'CANCELADA': 'badge-cancelada',
        'NO_ASISTIO': 'badge-no_asistio',
        'ALTA': 'badge-alta'
      };
      const clase = clases[estado] || 'badge-secondary';
      return `<span class="badge ${clase}">${estado}</span>`;
    };
    
    let html = `
      <div class="container-fluid">
        <div class="alert alert-success">
          <strong> ${citas.length} citas encontradas</strong> para el paciente
        </div>
    `;
    
    // Citas Activas
    html += `
      <h5 class="mt-3"><i class="fas fa-clock text-success me-2"></i>Citas Activas (${citasActivas.length})</h5>
    `;
    if (citasActivas.length > 0) {
      html += `
        <div class="table-responsive">
          <table class="table table-sm table-bordered table-striped">
            <thead class="table-success">
              <tr>
                <th>Fecha</th>
                <th>Doctor</th>
                <th>Motivo</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              ${citasActivas.map(c => `
                <tr>
                  <td>${formatearFecha(c.FECHA_CITA)}</td>
                  <td>
                    <strong>${c.NOMBRE_DOCTOR || 'N/A'}</strong>
                    ${c.ESPECIALIDAD ? `<br><small class="text-muted">(${c.ESPECIALIDAD})</small>` : ''}
                  </td>
                  <td>${c.MOTIVO_CONSULTA || 'N/A'}</td>
                  <td>${badgeEstado(c.ESTADO)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    } else {
      html += `<p class="text-muted">No hay citas activas.</p>`;
    }
    
    // Historial
    html += `
      <h5 class="mt-4"><i class="fas fa-history text-secondary me-2"></i>Historial de Citas (${citasHistorial.length})</h5>
    `;
    if (citasHistorial.length > 0) {
      html += `
        <div class="table-responsive">
          <table class="table table-sm table-bordered table-striped">
            <thead class="table-secondary">
              <tr>
                <th>Fecha</th>
                <th>Doctor</th>
                <th>Motivo</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              ${citasHistorial.map(c => `
                <tr>
                  <td>${formatearFecha(c.FECHA_CITA)}</td>
                  <td>
                    <strong>${c.NOMBRE_DOCTOR || 'N/A'}</strong>
                    ${c.ESPECIALIDAD ? `<br><small class="text-muted">(${c.ESPECIALIDAD})</small>` : ''}
                  </td>
                  <td>${c.MOTIVO_CONSULTA || 'N/A'}</td>
                  <td>${badgeEstado(c.ESTADO)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    } else {
      html += `<p class="text-muted">No hay citas en el historial.</p>`;
    }
    
    html += `
        <div class="mt-3 text-muted small">
          <i class="fas fa-circle text-success me-1" style="font-size:0.6rem;"></i> Activas: ${citasActivas.length} 
          <i class="fas fa-circle text-secondary ms-2 me-1" style="font-size:0.6rem;"></i> Historial: ${citasHistorial.length}
        </div>
      </div>
    `;
    
    cuerpo.innerHTML = html;
    console.log(' Modal actualizado con especialidad');
    
  } catch (error) {
    console.error(' Error:', error);
    cuerpo.innerHTML = `
      <div class="alert alert-danger">
        <i class="fas fa-exclamation-circle me-2"></i>
        Error: ${error.message}
      </div>
    `;
  }
}

// ========== CERRAR MODAL ==========
function cerrarModalCitas() {
  console.log(' Cerrando modal de citas');
  
  const overlay = document.getElementById('modalCitasOverlay');
  if (overlay) {
    overlay.style.display = 'none';
    overlay.style.visibility = 'hidden';
    overlay.style.opacity = '0';
    overlay.classList.remove('active');
    document.body.style.overflow = '';
    console.log(' Modal cerrado correctamente');
  }
}

// ========== MANEJAR CLIC EN EL FONDO ==========
function configurarCierreFondo() {
  const overlay = document.getElementById('modalCitasOverlay');
  if (overlay) {
    overlay.removeEventListener('click', manejarClicFondo);
    overlay.addEventListener('click', manejarClicFondo);
    console.log(' Cierre al hacer clic en el fondo configurado');
  }
}

function manejarClicFondo(event) {
  const overlay = document.getElementById('modalCitasOverlay');
  if (event.target === overlay) {
    console.log(' Clic en el fondo - cerrando modal');
    cerrarModalCitas();
  }
}

// ========== CERRAR CON TECLA ESC ==========
document.addEventListener('keydown', function(event) {
  if (event.key === 'Escape') {
    const overlay = document.getElementById('modalCitasOverlay');
    if (overlay && overlay.style.display === 'flex') {
      cerrarModalCitas();
    }
  }
});

// ========== INICIALIZAR ==========
document.addEventListener('DOMContentLoaded', function() {
  configurarCierreFondo();
  console.log(' Modal de citas inicializado');
});

// Registrar globalmente
window.abrirCitas = abrirCitas;
window.cerrarModalCitas = cerrarModalCitas;
console.log(' Funciones registradas globalmente');