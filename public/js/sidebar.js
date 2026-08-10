// ============================================================
// SIDEBAR - COMPORTAMIENTO COMPLETO Y MEJORADO
// ============================================================

document.addEventListener('DOMContentLoaded', function () {

    console.log('Sidebar iniciado correctamente');

    // ============================================================
    // 1. ELEMENTOS DEL SIDEBAR
    // ============================================================

    const sidebarModal = document.getElementById('sidebarModal');
    const modalOverlay = document.getElementById('modalOverlay');
    const menuToggle = document.getElementById('menuToggle');
    const closeSidebar = document.getElementById('closeSidebar');

    if (!sidebarModal || !modalOverlay || !menuToggle || !closeSidebar) {
        console.error('Error: Elementos del menú no encontrados.');
        return;
    }

    // ============================================================
    // 2. ABRIR SIDEBAR
    // ============================================================

    function openMenu() {
        sidebarModal.classList.add('open');
        modalOverlay.classList.add('active');

        // Evitar scroll del contenido de fondo
        document.body.style.overflow = 'hidden';
    }

    // ============================================================
    // 3. CERRAR SIDEBAR
    // ============================================================

    function closeMenu() {
        sidebarModal.classList.remove('open');
        modalOverlay.classList.remove('active');

        // Restaurar scroll
        document.body.style.overflow = '';
    }

    // ============================================================
    // 4. EVENTOS DEL SIDEBAR
    // ============================================================

    menuToggle.addEventListener('click', function (e) {
        e.preventDefault();
        openMenu();
    });

    closeSidebar.addEventListener('click', function (e) {
        e.preventDefault();
        closeMenu();
    });

    modalOverlay.addEventListener('click', function () {
        closeMenu();
    });

    // ============================================================
    // 5. CERRAR CON ESCAPE
    // ============================================================

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && sidebarModal.classList.contains('open')) {
            closeMenu();
        }
    });

    // ============================================================
    // 6. CERRAR SIDEBAR AL HACER CLIC EN ENLACES
    // ============================================================

    const sidebarLinks = document.querySelectorAll(
        '.sidebar-item:not(.logout-item)'
    );

    sidebarLinks.forEach(function (link) {

        link.addEventListener('click', function () {

            // No cerrar automáticamente si es el botón de restauración
            if (this.id === 'btnRestore') {
                return;
            }

            // Si es un enlace, cerrar sidebar
            if (this.tagName === 'A') {
                setTimeout(function () {
                    if (sidebarModal.classList.contains('open')) {
                        closeMenu();
                    }
                }, 100);
            }
        });
    });

    // ============================================================
    // 7. RESTAURACIÓN DE BASE DE DATOS
    // ============================================================

    const btnRestore = document.getElementById('btnRestore');
    const fileRestore = document.getElementById('fileRestore');
    const loading = document.getElementById('loading');

    let restauracionEnProceso = false;

    if (btnRestore && fileRestore) {

        // ========================================================
        // 7.1 ABRIR SELECTOR DE ARCHIVO
        // ========================================================

        btnRestore.addEventListener('click', function (e) {

            e.preventDefault();
            e.stopPropagation();

            // Evitar doble ejecución
            if (restauracionEnProceso) {
                return;
            }

            const confirmar = confirm(
                '⚠️ ADVERTENCIA\n\n' +
                'La restauración reemplazará los datos actuales de la base de datos.\n\n' +
                'Esta operación puede ser irreversible.\n\n' +
                '¿Estás seguro de que deseas continuar?'
            );

            if (!confirmar) {
                return;
            }

            // Abrir selector de archivos
            fileRestore.click();
        });

        // ========================================================
        // 7.2 ARCHIVO SELECCIONADO
        // ========================================================

        fileRestore.addEventListener('change', async function () {

            const file = this.files && this.files[0];

            if (!file) {
                return;
            }

            // ====================================================
            // VALIDAR EXTENSIÓN
            // ====================================================

            const extension = file.name
                .split('.')
                .pop()
                .toLowerCase();

            if (extension !== 'sql') {

                alert(
                    '❌ Archivo no válido.\n\n' +
                    'Debes seleccionar un archivo con extensión .sql'
                );

                fileRestore.value = '';
                return;
            }

            // ====================================================
            // VALIDAR TAMAÑO
            // ====================================================

            const MAX_SIZE = 50 * 1024 * 1024; // 50 MB

            if (file.size > MAX_SIZE) {

                alert(
                    '❌ El archivo es demasiado grande.\n\n' +
                    'Tamaño máximo permitido: 50 MB.'
                );

                fileRestore.value = '';
                return;
            }

            // ====================================================
            // VALIDAR ARCHIVO VACÍO
            // ====================================================

            if (file.size === 0) {

                alert(
                    '❌ El archivo seleccionado está vacío.'
                );

                fileRestore.value = '';
                return;
            }

            // ====================================================
            // ACTIVAR ESTADO DE RESTAURACIÓN
            // ====================================================

            restauracionEnProceso = true;

            const originalHTML = btnRestore.innerHTML;

            btnRestore.innerHTML =
                '<i class="fas fa-spinner fa-spin"></i> Restaurando...';

            btnRestore.style.cursor = 'wait';

            // Si es button, deshabilitarlo
            if ('disabled' in btnRestore) {
                btnRestore.disabled = true;
            }

            // Mostrar loading
            if (loading) {
                loading.style.display = 'flex';
            }

            // ====================================================
            // CREAR FORMDATA
            // ====================================================

            const formData = new FormData();
            formData.append('backup', file);

            try {

                console.log(
                    'Iniciando restauración:',
                    file.name,
                    file.size,
                    'bytes'
                );

                // =================================================
                // PETICIÓN AL BACKEND
                // =================================================

            router.post('/restore', upload.single('backup'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ ok: false, message: 'No se subió archivo' });
        }

        // --- Aquí va la lógica de tu restauración ---
        // ...
        
        // SI TODO SALIÓ BIEN:
        return res.status(200).json({ ok: true, message: 'Restauración completada' });

    } catch (error) {
        console.error(error);
        // SI OCURRIÓ UN ERROR (MUY IMPORTANTE):
        return res.status(500).json({ ok: false, message: 'Error interno: ' + error.message });
    }
});

// =================================================
// LEER RESPUESTA DE FORMA SEGURA
// =================================================

const responseText = await response.text();

// 🔍 IMPRIMIR LO QUE EL SERVIDOR REALMENTE RESPONDIó
console.log("Respuesta cruda del servidor:", responseText);

let data;

try {
    data = JSON.parse(responseText);
} catch (jsonError) {
    console.error('El servidor no devolvió JSON. Respuesta recibida:', responseText);
    
    // Muestra el texto exacto en la alerta para verlo en pantalla
    throw new Error('El servidor respondió esto:\n\n' + responseText.substring(0, 200));
}

                // =================================================
                // HTTP ERROR
                // =================================================

                if (!response.ok) {

                    const mensajeError =
                        data.mensaje ||
                        data.message ||
                        `Error HTTP ${response.status}`;

                    throw new Error(mensajeError);
                }

                // =================================================
                // RESPUESTA EXITOSA
                // =================================================

                if (data.ok === true || data.success === true) {

                    alert(
                        '✅ ' +
                        (
                            data.mensaje ||
                            data.message ||
                            'Base de datos restaurada exitosamente.'
                        )
                    );

                    // Recargar después de la restauración
                    setTimeout(function () {
                        window.location.reload();
                    }, 1500);

                } else {

                    throw new Error(
                        data.mensaje ||
                        data.message ||
                        'El servidor rechazó la restauración.'
                    );
                }

            } catch (error) {

                console.error(
                    '❌ Error durante la restauración:',
                    error
                );

                alert(
                    '❌ No se pudo restaurar la base de datos.\n\n' +
                    error.message
                );

            } finally {

                // =================================================
                // RESTAURAR ESTADO DEL BOTÓN
                // =================================================

                if (loading) {
                    loading.style.display = 'none';
                }

                fileRestore.value = '';

                btnRestore.innerHTML = originalHTML;
                btnRestore.style.cursor = 'pointer';

                if ('disabled' in btnRestore) {
                    btnRestore.disabled = false;
                }

                restauracionEnProceso = false;
            }
        });
    }

    // ============================================================
    // 8. CONFIRMACIÓN PARA CERRAR SESIÓN
    // ============================================================

    const logoutLink = document.querySelector('.logout-item');

    if (logoutLink) {

        logoutLink.addEventListener('click', function (e) {

            const confirmar = confirm(
                '¿Estás seguro de que deseas cerrar sesión?'
            );

            if (!confirmar) {
                e.preventDefault();
            }
        });
    }

    // ============================================================
    // 9. FINALIZACIÓN
    // ============================================================

    console.log('✅ Sidebar inicializado correctamente');
});