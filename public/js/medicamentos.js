// Variables globales
let medicamentos = window.medicamentosData || [];
let medicamentosFiltrados = [...medicamentos];
const API_BASE = '/inventario';

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Inicializando aplicación...');
    console.log('📊 Medicamentos cargados:', medicamentos.length);
    inicializarAplicacion();
});

function inicializarAplicacion() {
    console.log('🔧 Configurando event listeners...');
    
    // Configurar event listeners principales
    const btnNuevo = document.getElementById('btnNuevoMedicamento');
    const btnGuardar = document.getElementById('btnGuardarMedicamento');
    const btnAjustarStock = document.getElementById('btnAjustarStock');
    
    if (btnNuevo) btnNuevo.addEventListener('click', mostrarModalNuevoMedicamento);
    if (btnGuardar) btnGuardar.addEventListener('click', guardarMedicamento);
    if (btnAjustarStock) btnAjustarStock.addEventListener('click', aplicarAjusteStock);
    
    document.getElementById('searchInput').addEventListener('input', filtrarMedicamentos);
    document.getElementById('filterEstado').addEventListener('change', filtrarMedicamentos);
    document.getElementById('filterStock').addEventListener('change', filtrarMedicamentos);

    // Configurar eventos del modal de stock
    document.getElementById('accionStock').addEventListener('change', actualizarInfoStock);
    document.getElementById('cantidadStock').addEventListener('input', actualizarInfoStock);

    // Configurar event listeners para botones de acción usando delegación de eventos
    document.getElementById('tbodyMedicamentos').addEventListener('click', function(e) {
        console.log('🖱️ Click en tabla:', e.target);
        
        const target = e.target.closest('button');
        if (!target) {
            console.log('❌ No es un botón');
            return;
        }

        const id = target.getAttribute('data-id');
        console.log('📋 ID del botón:', id);
        
        if (!id) {
            console.log('❌ No tiene data-id');
            return;
        }

        if (target.classList.contains('btn-editar')) {
            console.log('✏️ Botón editar clickeado');
            editarMedicamento(parseInt(id));
        } else if (target.classList.contains('btn-ajustar-stock')) {
            console.log('📦 Botón ajustar stock clickeado');
            const nombre = target.getAttribute('data-nombre');
            const stock = parseInt(target.getAttribute('data-stock'));
            ajustarStock(parseInt(id), nombre, stock);
        } else if (target.classList.contains('btn-eliminar')) {
            console.log('🗑️ Botón eliminar clickeado');
            eliminarMedicamento(parseInt(id));
        }
    });

    console.log('✅ Event listeners configurados');
}

// Función para mostrar modal de nuevo medicamento
function mostrarModalNuevoMedicamento() {
    console.log('📝 Abriendo modal nuevo medicamento');
    document.getElementById('idMedicamento').value = '';
    document.getElementById('modalTitle').textContent = 'Nuevo Medicamento';
    document.getElementById('formMedicamento').reset();
    
    const modalElement = document.getElementById('modalMedicamento');
    if (modalElement) {
        modalElement.style.display = 'block';
        modalElement.classList.add('show');
    }
}

// Función para guardar medicamento
async function guardarMedicamento() {
    console.log('💾 Intentando guardar medicamento...');
    
    const formData = {
        NOMBRE_MEDICAMENTO: document.getElementById('nombreMedicamento').value.trim(),
        NOMBRE_GENERICO: document.getElementById('nombreGenerico').value.trim(),
        // 🟢 CAMBIO: Se agrega el campo de texto de la farmacéutica
PROVEEDOR: document.getElementById('nombreFarmaceutica').value.trim(),
        PRESENTACION: document.getElementById('presentacion').value.trim(),
        STOCK_ACTUAL: parseInt(document.getElementById('stockActual').value) || 0,
        STOCK_MINIMO: parseInt(document.getElementById('stockMinimo').value) || 10,
        PRECIO_VENTA: parseFloat(document.getElementById('precioVenta').value) || 0,
        FECHA_VENCIMIENTO: document.getElementById('fechaVencimiento').value,
        ESTADO: document.getElementById('estado').value
    };

    console.log('📄 Datos del formulario:', formData);

    if (!formData.NOMBRE_MEDICAMENTO) {
        mostrarNotificacion('El nombre comercial es requerido', 'warning');
        return;
    }

    const idMedicamento = document.getElementById('idMedicamento').value;
    const url = idMedicamento ? `${API_BASE}/medicamentos/${idMedicamento}` : `${API_BASE}/medicamentos`;
    const method = idMedicamento ? 'PUT' : 'POST';

    console.log(`🌐 Enviando ${method} a: ${url}`);

    try {
        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });

        const result = await response.json();
        console.log('📨 Respuesta del servidor:', result);

        if (result.success) {
            mostrarNotificacion(result.message, 'success');
            
            // Cerrar modal
            cerrarModal('modalMedicamento');
            
            // Recargar la página para ver los cambios
            setTimeout(() => {
                window.location.reload();
            }, 1000);
        } else {
            mostrarNotificacion(result.message, 'danger');
        }
    } catch (error) {
        console.error('❌ Error al guardar medicamento:', error);
        mostrarNotificacion('Error al guardar medicamento: ' + error.message, 'danger');
    }
}

// Función para editar medicamento
async function editarMedicamento(id) {
    console.log(`✏️ Editando medicamento ID: ${id}`);
    
    try {
        const response = await fetch(`${API_BASE}/medicamentos/${id}`);
        const result = await response.json();

        console.log('📋 Datos recibidos para edición:', result);

        if (result.success) {
            const med = result.data;
            document.getElementById('idMedicamento').value = med.ID_MEDICAMENTO;
            document.getElementById('nombreMedicamento').value = med.NOMBRE_MEDICAMENTO;
            document.getElementById('nombreGenerico').value = med.NOMBRE_GENERICO || '';
            // 🟢 CAMBIO: Se carga el valor de la farmacéutica en el input de la interfaz
document.getElementById('nombreFarmaceutica').value = med.PROVEEDOR || '';
            document.getElementById('presentacion').value = med.PRESENTACION || '';
            document.getElementById('stockActual').value = med.STOCK_ACTUAL;
            document.getElementById('stockMinimo').value = med.STOCK_MINIMO;
            document.getElementById('precioVenta').value = med.PRECIO_VENTA || '';
            document.getElementById('fechaVencimiento').value = med.FECHA_VENCIMIENTO || '';
            document.getElementById('estado').value = med.ESTADO;

            document.getElementById('modalTitle').textContent = 'Editar Medicamento';
            
            // Mostrar modal
            const modalElement = document.getElementById('modalMedicamento');
            if (modalElement) {
                modalElement.style.display = 'block';
                modalElement.classList.add('show');
            }
        } else {
            mostrarNotificacion('Error al cargar medicamento para editar', 'danger');
        }
    } catch (error) {
        console.error('❌ Error al cargar medicamento:', error);
        mostrarNotificacion('Error al cargar medicamento: ' + error.message, 'danger');
    }
}

// Función para cargar medicamentos desde la API
async function cargarMedicamentos() {
    try {
        console.log('📥 Cargando medicamentos desde la API...');
        const response = await fetch(`${API_BASE}/medicamentos`);
        const result = await response.json();
        
        if (result.success) {
            medicamentos = result.data;
            medicamentosFiltrados = [...medicamentos];
            console.log('✅ Medicamentos cargados:', medicamentos.length);
            return true;
        } else {
            console.error('❌ Error al cargar medicamentos:', result.message);
            return false;
        }
    } catch (error) {
        console.error('❌ Error de conexión:', error);
        return false;
    }
}

// Modificar la función eliminarMedicamento para que sea más robusta
async function eliminarMedicamento(id) {
    console.log(`🗑️ Intentando eliminar medicamento ID: ${id}`);
    console.log('📊 Medicamentos en memoria:', medicamentos.length);
    console.log('📊 Medicamentos filtrados:', medicamentosFiltrados.length);
    
    // Buscar en ambos arrays
    let medicamento = medicamentosFiltrados.find(m => m.ID_MEDICAMENTO === id);
    if (!medicamento) {
        medicamento = medicamentos.find(m => m.ID_MEDICAMENTO === id);
    }
    
    if (!medicamento) {
        console.log('❌ Medicamento no encontrado en ningún array');
        console.log('🔍 IDs disponibles en medicamentos:', medicamentos.map(m => m.ID_MEDICAMENTO));
        console.log('🔍 IDs disponibles en filtrados:', medicamentosFiltrados.map(m => m.ID_MEDICAMENTO));
        mostrarNotificacion('Medicamento no encontrado en los datos cargados', 'warning');
        return;
    }

    if (confirm(`¿Está seguro de que desea eliminar el medicamento "${medicamento.NOMBRE_MEDICAMENTO}"?`)) {
        try {
            console.log(`🌐 Enviando DELETE a: ${API_BASE}/medicamentos/${id}`);
            const response = await fetch(`${API_BASE}/medicamentos/${id}`, {
                method: 'DELETE'
            });

            const result = await response.json();
            console.log('📨 Respuesta de eliminación:', result);

            if (result.success) {
                mostrarNotificacion(result.message, 'success');
                // Recargar los datos en lugar de recargar la página
                setTimeout(async () => {
                    await cargarMedicamentos();
                    window.location.reload();
                }, 1000);
            } else {
                mostrarNotificacion(result.message, 'danger');
            }
        } catch (error) {
            console.error('❌ Error al eliminar medicamento:', error);
            mostrarNotificacion('Error al eliminar medicamento: ' + error.message, 'danger');
        }
    }
}

// Modificar la inicialización para cargar desde la API
async function inicializarAplicacion() {
    console.log('🔧 Configurando event listeners...');
    
    // Cargar medicamentos primero
    await cargarMedicamentos();
    
    // El resto del código de inicialización permanece igual...
    const btnNuevo = document.getElementById('btnNuevoMedicamento');
    const btnGuardar = document.getElementById('btnGuardarMedicamento');
    const btnAjustarStock = document.getElementById('btnAjustarStock');
    
    if (btnNuevo) btnNuevo.addEventListener('click', mostrarModalNuevoMedicamento);
    if (btnGuardar) btnGuardar.addEventListener('click', guardarMedicamento);
    if (btnAjustarStock) btnAjustarStock.addEventListener('click', aplicarAjusteStock);
    
    document.getElementById('searchInput').addEventListener('input', filtrarMedicamentos);
    document.getElementById('filterEstado').addEventListener('change', filtrarMedicamentos);
    document.getElementById('filterStock').addEventListener('change', filtrarMedicamentos);

    // Configurar eventos del modal de stock
    document.getElementById('accionStock').addEventListener('change', actualizarInfoStock);
    document.getElementById('cantidadStock').addEventListener('input', actualizarInfoStock);

    // Configurar event listeners para botones de acción usando delegación de eventos
    document.getElementById('tbodyMedicamentos').addEventListener('click', function(e) {
        console.log('🖱️ Click en tabla:', e.target);
        
        const target = e.target.closest('button');
        if (!target) {
            console.log('❌ No es un botón');
            return;
        }

        const id = target.getAttribute('data-id');
        console.log('📋 ID del botón:', id);
        
        if (!id) {
            console.log('❌ No tiene data-id');
            return;
        }

        if (target.classList.contains('btn-editar')) {
            console.log('✏️ Botón editar clickeado');
            editarMedicamento(parseInt(id));
        } else if (target.classList.contains('btn-ajustar-stock')) {
            console.log('📦 Botón ajustar stock clickeado');
            const nombre = target.getAttribute('data-nombre');
            const stock = parseInt(target.getAttribute('data-stock'));
            ajustarStock(parseInt(id), nombre, stock);
        } else if (target.classList.contains('btn-eliminar')) {
            console.log('🗑️ Botón eliminar clickeado');
            eliminarMedicamento(parseInt(id));
        }
    });

    console.log('✅ Event listeners configurados');
}

// Función para ajustar stock
function ajustarStock(id, nombre, stockActual) {
    console.log(`📦 Ajustando stock para: ${nombre}, ID: ${id}, Stock actual: ${stockActual}`);
    
    document.getElementById('idMedicamentoStock').value = id;
    document.getElementById('nombreMedicamentoStock').value = nombre;
    document.getElementById('stockActualDisplay').value = stockActual;
    document.getElementById('cantidadStock').value = 1;
    
    // Mostrar modal
    const modalElement = document.getElementById('modalStock');
    if (modalElement) {
        modalElement.style.display = 'block';
        modalElement.classList.add('show');
    }
    
    actualizarInfoStock();
}

function actualizarInfoStock() {
    const accion = document.getElementById('accionStock').value;
    const cantidad = parseInt(document.getElementById('cantidadStock').value) || 0;
    const stockActual = parseInt(document.getElementById('stockActualDisplay').value) || 0;
    
    let nuevoStock = stockActual;
    if (accion === 'agregar') {
        nuevoStock = stockActual + cantidad;
    } else if (accion === 'quitar') {
        nuevoStock = stockActual - cantidad;
        if (nuevoStock < 0) nuevoStock = 0;
    }
    
    document.getElementById('infoStock').textContent = 
        `Stock después del ajuste: ${nuevoStock} unidades`;
}

async function aplicarAjusteStock() {
    const id = document.getElementById('idMedicamentoStock').value;
    const accion = document.getElementById('accionStock').value;
    const cantidad = parseInt(document.getElementById('cantidadStock').value) || 0;
    
    console.log(`🔄 Aplicando ajuste de stock - ID: ${id}, Acción: ${accion}, Cantidad: ${cantidad}`);
    
    if (cantidad <= 0) {
        mostrarNotificacion('La cantidad debe ser mayor a 0', 'warning');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/medicamentos/${id}/stock`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ accion, cantidad })
        });
        
        const result = await response.json();
        console.log('📨 Respuesta del ajuste de stock:', result);
        
        if (result.success) {
            mostrarNotificacion(result.message, 'success');
            
            // Cerrar modal
            cerrarModal('modalStock');
            
            // Recargar la página para ver los cambios
            setTimeout(() => {
                window.location.reload();
            }, 1000);
        } else {
            mostrarNotificacion(result.message, 'danger');
        }
    } catch (error) {
        console.error('❌ Error al ajustar stock:', error);
        mostrarNotificacion('Error al ajustar stock: ' + error.message, 'danger');
    }
}

// Función para cerrar modales
function cerrarModal(modalId) {
    const modalElement = document.getElementById(modalId);
    if (modalElement) {
        modalElement.style.display = 'none';
        modalElement.classList.remove('show');
    }
}

// Filtros y búsqueda
function filtrarMedicamentos() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const estadoFilter = document.getElementById('filterEstado').value;
    const stockFilter = document.getElementById('filterStock').value;

    const filas = document.querySelectorAll('#tbodyMedicamentos tr');
    let contador = 0;

    filas.forEach(fila => {
        if (fila.cells.length < 8) return; // Saltar fila de "no hay datos"

        const nombreComercial = fila.cells[0].textContent.toLowerCase();
        const nombreGenerico = fila.cells[1].textContent.toLowerCase();
        
        const estadoCell = fila.cells[6];
        let estado = '';
        
        const badge = estadoCell.querySelector('.badge');
        if (badge) {
            estado = badge.textContent.trim();
        } else {
            estado = estadoCell.textContent.trim();
        }
        
        const stockInfo = fila.cells[3].textContent;
        const stockActual = parseInt(stockInfo.match(/\d+/)[0]);
        const stockMinimo = parseInt(stockInfo.match(/min\s+(\d+)/)?.[1]) || 0;

        const matchSearch = nombreComercial.includes(searchTerm) || nombreGenerico.includes(searchTerm);
        const matchEstado = estadoFilter === '' || estado === estadoFilter;
        
        let matchStock = true;
        if (stockFilter === 'BAJO') {
            matchStock = stockActual <= stockMinimo;
        } else if (stockFilter === 'OPTIMO') {
            matchStock = stockActual > stockMinimo;
        } else if (stockFilter === 'SIN_STOCK') {
            matchStock = stockActual === 0;
        }

        console.log(`Medicamento: ${nombreComercial}, Estado: "${estado}", Filtro: "${estadoFilter}", Match: ${matchEstado}`);

        if (matchSearch && matchEstado && matchStock) {
            fila.classList.remove('filtro-oculto');
            fila.classList.add('filtro-activo');
            contador++;
        } else {
            fila.classList.remove('filtro-activo');
            fila.classList.add('filtro-oculto');
        }
    });

    actualizarContador(contador);
}

function actualizarContador(cantidad) {
    const contador = document.getElementById('contadorMedicamentos');
    if (contador) {
        contador.textContent = cantidad; // ✅ Corregido de 'quantity' a 'cantidad'
    }
}

// Función para mostrar notificaciones
function mostrarNotificacion(mensaje, tipo) {
    const notificacionesExistentes = document.querySelectorAll('.alert-notification');
    notificacionesExistentes.forEach(notif => notif.remove());

    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${tipo} alert-dismissible fade show alert-notification`;
    alertDiv.innerHTML = `
        <i class="fas ${tipo === 'success' ? 'fa-check-circle' : tipo === 'warning' ? 'fa-exclamation-triangle' : 'fa-exclamation-circle'} me-2"></i>
        ${mensaje}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    document.body.appendChild(alertDiv);
    
    setTimeout(() => {
        if (alertDiv.parentNode) {
            alertDiv.remove();
        }
    }, 5000);
}

// Agregar event listeners para cerrar modales con los botones de cerrar
document.addEventListener('DOMContentLoaded', function() {
    const closeButtons = document.querySelectorAll('[data-bs-dismiss="modal"]');
    closeButtons.forEach(button => {
        button.addEventListener('click', function() {
            const modal = this.closest('.modal');
            if (modal) {
                modal.style.display = 'none';
                modal.classList.remove('show');
            }
        });
    });
});

// Agregar event listener para el botón de imprimir
document.addEventListener('DOMContentLoaded', function() {
    const btnImprimir = document.getElementById('btnImprimir');
    if (btnImprimir) {
        btnImprimir.addEventListener('click', imprimirReporteStock);
    }
});

// Función para imprimir reporte de stock
async function imprimirReporteStock() {
    try {
        const logoBase64 = await imageToBase64('/FARMACIA.jpg');
        generarReporteStock(logoBase64);
    } catch (error) {
        console.log('No se pudo cargar el logo, usando versión sin logo');
        generarReporteStock(null);
    }
}

function imageToBase64(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = function() {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);
            resolve(canvas.toDataURL('image/jpg'));
        };
        img.onerror = reject;
        img.src = url;
    });
}

function generarReporteStock(logoBase64) {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const estadoFilter = document.getElementById('filterEstado').value;
    const stockFilter = document.getElementById('filterStock').value;
    
    let medicamentosAImprimir = [...medicamentos];
    
    if (searchTerm) {
        medicamentosAImprimir = medicamentosAImprimir.filter(med => 
            med.NOMBRE_MEDICAMENTO.toLowerCase().includes(searchTerm) || 
            (med.NOMBRE_GENERICO && med.NOMBRE_GENERICO.toLowerCase().includes(searchTerm))
        );
    }
    
    if (estadoFilter) {
        medicamentosAImprimir = medicamentosAImprimir.filter(med => 
            med.ESTADO === estadoFilter
        );
    }
    
    if (stockFilter) {
        medicamentosAImprimir = medicamentosAImprimir.filter(med => {
            if (stockFilter === 'BAJO') {
                return med.STOCK_ACTUAL <= med.STOCK_MINIMO;
            } else if (stockFilter === 'OPTIMO') {
                return med.STOCK_ACTUAL > med.STOCK_MINIMO;
            } else if (stockFilter === 'SIN_STOCK') {
                return med.STOCK_ACTUAL === 0;
            }
            return true;
        });
    }

    const tablaImprimir = document.createElement('table');
    
    // Encabezados de la tabla
    const thead = document.createElement('thead');
    // 🟢 CAMBIO: Se agrega la columna "Farmacéutica" al reporte impreso
    thead.innerHTML = `
        <tr>
            <th>Nombre Comercial</th>
            <th>Nombre Genérico</th>
            <th>Farmacéutica</th>
            <th>Presentación</th>
            <th>Stock Actual</th>
            <th>Stock Mínimo</th>
            <th>Precio Venta</th>
            <th>Fecha Vencimiento</th>
            <th>Estado</th>
        </tr>
    `;
    tablaImprimir.appendChild(thead);

   const tbody = document.createElement('tbody');
    
    if (medicamentosAImprimir.length === 0) {
        const row = document.createElement('tr'); // ✅ CORREGIDO: Declaración de la variable row
        row.innerHTML = `
            <td colspan="9" style="text-align: center; padding: 20px; color: #666;">
                No hay medicamentos que coincidan con los filtros aplicados
            </td>
        `;
        tbody.appendChild(row);
    } else {
        // ... (Tu ciclo forEach posterior está bien)
        medicamentosAImprimir.forEach(med => {
            const row = document.createElement('tr');
            
            let stockClass = '';
            let stockText = med.STOCK_ACTUAL;
            
            if (med.STOCK_ACTUAL === 0) {
                stockClass = 'sin-stock';
                stockText = `${med.STOCK_ACTUAL} (Sin stock)`;
            } else if (med.STOCK_ACTUAL <= med.STOCK_MINIMO) {
                stockClass = 'stock-bajo';
                stockText = `${med.STOCK_ACTUAL} (Stock bajo)`;
            } else {
                stockClass = 'stock-optimo';
                stockText = `${med.STOCK_ACTUAL} (Stock óptimo)`;
            }
            
            let estadoClass = med.ESTADO === 'ACTIVO' ? 'estado-activo' : 'estado-inactivo';
            
            const fechaVencimiento = med.FECHA_VENCIMIENTO ? 
                new Date(med.FECHA_VENCIMIENTO).toLocaleDateString() : 'N/A';
            
            const precio = med.PRECIO_VENTA ? 
                `$${parseFloat(med.PRECIO_VENTA).toFixed(2)}` : 'N/A';
            
            // 🟢 CAMBIO: Se mapea e inyecta la propiedad en la fila correspondiente
            row.innerHTML = `
                <td>${med.NOMBRE_MEDICAMENTO}</td>
                <td>${med.NOMBRE_GENERICO || 'N/A'}</td>
<td>${med.PROVEEDOR || 'N/A'}</td>  <td>${med.PRESENTACION || 'N/A'}</td>
                <td>${med.PRESENTACION || 'N/A'}</td>
                <td class="${stockClass}">${stockText}</td>
                <td>${med.STOCK_MINIMO}</td>
                <td>${precio}</td>
                <td>${fechaVencimiento}</td>
                <td class="${estadoClass}">${med.ESTADO}</td>
            `;
            tbody.appendChild(row);
        });
    }
    
    tablaImprimir.appendChild(tbody);

    let filtrosAplicados = [];
    if (searchTerm) filtrosAplicados.push(`Búsqueda: "${searchTerm}"`);
    if (estadoFilter) filtrosAplicados.push(`Estado: ${estadoFilter}`);
    if (stockFilter) {
        let stockText = '';
        if (stockFilter === 'BAJO') stockText = 'Stock bajo';
        else if (stockFilter === 'OPTIMO') stockText = 'Stock óptimo';
        else if (stockFilter === 'SIN_STOCK') stockText = 'Sin stock';
        filtrosAplicados.push(`Stock: ${stockText}`);
    }
    if (filtrosAplicados.length === 0) filtrosAplicados.push('Todos los medicamentos');

    const ventana = window.open('', '', 'width=1000,height=700');
    
    ventana.document.write(`
      <html>
        <head>
          <title>Reporte de Stock - Farmacia</title>
          <style>
            body { 
                font-family: "Times New Roman", Times, serif; 
                padding: 20px;
                margin: 0;
                background: white;
            }
            .header {
                display: flex;
                align-items: center;
                margin-bottom: 20px;
                border-bottom: 2px solid #333;
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
                border: 2px dashed #ccc;
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
                color: #333;
                margin-bottom: 5px;
            }
            .company-slogan {
                font-size: 14px;
                color: #666;
                font-style: italic;
            }
            .report-title {
                text-align: center;
                margin: 20px 0;
                color: #2c3e50;
                font-size: 18px;
                font-weight: bold;
            }
            .report-info {
                text-align: center;
                margin-bottom: 10px;
                color: #666;
                font-size: 12px;
            }
            .filtros-info {
                text-align: center;
                margin-bottom: 20px;
                color: #333;
                font-size: 12px;
                font-style: italic;
                background: #f8f9fa;
                padding: 8px;
                border-radius: 4px;
            }
            table { 
                width: 100%; 
                border-collapse: collapse;
                font-family: "Times New Roman", Times, serif;
                margin-top: 10px;
                font-size: 10px;
            }
            th, td { 
                border: 1px solid #333; 
                padding: 6px; 
                text-align: left; 
            }
            th { 
                background: #f3f3f3; 
                font-weight: bold;
                font-size: 10px;
            }
            .sin-stock {
                background-color: #ffcccc;
                font-weight: bold;
                color: #cc0000;
            }
            .stock-bajo {
                background-color: #fff3cd;
                font-weight: bold;
                color: #856404;
            }
            .stock-optimo {
                background-color: #d4edda;
                color: #155724;
            }
            .estado-activo {
                background-color: #d4edda;
                color: #155724;
                font-weight: bold;
            }
            .estado-inactivo {
                background-color: #f8d7da;
                color: #721c24;
                font-weight: bold;
            }
            .footer {
                margin-top: 20px;
                text-align: center;
                font-size: 10px;
                color: #666;
                border-top: 1px solid #ccc;
                padding-top: 10px;
            }
            @media print {
                body { margin: 0; }
                .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            ${logoBase64 ? 
                `<img src="${logoBase64}" alt="Clínicas Roca Maya" class="logo">` : 
                '<div class="logo-placeholder">Logo no disponible</div>'
            }
            <div class="company-info">
                <div class="company-name">Clínicas Médicas Roca Maya</div>
                <div class="company-slogan">Tu salud es nuestra seguridad</div>
            </div>
          </div>
          
          <div class="report-title">REPORTE DE STOCK - FARMACIA</div>
          <div class="report-info">
            Generado el: ${new Date().toLocaleDateString()} a las ${new Date().toLocaleTimeString()}
          </div>
          <div class="filtros-info">
            Filtros aplicados: ${filtrosAplicados.join(' | ')}
          </div>
          
          ${tablaImprimir.outerHTML}
          
          <div class="footer">
            Total de medicamentos: ${medicamentosAImprimir.length} | 
            Sistema de Inventario - Clínicas Roca Maya
          </div>
        </body>
      </html>
    `);
    ventana.document.close();

    setTimeout(() => {
        ventana.print();
        ventana.close();
    }, 500);
}

function renderizarTabla() {
    const tbody = document.getElementById('tbodyMedicamentos');
    if (!tbody) return;

    tbody.innerHTML = ''; // Limpiar contenido previo

    if (medicamentosFiltrados.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="text-center">No hay registros disponibles</td></tr>`;
        actualizarContador(0);
        return;
    }

    medicamentosFiltrados.forEach(med => {
        const tr = document.createElement('tr');
        
        // Formatear fechas y precios
        const fecha = med.FECHA_VENCIMIENTO ? med.FECHA_VENCIMIENTO.split('T')[0] : 'N/A';
        const precio = med.PRECIO_VENTA ? `$${parseFloat(med.PRECIO_VENTA).toFixed(2)}` : '$0.00';
        
        tr.innerHTML = `
            <td><strong>${med.NOMBRE_MEDICAMENTO}</strong></td>
            <td>${med.NOMBRE_GENERICO || '-'}</td>
            <td>${med.NOMBRE_FARMACEUTICA || '-'}</td>
            <td>${med.PRESENTACION || '-'}</td>
            <td>
                <span class="badge bg-success">${med.STOCK_ACTUAL}</span> 
                <span class="text-muted">/ min ${med.STOCK_MINIMO}</span>
            </td>
            <td><strong>${precio}</strong></td>
            <td>${fecha}</td>
            <td><span class="badge bg-success">${med.ESTADO}</span></td>
            <td>
                <button class="btn btn-sm btn-outline-primary btn-editar" data-id="${med.ID_MEDICAMENTO}">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-sm btn-outline-warning btn-ajustar-stock" data-id="${med.ID_MEDICAMENTO}" data-nombre="${med.NOMBRE_MEDICAMENTO}" data-stock="${med.STOCK_ACTUAL}">
                    <i class="fas fa-boxes"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger btn-eliminar" data-id="${med.ID_MEDICAMENTO}">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    actualizarContador(medicamentosFiltrados.length);
}