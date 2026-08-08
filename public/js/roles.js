// ============================================================
// ROLES.JS - Gestión de roles y permisos
// ============================================================
document.addEventListener('DOMContentLoaded', function() {
  console.log(' roles.js cargado correctamente');
  
  // ============================================================
  // ELEMENTOS DEL DOM
  // ============================================================
  const modalRol = document.getElementById('modalRol');
  const formRol = document.getElementById('formRol');
  const rolId = document.getElementById('rolId');
  const rolNombre = document.getElementById('rolNombre');
  const rolDescripcion = document.getElementById('rolDescripcion');
  const rolEstado = document.getElementById('rolEstado');
  const modalRolTitulo = document.getElementById('modalRolTitulo');
  const btnGuardarRol = document.getElementById('btnGuardarRol');
  const btnNuevoRol = document.getElementById('btnNuevoRol');
  const btnCancelarRol = document.getElementById('btnCancelarRol');
  const btnCerrarModalRol = document.getElementById('btnCerrarModalRol');
  
  // Elementos del modal de permisos
  const modalPermisos = document.getElementById('modalPermisos');
  const permisosList = document.getElementById('permisosList');
  const permisosLoading = document.getElementById('permisosLoading');
  const permisosRolNombre = document.getElementById('permisosRolNombre');
  const permisosSeleccionados = document.getElementById('permisosSeleccionados');
  const selectAllPermisos = document.getElementById('selectAllPermisos');
  const btnGuardarPermisos = document.getElementById('btnGuardarPermisos');
  const btnCancelarPermisos = document.getElementById('btnCancelarPermisos');
  const btnCerrarModalPermisos = document.getElementById('btnCerrarModalPermisos');
  
  const logoBtn = document.getElementById('logoBtn');
  const rolesBody = document.getElementById('rolesBody');
  const usuarioLogueado = document.querySelector('meta[name="usuario-logueado"]')?.content || 'SISTEMA';
  
  let currentRolId = null;
  let currentRolNombre = '';
  let currentPermisosData = [];

  console.log('👤 Usuario logueado:', usuarioLogueado);

  // ============================================================
  //  FUNCIÓN PARA ACTUALIZAR CONTADOR DE PERMISOS
  // ============================================================
  function actualizarContadorPermisos() {
    const checks = document.querySelectorAll('.perm-check:checked');
    const totalChecks = document.querySelectorAll('.perm-check').length;
    const seleccionados = checks.length;
    
    console.log(' Contador actualizado:', seleccionados, 'de', totalChecks);
    
    if (permisosSeleccionados) {
      permisosSeleccionados.textContent = `${seleccionados} seleccionados`;
    }
    
    // Actualizar "Seleccionar todos" si todos están marcados
    if (selectAllPermisos) {
      const todos = document.querySelectorAll('.perm-check');
      const todosChequeados = document.querySelectorAll('.perm-check:checked');
      selectAllPermisos.checked = (todos.length > 0 && todos.length === todosChequeados.length);
    }
  }

  // ============================================================
  //  FUNCIÓN PARA RENDERIZAR PERMISOS (SOLO CONSULTA)
  // ============================================================
  function renderPermisos(objetos, permisosMap) {
    if (!objetos || objetos.length === 0) {
        permisosList.innerHTML = `
            <div class="alert alert-info">
                <i class="fas fa-info-circle"></i> 
                No hay objetos/páginas disponibles para asignar permisos.
            </div>
        `;
        return;
    }
    
    // Agrupar por tipo
    const grouped = {};
    objetos.forEach(obj => {
        const tipo = obj.TIPO_OBJETO || 'General';
        if (!grouped[tipo]) grouped[tipo] = [];
        grouped[tipo].push(obj);
    });
    
    let html = '';
    
    Object.keys(grouped).forEach(categoria => {
        html += `<div class="permisos-categoria">`;
        html += `<div class="categoria-titulo">${categoria}</div>`;
        
        grouped[categoria].forEach(obj => {
            const perm = permisosMap[obj.ID_OBJETO] || { consulta: false };
            const checked = perm.consulta ? 'checked' : '';
            
            let icono = 'fa-cube';
            const nombreLower = obj.OBJETO.toLowerCase();
            if (nombreLower.includes('cita')) icono = 'fa-calendar-check';
            else if (nombreLower.includes('consulta')) icono = 'fa-stethoscope';
            else if (nombreLower.includes('preclínica') || nombreLower.includes('preclinica')) icono = 'fa-hospital-user';
            else if (nombreLower.includes('especialidad')) icono = 'fa-flask';
            else if (nombreLower.includes('paciente')) icono = 'fa-user-injured';
            else if (nombreLower.includes('historial')) icono = 'fa-file-medical';
            else if (nombreLower.includes('bitacora')) icono = 'fa-book';
            else if (nombreLower.includes('usuario')) icono = 'fa-users-cog';
            else if (nombreLower.includes('respaldo')) icono = 'fa-download';
            else if (nombreLower.includes('restaurar')) icono = 'fa-upload';
            else if (nombreLower.includes('seguridad')) icono = 'fa-shield-alt';
            else if (nombreLower.includes('farmacia') || nombreLower.includes('inventario')) icono = 'fa-pills';
            
            html += `
                <div class="permiso-item" data-id="${obj.ID_OBJETO}">
                    <div class="permiso-icon"><i class="fas ${icono}"></i></div>
                    <div class="permiso-nombre" title="${obj.DESCRIPCION || obj.OBJETO}">${obj.OBJETO}</div>
                    <div class="permiso-checkbox">
                        <label title="Ver en el menú">
                            <input type="checkbox" class="perm-check perm-consulta" data-id="${obj.ID_OBJETO}" ${checked}>
                            <span class="ms-1">Mostrar en menú</span>
                        </label>
                    </div>
                </div>
            `;
        });
        
        html += `</div>`;
    });
    
    permisosList.innerHTML = html;
    
    //  Actualizar contador
    actualizarContadorPermisos();
    
    //  Agregar eventos a los checkboxes
    document.querySelectorAll('.perm-check').forEach(cb => {
        cb.addEventListener('change', actualizarContadorPermisos);
    });
    
    //  Evento para "Seleccionar todos"
    const selectAllElement = document.getElementById('selectAllPermisos');
    if (selectAllElement) {
        const newSelectAll = selectAllElement.cloneNode(true);
        selectAllElement.parentNode.replaceChild(newSelectAll, selectAllElement);
        
        newSelectAll.addEventListener('change', function() {
            const checked = this.checked;
            document.querySelectorAll('.perm-check').forEach(cb => {
                cb.checked = checked;
            });
            actualizarContadorPermisos();
        });
    }
  }

  // ============================================================
  //  FUNCIÓN PARA GUARDAR PERMISOS (SOLO CONSULTA)
  // ============================================================
  async function guardarPermisos() {
    if (!currentRolId) {
        alert(' No se ha seleccionado un rol');
        return;
    }
    
    const items = document.querySelectorAll('.permiso-item');
    const permisos = [];
    
    items.forEach(item => {
        const idObjeto = parseInt(item.dataset.id);
        const consulta = item.querySelector('.perm-check')?.checked || false;
        
        permisos.push({
            idObjeto: idObjeto,
            consulta: consulta
        });
    });
    
    btnGuardarPermisos.disabled = true;
    const textoOriginal = btnGuardarPermisos.innerHTML;
    btnGuardarPermisos.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Guardando...';
    
    try {
        const response = await fetch('/roles/api/permisos/guardar', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                idRol: currentRolId,
                permisos: permisos,
                usuarioAccion: usuarioLogueado
            })
        });
        
        const data = await response.json();
        
        if (data.ok) {
            alert('✅ ' + data.msg);
            cerrarModalPermisos();
            setTimeout(() => {
                window.location.reload();
            }, 1000);
        } else {
            alert('❌ ' + data.msg);
        }
    } catch (error) {
        console.error(' Error al guardar permisos:', error);
        alert(' Error al guardar permisos: ' + error.message);
    } finally {
        btnGuardarPermisos.disabled = false;
        btnGuardarPermisos.innerHTML = textoOriginal;
    }
  }

  // ============================================================
  // FUNCIONES DEL MODAL DE ROL
  // ============================================================
  function abrirModal(rolData = null) {
    console.log(' Abriendo modal con datos:', rolData);
    
    if (rolData) {
      rolId.value = rolData.id || '';
      rolNombre.value = rolData.rol || '';
      rolDescripcion.value = rolData.descripcion || '';
      if (rolEstado) {
        rolEstado.value = rolData.estado || 'ACTIVO';
      }
      modalRolTitulo.innerHTML = '<i class="fas fa-edit"></i> Editar Rol';
      btnGuardarRol.innerHTML = '<i class="fas fa-save"></i> Actualizar';
      document.querySelector('#modalRol .modal-content h2').textContent = 'Editar Rol';
    } else {
      rolId.value = '';
      rolNombre.value = '';
      rolDescripcion.value = '';
      if (rolEstado) {
        rolEstado.value = 'ACTIVO';
      }
      modalRolTitulo.innerHTML = '<i class="fas fa-plus-circle"></i> Nuevo Rol';
      btnGuardarRol.innerHTML = '<i class="fas fa-save"></i> Guardar';
      document.querySelector('#modalRol .modal-content h2').textContent = 'Nuevo Rol';
    }
    modalRol.style.display = 'flex';
  }

  function cerrarModalRol() {
    modalRol.style.display = 'none';
    formRol.reset();
    rolId.value = '';
  }

  // ============================================================
  // FUNCIONES DEL MODAL DE PERMISOS
  // ============================================================
  async function abrirModalPermisos(idRol, nombreRol) {
    console.log(' Abriendo modal de permisos para rol:', idRol, nombreRol);
    
    currentRolId = idRol;
    currentRolNombre = nombreRol;
    permisosRolNombre.textContent = nombreRol;
    
    permisosLoading.style.display = 'block';
    permisosList.style.display = 'none';
    modalPermisos.style.display = 'flex';
    
    try {
      //  Cargar objetos desde la API
      const objetosResponse = await fetch('/roles/api/objetos');
      const objetosData = await objetosResponse.json();
      
      if (!objetosData.ok) {
        throw new Error(objetosData.msg || 'Error al cargar objetos');
      }
      
      const objetos = objetosData.objetos || [];
      console.log(' Objetos cargados:', objetos.length);
      
      //  Cargar permisos del rol
      const permisosResponse = await fetch(`/roles/api/permisos/${idRol}`);
      const permisosData = await permisosResponse.json();
      
      // Crear mapa de permisos existentes
      const permisosMap = {};
      if (permisosData.ok && permisosData.permisos) {
        permisosData.permisos.forEach(p => {
          permisosMap[p.ID_OBJETO] = {
            consulta: p.PERMISO_CONSULTA === 1
          };
        });
      }
      
      //  Renderizar permisos
      renderPermisos(objetos, permisosMap);
      
      permisosLoading.style.display = 'none';
      permisosList.style.display = 'block';
      
    } catch (error) {
      console.error(' Error al cargar permisos:', error);
      permisosLoading.style.display = 'none';
      permisosList.innerHTML = `
        <div class="alert alert-danger">
          <i class="fas fa-exclamation-triangle"></i> 
          Error al cargar permisos: ${error.message}
        </div>
      `;
      permisosList.style.display = 'block';
    }
  }

  function cerrarModalPermisos() {
    modalPermisos.style.display = 'none';
    currentRolId = null;
    currentRolNombre = '';
  }

  // ============================================================
  //  GUARDAR PERMISOS EN LA BASE DE DATOS
  // ============================================================
  async function guardarPermisos() {
    if (!currentRolId) {
      alert(' No se ha seleccionado un rol');
      return;
    }
    
    // Recoger todos los permisos del modal
    const items = document.querySelectorAll('.permiso-item');
    const permisos = [];
    
    items.forEach(item => {
      const idObjeto = parseInt(item.dataset.id);
      const consulta = item.querySelector('.perm-consulta')?.checked || false;
      
      permisos.push({
        idObjeto: idObjeto,
        consulta: consulta
      });
    });
    
    // Deshabilitar botón
    btnGuardarPermisos.disabled = true;
    const textoOriginal = btnGuardarPermisos.innerHTML;
    btnGuardarPermisos.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Guardando...';
    
    try {
      const response = await fetch('/roles/api/permisos/guardar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          idRol: currentRolId,
          permisos: permisos,
          usuarioAccion: usuarioLogueado
        })
      });
      
      const data = await response.json();
      
      if (data.ok) {
        alert('✅ ' + data.msg);
        cerrarModalPermisos();
        // Recargar la página para ver los cambios
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      } else {
        alert('❌ ' + data.msg);
      }
    } catch (error) {
      console.error(' Error al guardar permisos:', error);
      alert(' Error al guardar permisos: ' + error.message);
    } finally {
      btnGuardarPermisos.disabled = false;
      btnGuardarPermisos.innerHTML = textoOriginal;
    }
  }

  // ============================================================
  // EVENTOS DEL MODAL DE ROL
  // ============================================================
  if (btnNuevoRol) {
    btnNuevoRol.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      console.log('🆕 Click en Nuevo Rol');
      abrirModal();
    });
  }

  if (btnCancelarRol) {
    btnCancelarRol.addEventListener('click', function(e) {
      e.preventDefault();
      cerrarModalRol();
    });
  }
  
  if (btnCerrarModalRol) {
    btnCerrarModalRol.addEventListener('click', function(e) {
      e.preventDefault();
      cerrarModalRol();
    });
  }

  if (modalRol) {
    modalRol.addEventListener('click', function(e) {
      if (e.target === modalRol) {
        cerrarModalRol();
      }
    });
  }

  // ============================================================
  // EVENTOS DEL MODAL DE PERMISOS
  // ============================================================
  if (btnCancelarPermisos) {
    btnCancelarPermisos.addEventListener('click', function(e) {
      e.preventDefault();
      cerrarModalPermisos();
    });
  }
  
  if (btnCerrarModalPermisos) {
    btnCerrarModalPermisos.addEventListener('click', function(e) {
      e.preventDefault();
      cerrarModalPermisos();
    });
  }

  if (modalPermisos) {
    modalPermisos.addEventListener('click', function(e) {
      if (e.target === modalPermisos) {
        cerrarModalPermisos();
      }
    });
  }

  if (btnGuardarPermisos) {
    btnGuardarPermisos.addEventListener('click', guardarPermisos);
  }

  // ============================================================
  // LOGO - Volver al dashboard
  // ============================================================
  if (logoBtn) {
    logoBtn.addEventListener('click', function() {
      window.location.href = '/dashboard';
    });
  }

  // ============================================================
  // EDITAR, ELIMINAR Y PERMISOS - Delegación de eventos
  // ============================================================
  if (rolesBody) {
    rolesBody.addEventListener('click', function(e) {
      console.log(' Click en rolesBody:', e.target);
      
      // ===== EDITAR =====
      const btnEditar = e.target.closest('.btn-editar-rol');
      if (btnEditar) {
        e.preventDefault();
        console.log('✏️ Click en Editar rol - ID:', btnEditar.dataset.id);
        
        const fila = btnEditar.closest('tr');
        if (!fila) {
          console.error(' No se encontró la fila');
          return;
        }
        
        const id = fila.dataset.id;
        const rol = fila.dataset.rol;
        const estado = fila.dataset.estado || 'ACTIVO';
        const descripcionTd = fila.querySelector('td:nth-child(3)');
        const descripcion = descripcionTd ? descripcionTd.textContent.trim() : '';
        
        console.log(' Datos de la fila:', { id, rol, estado, descripcion });
        
        abrirModal({
          id: id,
          rol: rol,
          descripcion: descripcion === 'Sin descripción' ? '' : descripcion,
          estado: estado
        });
        return;
      }
      
      // ===== PERMISOS =====
      const btnPermisos = e.target.closest('.btn-permisos-rol');
      if (btnPermisos) {
        e.preventDefault();
        const id = parseInt(btnPermisos.dataset.id);
        const rol = btnPermisos.dataset.rol;
        console.log(' Click en Permisos - ID:', id, 'Rol:', rol);
        abrirModalPermisos(id, rol);
        return;
      }
      
      // ===== ELIMINAR =====
      const btnEliminar = e.target.closest('.btn-eliminar-rol');
      if (btnEliminar) {
        e.preventDefault();
        console.log(' Click en Eliminar rol - ID:', btnEliminar.dataset.id);
        
        if (btnEliminar.disabled) {
          alert(' No se pueden eliminar roles del sistema');
          return;
        }
        
        const fila = btnEliminar.closest('tr');
        if (!fila) return;
        
        const id = fila.dataset.id;
        const nombre = fila.dataset.rol;

        if (!confirm(`¿Está seguro de eliminar el rol "${nombre}"?\n\nEsta acción no se puede deshacer.`)) return;

        eliminarRol(id, nombre, fila);
      }
    });
  }

  // ============================================================
  // FUNCIÓN PARA ELIMINAR ROL
  // ============================================================
  async function eliminarRol(id, nombre, fila) {
    try {
      const response = await fetch(`/roles/api/eliminar/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuarioAccion: usuarioLogueado })
      });

      const data = await response.json();
      console.log(' Respuesta eliminar:', data);
      
      if (data.ok) {
        alert('✅ ' + data.msg);
        if (fila) {
          fila.remove();
          actualizarContador();
        }
      } else {
        alert('❌ ' + data.msg);
      }
    } catch (error) {
      console.error('Error:', error);
      alert(' Error de conexión: ' + error.message);
    }
  }

  // ============================================================
  // ENVIAR FORMULARIO (Crear/Actualizar)
  // ============================================================
  if (formRol) {
    formRol.addEventListener('submit', async function(e) {
      e.preventDefault();
      console.log(' Enviando formulario...');

      const id = rolId.value;
      const nombre = rolNombre.value.trim();
      const descripcion = rolDescripcion.value.trim();
      const estado = rolEstado ? rolEstado.value : 'ACTIVO';

      if (!nombre) {
        alert(' El nombre del rol es obligatorio');
        rolNombre.focus();
        return;
      }

      if (nombre.length < 3) {
        alert(' El nombre debe tener al menos 3 caracteres');
        rolNombre.focus();
        return;
      }

      if (nombre.length > 50) {
        alert(' El nombre no puede tener más de 50 caracteres');
        rolNombre.focus();
        return;
      }

      btnGuardarRol.disabled = true;
      const textoOriginal = btnGuardarRol.innerHTML;
      btnGuardarRol.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Guardando...';

      try {
        let url, method;
        let bodyData = { 
          rol: nombre, 
          descripcion: descripcion,
          estado: estado,
          usuarioAccion: usuarioLogueado 
        };

        if (id) {
          url = `/roles/api/actualizar/${id}`;
          method = 'PUT';
        } else {
          url = '/roles/api/crear';
          method = 'POST';
        }

        console.log(' Enviando a:', url, method);
        console.log(' Datos:', bodyData);
        
        const response = await fetch(url, {
          method: method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bodyData)
        });

        const data = await response.json();
        console.log(' Respuesta:', data);
        
        if (data.ok) {
          alert('✅ ' + data.msg);
          cerrarModalRol();
          window.location.reload();
        } else {
          alert('❌ ' + data.msg);
        }
      } catch (error) {
        console.error('Error:', error);
        alert(' Error de conexión: ' + error.message);
      } finally {
        btnGuardarRol.disabled = false;
        btnGuardarRol.innerHTML = textoOriginal;
      }
    });
  }

  // ============================================================
  // ACTUALIZAR CONTADOR
  // ============================================================
  function actualizarContador() {
    const filas = document.querySelectorAll('#rolesBody tr');
    const total = document.getElementById('totalRoles');
    if (total) {
      total.textContent = filas.length;
    }
  }

  // ============================================================
  // VALIDACIÓN EN TIEMPO REAL
  // ============================================================
  if (rolNombre) {
    rolNombre.addEventListener('input', function() {
      this.value = this.value.toUpperCase().replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s-]/g, '');
    });
  }

  // ============================================================
  // INICIALIZACIÓN
  // ============================================================
  console.log(' Gestión de roles inicializada correctamente');
  console.log(' Total de roles en tabla:', document.querySelectorAll('#rolesBody tr').length);
});