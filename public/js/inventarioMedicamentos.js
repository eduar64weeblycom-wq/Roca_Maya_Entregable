// public/js/inventarioMedicamentos.js
// ============================================================
// CÓDIGO COMPLETO Y FUNCIONAL
// ============================================================

let tablaMedicamentos;
let medicamentosData = [];
let modalMedicamento = null;
let modalStock = null;

$(document).ready(function() {
    modalMedicamento = new bootstrap.Modal(document.getElementById('modalMedicamento'));
    modalStock = new bootstrap.Modal(document.getElementById('modalStock'));
    
    inicializarDataTable();
    cargarMedicamentos();
    inicializarEventListeners();
});

function inicializarDataTable() {
    tablaMedicamentos = $('#tablaMedicamentos').DataTable({
        language: { url: '//cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json' },
        columns: [
            { data: 'NOMBRE_MEDICAMENTO' },
            { data: 'NOMBRE_GENERICO' },
            { data: 'PROVEEDOR' },
            { data: 'PRESENTACION' },
            { 
                data: 'STOCK_ACTUAL',
                render: function(data) {
                    return `<span class="badge bg-${data <= 10 ? 'warning' : 'success'}">${data}</span>`;
                }
            },
            { 
                data: 'PRECIO_VENTA',
                render: function(data) {
                    return data ? `L. ${parseFloat(data).toFixed(2)}` : '-';
                }
            },
            { 
                data: 'FECHA_VENCIMIENTO',
                render: function(data) {
                    if (!data) return '-';
                    const fecha = new Date(data);
                    const hoy = new Date();
                    const diffDays = Math.ceil((fecha - hoy) / (1000 * 60 * 60 * 24));
                    if (diffDays < 0) return `<span class="text-danger">Vencido</span>`;
                    else if (diffDays <= 30) return `<span class="text-warning">${fecha.toLocaleDateString('es-ES')} (${diffDays}d)</span>`;
                    else return fecha.toLocaleDateString('es-ES');
                }
            },
            { 
                data: 'ESTADO',
                render: function(data) {
                    const cls = data === 'ACTIVO' ? 'success' : 'secondary';
                    return `<span class="badge bg-${cls}">${data}</span>`;
                }
            },
            {
                data: 'ID_MEDICAMENTO',
                render: function(data) {
                    return `
                        <button class="btn btn-sm btn-primary btn-editar" data-id="${data}" title="Editar">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-sm btn-warning btn-ajustar-stock" data-id="${data}" title="Ajustar Stock">
                            <i class="fas fa-boxes"></i>
                        </button>
                        <button class="btn btn-sm btn-danger btn-eliminar" data-id="${data}" title="Eliminar">
                            <i class="fas fa-trash"></i>
                        </button>
                    `;
                },
                orderable: false
            }
        ]
    });
}

function inicializarEventListeners() {
    $('#btnNuevoMedicamento').on('click', function() {
        $('#formMedicamento')[0].reset();
        $('#idMedicamento').val('');
        $('#modalTitle').html('<i class="fas fa-pills me-2"></i>Nuevo Medicamento');
        modalMedicamento.show();
    });

    $('#btnGuardarMedicamento').on('click', guardarMedicamento);
    $('#btnAjustarStock').on('click', guardarAjusteStock);
    $('#btnResetearFiltros').on('click', resetearFiltros);

    // Delegación de eventos para botones dinámicos
    $('#tablaMedicamentos tbody').on('click', '.btn-editar', function() {
        const id = $(this).data('id');
        editarMedicamento(id);
    });

    $('#tablaMedicamentos tbody').on('click', '.btn-ajustar-stock', function() {
        const id = $(this).data('id');
        // Necesitamos obtener el nombre y stock actual de la fila
        const fila = $(this).closest('tr');
        const nombre = fila.find('td:eq(0)').text().trim();
        const stock = parseInt(fila.find('td:eq(4) .badge').text().trim());
        abrirModalStock(id, nombre, stock);
    });

    $('#tablaMedicamentos tbody').on('click', '.btn-eliminar', function() {
        const id = $(this).data('id');
        eliminarMedicamento(id);
    });

    // Filtros
    $('#searchInput').on('keyup', filtrarMedicamentos);
    $('#filterEstado').on('change', filtrarMedicamentos);
    $('#filterStock').on('change', filtrarMedicamentos);

    // Imprimir
    $('#btnImprimir').on('click', function() {
        window.print();
    });
}

function cargarMedicamentos() {
    $.ajax({
        url: '/inventario/api/medicamentos',
        method: 'GET',
        success: function(response) {
            if (response.success) {
                medicamentosData = response.data;
                tablaMedicamentos.clear().rows.add(medicamentosData).draw();
                actualizarEstadisticas();
            } else {
                mostrarAlerta('Error al cargar medicamentos', 'error');
            }
        },
        error: function() {
            mostrarAlerta('Error de conexión', 'error');
        }
    });
}

function filtrarMedicamentos() {
    const search = $('#searchInput').val().toLowerCase();
    const estado = $('#filterEstado').val();
    const stock = $('#filterStock').val();

    const filtrados = medicamentosData.filter(med => {
        const matchSearch = !search || 
            (med.NOMBRE_MEDICAMENTO && med.NOMBRE_MEDICAMENTO.toLowerCase().includes(search)) ||
            (med.NOMBRE_GENERICO && med.NOMBRE_GENERICO.toLowerCase().includes(search)) ||
            (med.PROVEEDOR && med.PROVEEDOR.toLowerCase().includes(search));

        const matchEstado = !estado || med.ESTADO === estado;
        let matchStock = true;
        if (stock === 'BAJO') matchStock = med.STOCK_ACTUAL <= med.STOCK_MINIMO;
        else if (stock === 'OPTIMO') matchStock = med.STOCK_ACTUAL > med.STOCK_MINIMO;
        else if (stock === 'SIN_STOCK') matchStock = med.STOCK_ACTUAL === 0;

        return matchSearch && matchEstado && matchStock;
    });

    tablaMedicamentos.clear().rows.add(filtrados).draw();
}

function resetearFiltros() {
    $('#searchInput').val('');
    $('#filterEstado').val('');
    $('#filterStock').val('');
    filtrarMedicamentos();
}

function editarMedicamento(id) {
    $.ajax({
        url: `/inventario/api/medicamentos/${id}`,
        method: 'GET',
        success: function(response) {
            if (response.success) {
                const med = response.data;
                $('#idMedicamento').val(med.ID_MEDICAMENTO);
                $('#nombreMedicamento').val(med.NOMBRE_MEDICAMENTO || '');
                $('#nombreGenerico').val(med.NOMBRE_GENERICO || '');
                $('#descripcion').val(med.DESCRIPCION || '');
                $('#presentacion').val(med.PRESENTACION || '');
                $('#concentracion').val(med.CONCENTRACION || '');
                $('#viaAdministracion').val(med.VIA_ADMINISTRACION || '');
                $('#stockActual').val(med.STOCK_ACTUAL || 0);
                $('#stockMinimo').val(med.STOCK_MINIMO || 10);
                $('#stockMaximo').val(med.STOCK_MAXIMO || 100);
                $('#precioCompra').val(med.PRECIO_COMPRA || '');
                $('#precioVenta').val(med.PRECIO_VENTA || '');
                $('#lote').val(med.LOTE || '');
                $('#fechaVencimiento').val(med.FECHA_VENCIMIENTO || '');
                $('#proveedor').val(med.PROVEEDOR || '');
                $('#estado').val(med.ESTADO || 'ACTIVO');
                $('#modalTitle').html('<i class="fas fa-edit me-2"></i>Editar Medicamento');
                modalMedicamento.show();
            } else {
                mostrarAlerta('Error al cargar medicamento', 'error');
            }
        },
        error: function() {
            mostrarAlerta('Error de conexión', 'error');
        }
    });
}

function guardarMedicamento() {
    const id = $('#idMedicamento').val();
    const datos = {
        NOMBRE_MEDICAMENTO: $('#nombreMedicamento').val().trim(),
        NOMBRE_GENERICO: $('#nombreGenerico').val().trim(),
        DESCRIPCION: $('#descripcion').val().trim(),
        PRESENTACION: $('#presentacion').val().trim(),
        CONCENTRACION: $('#concentracion').val().trim(),
        VIA_ADMINISTRACION: $('#viaAdministracion').val().trim(),
        STOCK_ACTUAL: parseInt($('#stockActual').val()) || 0,
        STOCK_MINIMO: parseInt($('#stockMinimo').val()) || 10,
        STOCK_MAXIMO: parseInt($('#stockMaximo').val()) || 100,
        PRECIO_COMPRA: parseFloat($('#precioCompra').val()) || 0,
        PRECIO_VENTA: parseFloat($('#precioVenta').val()) || 0,
        LOTE: $('#lote').val().trim(),
        FECHA_VENCIMIENTO: $('#fechaVencimiento').val() || null,
        PROVEEDOR: $('#proveedor').val().trim(),
        REQUIERE_RECETA: $('#requiereReceta').is(':checked'),
        ESTADO: $('#estado').val()
    };

    if (!datos.NOMBRE_MEDICAMENTO) {
        mostrarAlerta('El nombre del medicamento es obligatorio', 'error');
        return;
    }

    const url = id ? `/inventario/api/medicamentos/${id}` : '/inventario/api/medicamentos';
    const method = id ? 'PUT' : 'POST';

    $.ajax({
        url: url,
        method: method,
        data: JSON.stringify(datos),
        contentType: 'application/json',
        success: function(response) {
            if (response.success) {
                modalMedicamento.hide();
                mostrarAlerta(response.message, 'success');
                cargarMedicamentos();
            } else {
                mostrarAlerta(response.message || 'Error al guardar', 'error');
            }
        },
        error: function(xhr) {
            mostrarAlerta('Error al guardar: ' + (xhr.responseJSON?.message || 'Error de servidor'), 'error');
        }
    });
}

function eliminarMedicamento(id) {
    Swal.fire({
        title: '¿Estás seguro?',
        text: "Esta acción no se puede deshacer",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#e74c3c',
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText: 'Cancelar'
    }).then((result) => {
        if (result.isConfirmed) {
            $.ajax({
                url: `/inventario/api/medicamentos/${id}`,
                method: 'DELETE',
                success: function(response) {
                    if (response.success) {
                        Swal.fire('¡Eliminado!', response.message, 'success');
                        cargarMedicamentos();
                    } else {
                        mostrarAlerta(response.message || 'Error al eliminar', 'error');
                    }
                },
                error: function() {
                    mostrarAlerta('Error al eliminar', 'error');
                }
            });
        }
    });
}

function abrirModalStock(id, nombre, stockActual) {
    $('#idMedicamentoStock').val(id);
    $('#nombreMedicamentoStock').val(`${nombre} (Stock actual: ${stockActual})`);
    $('#nuevoStock').val(stockActual);
    modalStock.show();
}

function guardarAjusteStock() {
    const id = $('#idMedicamentoStock').val();
    const nuevoStock = parseInt($('#nuevoStock').val());

    if (isNaN(nuevoStock) || nuevoStock < 0) {
        mostrarAlerta('Ingrese un stock válido (>= 0)', 'error');
        return;
    }

    $.ajax({
        url: `/inventario/api/medicamentos/${id}/stock`,
        method: 'PUT',
        data: JSON.stringify({ STOCK_ACTUAL: nuevoStock }),
        contentType: 'application/json',
        success: function(response) {
            if (response.success) {
                modalStock.hide();
                mostrarAlerta(response.message, 'success');
                cargarMedicamentos();
            } else {
                mostrarAlerta(response.message || 'Error al actualizar stock', 'error');
            }
        },
        error: function() {
            mostrarAlerta('Error al actualizar stock', 'error');
        }
    });
}

function actualizarEstadisticas() {
    const total = medicamentosData.length;
    const activos = medicamentosData.filter(m => m.ESTADO === 'ACTIVO').length;
    const stockBajo = medicamentosData.filter(m => m.STOCK_ACTUAL <= m.STOCK_MINIMO && m.ESTADO === 'ACTIVO').length;
    const hoy = new Date();
    const proximosVencer = medicamentosData.filter(m => {
        if (!m.FECHA_VENCIMIENTO) return false;
        const venc = new Date(m.FECHA_VENCIMIENTO);
        const diff = Math.ceil((venc - hoy) / (1000 * 60 * 60 * 24));
        return diff <= 30 && diff >= 0;
    }).length;

    $('#totalMedicamentos').text(total);
    $('#activos').text(activos);
    $('#stockBajo').text(stockBajo);
    $('#proximoVencer').text(proximosVencer);
}

function mostrarAlerta(mensaje, tipo) {
    const alerta = $(`
        <div class="alert alert-${tipo === 'error' ? 'danger' : 'success'} alert-dismissible fade show" role="alert">
            <i class="fas fa-${tipo === 'error' ? 'exclamation-triangle' : 'check-circle'} me-2"></i>
            ${mensaje}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
    `);
    alerta.css({
        position: 'fixed',
        top: '20px',
        right: '20px',
        zIndex: '9999',
        minWidth: '300px'
    });
    $('body').append(alerta);
    setTimeout(() => alerta.alert('close'), 5000);
}