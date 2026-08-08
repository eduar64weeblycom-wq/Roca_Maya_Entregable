document.addEventListener('DOMContentLoaded', function() {
  // ============================================================
  // DECLARACIÓN DE VARIABLES
  // ============================================================
  const usuarioLogueado = document.querySelector('meta[name="usuario-logueado"]')?.content || 'Administrador';
  let usuarioEliminarId = null;

  const modalUsuario = document.getElementById('modalUsuario');
  const modalEliminar = document.getElementById('modalEliminar');
  const formUsuario = document.getElementById('formUsuario');
  const inputId = document.getElementById('inputId');
  const inputUsuario = document.getElementById('inputUsuario');
  const inputNombre = document.getElementById('inputNombre');
  const inputTelefono = document.getElementById('inputTelefono');   // NUEVO
  const selectRol = document.getElementById('selectRol');
  const selectEstado = document.getElementById('selectEstado');
  const selectEspecialidades = document.getElementById('especialidadesSelect');
  const SkinnerGroup = document.getElementById('especialidadesGroup');
  const btnCancelar = document.getElementById('btnCancelar');
  const btnCancelarEliminar = document.getElementById('btnCancelarEliminar');
  const btnConfirmarEliminar = document.getElementById('btnConfirmarEliminar');
  const textoConfirmacion = document.getElementById('textoConfirmacion');
  const logoBtn = document.getElementById('logoBtn');
  const btnImprimir = document.getElementById('btnImprimir');

  // Elementos de Filtros
  const usuarioFilter = document.getElementById('usuarioFilter');
  const nombreFilter = document.getElementById('nombreFilter');
  const estadoFilter = document.getElementById('estadoFilter');
  const tfaFilter = document.getElementById('tfaFilter');
  const btnAplicarFiltros = document.getElementById('btnAplicarFiltros');
  const btnLimpiarFiltros = document.getElementById('btnLimpiarFiltros');

  // ============================================================
  // BOTÓN NUEVO USUARIO
  // ============================================================
  const btnNuevoUsuario = document.getElementById('btnNuevoUsuario');
  if (btnNuevoUsuario) {
    btnNuevoUsuario.addEventListener('click', function(e) {
      e.preventDefault();
      // Abrir el modal de registro en lugar de redirigir
      const modalRegister = document.getElementById('modalRegister');
      if (modalRegister) modalRegister.style.display = 'block';
    });
  }

  // ============================================================
  // FUNCIONES DE CONTROL DE MODALES
  // ============================================================
  function cerrarModal() {
    if (modalUsuario) modalUsuario.style.display = 'none';
    if (formUsuario) formUsuario.reset();
    if (SkinnerGroup) SkinnerGroup.style.display = 'none';
  }

  function cerrarModalEliminar() {
    if (modalEliminar) modalEliminar.style.display = 'none';
    usuarioEliminarId = null;
  }

  document.querySelectorAll('[data-dismiss="modal"], #btnCancelar, #btnCancelarEliminar, #btnCerrarModalEdicion, #btnCerrarModalEliminar')
    .forEach(btn => {
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        cerrarModal();
        cerrarModalEliminar();
      });
    });

  window.addEventListener('click', function(e) {
    if (e.target === modalUsuario) cerrarModal();
    if (e.target === modalEliminar) cerrarModalEliminar();
  });

  // ============================================================
// RECARGAR ROLES EN AMBOS SELECTORES
// ============================================================
async function recargarRolesGlobal() {
  try {
    console.log('🔄 Recargando roles globalmente...');
    
    const resp = await fetch('/roles/api/roles');
    const data = await resp.json();
    
    if (!data.ok) {
      console.error('❌ Error al obtener roles:', data.msg);
      return false;
    }
    
    // 1. Actualizar select del modal de edición (#selectRol)
    if (selectRol) {
      const valorActual = selectRol.value;
      selectRol.innerHTML = '';
      data.roles.forEach(rol => {
        const option = document.createElement('option');
        option.value = rol.ID_ROL;
        option.textContent = rol.ROL;
        selectRol.appendChild(option);
      });
      
      // Restaurar selección
      if (valorActual) {
        for (let i = 0; i < selectRol.options.length; i++) {
          if (selectRol.options[i].value == valorActual) {
            selectRol.selectedIndex = i;
            break;
          }
        }
      }
    }
    
    // 2. Actualizar select del modal de registro (#regRol)
    const regRol = document.getElementById('regRol');
    if (regRol) {
      const valorActual = regRol.value;
      regRol.innerHTML = '';
      data.roles.forEach(rol => {
        const option = document.createElement('option');
        option.value = rol.ID_ROL;
        option.textContent = rol.ROL;
        regRol.appendChild(option);
      });
      
      // Restaurar selección
      if (valorActual) {
        for (let i = 0; i < regRol.options.length; i++) {
          if (regRol.options[i].value == valorActual) {
            regRol.selectedIndex = i;
            break;
          }
        }
      }
    }
    
    console.log('✅ Roles recargados en ambos selects');
    return true;
    
  } catch (error) {
    console.error('❌ Error recargando roles:', error);
    return false;
  }
}

  // ============================================================
  // CARGAR ESPECIALIDADES
  // ============================================================
  async function cargarEspecialidades(seleccionadas = []) {
    try {
      const resp = await fetch('/users/api/especialidades');
      const data = await resp.json();
      if (!data.ok) throw new Error(data.msg);

      if (!selectEspecialidades) return;
      selectEspecialidades.innerHTML = '';
      
      data.especialidades.forEach(esp => {
        const option = document.createElement('option');
        option.value = esp.ID_ESPECIALIDAD;
        option.textContent = esp.NOMBRE_ESPECIALIDAD;
        if (seleccionadas.includes(esp.ID_ESPECIALIDAD)) {
          option.selected = true;
        }
        selectEspecialidades.appendChild(option);
      });
    } catch (error) {
      console.error('Error cargando especialidades:', error);
    }
  }

  function toggleEspecialidades(rolId) {
    if (!SkinnerGroup) return;
    if (parseInt(rolId) === 2) {
      SkinnerGroup.style.display = 'block';
    } else {
      SkinnerGroup.style.display = 'none';
      if (selectEspecialidades) {
        Array.from(selectEspecialidades.options).forEach(opt => opt.selected = false);
      }
    }
  }

  // ============================================================
  // ABRIR MODAL DE EDICIÓN
  // ============================================================
  async function abrirModalEditar(id) {
    try {
      const resp = await fetch(`/users/api/usuario/${id}`);
      const data = await resp.json();
      if (!data.ok) throw new Error(data.msg);

      const usuario = data.usuario;
      const especialidadesUsuario = data.especialidades || [];

      inputId.value = usuario.ID_USUARIO;
      inputUsuario.value = usuario.USUARIO;
      inputNombre.value = usuario.NOMBRE_USUARIO;
      inputTelefono.value = usuario.TELEFONO_PROFESIONAL || '';   // NUEVO
      selectRol.value = usuario.ID_ROL;
      selectEstado.value = usuario.ESTADO;

      await cargarEspecialidades(especialidadesUsuario);
      toggleEspecialidades(usuario.ID_ROL);

      document.getElementById('modalTitulo').textContent = 'Editar Usuario';
      modalUsuario.style.display = 'block';
    } catch (error) {
      console.error('Error al abrir modal de edición:', error);
      alert('⚠️ Error al cargar datos del usuario: ' + error.message);
    }
  }

  // ============================================================
  // EVENTOS DE LA TABLA
  // ============================================================
  document.querySelector('#usuariosTable tbody')?.addEventListener('click', function(e) {
    const target = e.target.closest('.btn-accion');
    if (!target) return;

    const fila = target.closest('.fila-usuario');
    if (!fila) return;
    const id = fila.getAttribute('data-id');
    const usuario = fila.querySelector('.usuario')?.textContent.trim() || '';

    if (target.classList.contains('btn-editar')) {
      e.preventDefault();
      abrirModalEditar(id);
      return;
    }
    if (target.classList.contains('btn-eliminar')) {
      e.preventDefault();
      cambiarEstadoUsuario(id, usuario, 'INACTIVO');
      return;
    }
    if (target.classList.contains('btn-activar')) {
      e.preventDefault();
      cambiarEstadoUsuario(id, usuario, 'ACTIVO');
      return;
    }
    if (target.classList.contains('btn-eliminar-permanente')) {
      e.preventDefault();
      usuarioEliminarId = id;
      textoConfirmacion.textContent = `¿Está seguro de que desea eliminar permanentemente al usuario "${usuario}"? Esta acción no se puede deshacer.`;
      modalEliminar.style.display = 'block';
      return;
    }
  });

  // ============================================================
  // CAMBIAR ESTADO
  // ============================================================
  async function cambiarEstadoUsuario(id, usuario, nuevoEstado) {
    const accion = nuevoEstado === 'ACTIVO' ? 'activar' : 'desactivar';
    if (!confirm(`¿Está seguro de que desea ${accion} al usuario "${usuario}"?`)) return;

    try {
      const resp = await fetch('/users/api/cambiar-estado', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, estado: nuevoEstado, usuarioAccion: usuarioLogueado })
      });
      const data = await resp.json();
      if (!data.ok) throw new Error(data.msg);

      alert('✅ ' + data.msg);
      window.location.reload();
    } catch (error) {
      console.error('Error al cambiar estado:', error);
      alert('❌ ' + error.message);
    }
  }

  // ============================================================
  // CONFIRMAR ELIMINACIÓN
  // ============================================================
  btnConfirmarEliminar?.addEventListener('click', async function() {
    if (!usuarioEliminarId) return;
    try {
      const resp = await fetch('/users/api/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: usuarioEliminarId, usuarioAccion: usuarioLogueado })
      });
      const data = await resp.json();
      if (!data.ok) throw new Error(data.msg);

      const fila = document.querySelector(`.fila-usuario[data-id="${usuarioEliminarId}"]`);
      if (fila) fila.remove();

      alert('✅ ' + data.msg);
      cerrarModalEliminar();
      actualizarContadores();
    } catch (error) {
      console.error('Error al eliminar usuario:', error);
      alert('❌ ' + error.message);
    }
  });

  // ============================================================
  // CONTROL DE FILTROS DE BÚSQUEDA
  // ============================================================
  function ejecutarFiltros() {
    const queryUsuario = usuarioFilter?.value.toLowerCase().trim() || '';
    const queryNombre = nombreFilter?.value.toLowerCase().trim() || '';
    const queryEstado = estadoFilter?.value || '';
    const queryTfa = tfaFilter?.value || '';

    const filas = document.querySelectorAll('.fila-usuario');

    filas.forEach(fila => {
      const txtUsuario = fila.querySelector('.usuario')?.textContent.toLowerCase() || '';
      const txtNombre = fila.querySelector('.nombre')?.textContent.toLowerCase() || '';
      const txtEstado = fila.querySelector('.estado-td')?.textContent.trim() || '';
      const attrTfa = fila.getAttribute('data-tfa') === '1' ? 'SI' : 'NO';

      const coincideUsuario = txtUsuario.includes(queryUsuario);
      const coincideNombre = txtNombre.includes(queryNombre);
      const coincideEstado = queryEstado === '' || txtEstado === queryEstado;
      const coincideTfa = queryTfa === '' || attrTfa === queryTfa;

      if (coincideUsuario && coincideNombre && coincideEstado && coincideTfa) {
        fila.style.display = '';
      } else {
        fila.style.display = 'none';
      }
    });

    actualizarContadores();
  }

  btnAplicarFiltros?.addEventListener('click', ejecutarFiltros);

  btnLimpiarFiltros?.addEventListener('click', function() {
    if (usuarioFilter) usuarioFilter.value = '';
    if (nombreFilter) nombreFilter.value = '';
    if (estadoFilter) estadoFilter.value = '';
    if (tfaFilter) tfaFilter.value = '';
    
    document.querySelectorAll('.fila-usuario').forEach(f => f.style.display = '');
    actualizarContadores();
  });

  // ============================================================
  // EVENTOS ADICIONALES
  // ============================================================
  selectRol?.addEventListener('change', function() {
    toggleEspecialidades(this.value);
  });

  logoBtn?.addEventListener('click', function() {
    window.location.href = '/dashboard';
  });

  btnImprimir?.addEventListener('click', function() {
    window.print();
  });

  // ============================================================
  // ENVÍO DEL FORMULARIO DE EDICIÓN
  // ============================================================
  formUsuario?.addEventListener('submit', async function(e) {
    e.preventDefault();

    const id = inputId.value;
    const usuario = inputUsuario.value.trim();
    const nombre_usuario = inputNombre.value.trim();
    const id_rol = selectRol.value;
    const estado = selectEstado.value;
    const telefono_profesional = inputTelefono.value.trim();   // NUEVO

    let especialidades = [];
    if (parseInt(id_rol) === 2 && selectEspecialidades) {
      especialidades = Array.from(selectEspecialidades.selectedOptions).map(opt => parseInt(opt.value));
    }

    const data = {
      id,
      usuario,
      nombre_usuario,
      id_rol,
      estado,
      activo_2fa: 0,
      usuarioAccion: usuarioLogueado,
      especialidades,
      telefono_profesional   // NUEVO
    };

    try {
      const btn = this.querySelector('button[type="submit"]');
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Guardando...';
      }

      const resp = await fetch('/users/api/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const result = await resp.json();
      if (!result.ok) throw new Error(result.msg);

      alert('✅ ' + result.msg);
      cerrarModal();
      window.location.reload();
    } catch (error) {
      console.error('Error al actualizar usuario:', error);
      alert('❌ Error: ' + error.message);
    } finally {
      const btn = this.querySelector('button[type="submit"]');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-save"></i> Guardar';
      }
    }
  });

  // ============================================================
  // ACTUALIZACIÓN DE CONTADORES
  // ============================================================
  function actualizarContadores() {
    const filas = document.querySelectorAll('.fila-usuario');
    const total = filas.length;
    const mostrados = Array.from(filas).filter(f => f.style.display !== 'none').length;
    
    const totalEl = document.getElementById('totalUsuarios');
    const mostradosEl = document.getElementById('usuariosMostrados');
    
    if (totalEl) totalEl.textContent = total;
    if (mostradosEl) mostradosEl.textContent = mostrados;
  }

  // Inicialización
  actualizarContadores();
  console.log('🚀 users.js cargado e inicializado correctamente con filtros.');
});