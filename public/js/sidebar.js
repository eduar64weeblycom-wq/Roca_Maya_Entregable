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
        console.error('❌ Elementos del menú no encontrados.');
        return;
    }

    // ============================================================
    // 2. ABRIR SIDEBAR
    // ============================================================

    function openMenu() {
        sidebarModal.classList.add('open');
        modalOverlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    // ============================================================
    // 3. CERRAR SIDEBAR
    // ============================================================

    function closeMenu() {
        sidebarModal.classList.remove('open');
        modalOverlay.classList.remove('active');
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

        if (
            e.key === 'Escape' &&
            sidebarModal.classList.contains('open')
        ) {
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

            // El botón de restauración se maneja aparte
            if (this.id === 'btnRestore') {
                return;
            }

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
        // 7.1 BOTÓN RESTAURAR
        // ========================================================

        btnRestore.addEventListener('click', function (e) {

            e.preventDefault();
            e.stopPropagation();

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

            fileRestore.click();

        });

        // ========================================================
        // 7.2 ARCHIVO SELECCIONADO
        // ========================================================

        fileRestore.addEventListener('change', async function () {

            const archivoSql = this.files && this.files[0];

            if (!archivoSql) {
                return;
            }

            // ====================================================
            // VALIDAR EXTENSIÓN
            // ====================================================

            const extension = archivoSql.name
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

            const MAX_SIZE = 50 * 1024 * 1024;

            if (archivoSql.size > MAX_SIZE) {

                alert(
                    '❌ El archivo es demasiado grande.\n\n' +
                    'Tamaño máximo permitido: 50 MB.'
                );

                fileRestore.value = '';
                return;
            }

            // ====================================================
            // VALIDAR VACÍO
            // ====================================================

            if (archivoSql.size === 0) {

                alert('❌ El archivo seleccionado está vacío.');

                fileRestore.value = '';
                return;
            }

            // ====================================================
            // INICIAR RESTAURACIÓN
            // ====================================================

            restauracionEnProceso = true;

            const originalHTML = btnRestore.innerHTML;

            btnRestore.innerHTML =
                '<i class="fas fa-spinner fa-spin"></i> Leyendo archivo...';

            btnRestore.style.cursor = 'wait';
            btnRestore.disabled = true;

            if (loading) {
                loading.style.display = 'flex';
            }

            try {

                console.log(
                    '=========================================='
                );

                console.log(
                    '📦 Iniciando restauración'
                );

                console.log(
                    'Archivo:',
                    archivoSql.name
                );

                console.log(
                    'Tamaño:',
                    archivoSql.size,
                    'bytes'
                );

                console.log(
                    '=========================================='
                );

                // =================================================
                // LEER ARCHIVO COMO BASE64
                // =================================================

                const base64Content = await new Promise(
                    function (resolve, reject) {

                        const reader = new FileReader();

                        reader.onload = function () {
                            resolve(reader.result);
                        };

                        reader.onerror = function (error) {
                            reject(error);
                        };

                        reader.readAsDataURL(archivoSql);

                    }
                );

                console.log(
                    '✅ Archivo convertido a Base64'
                );

                btnRestore.innerHTML =
                    '<i class="fas fa-spinner fa-spin"></i> Restaurando...';

                // =================================================
                // ENVIAR AL SERVIDOR
                // =================================================

                const response = await fetch(
                    '/parametros/restore',
                    {
                        method: 'POST',

                        headers: {
                            'Content-Type': 'application/json'
                        },

                        credentials: 'include',

                        body: JSON.stringify({
                            backupBase64: base64Content,
                            nombreArchivo: archivoSql.name
                        })
                    }
                );

                console.log(
                    'HTTP:',
                    response.status
                );

                const responseText = await response.text();

                console.log(
                    'Respuesta del servidor:',
                    responseText
                );

                // =================================================
                // CONVERTIR RESPUESTA A JSON
                // =================================================

                let data;

                try {

                    data = JSON.parse(responseText);

                } catch (errorJson) {

                    throw new Error(
                        'El servidor no devolvió JSON.\n\n' +
                        responseText.substring(0, 500)
                    );

                }

                // =================================================
                // ERROR HTTP
                // =================================================

                if (!response.ok) {

                    throw new Error(
                        data.mensaje ||
                        data.message ||
                        `Error HTTP ${response.status}`
                    );

                }

                // =================================================
                // RESTAURACIÓN EXITOSA
                // =================================================

                if (
                    data.ok === true ||
                    data.success === true
                ) {

                    alert(
                        '✅ ' +
                        (
                            data.mensaje ||
                            data.message ||
                            'Base de datos restaurada correctamente.'
                        )
                    );

                    setTimeout(function () {
                        window.location.reload();
                    }, 1500);

                    return;
                }

                // =================================================
                // SERVIDOR RECHAZÓ LA RESTAURACIÓN
                // =================================================

                throw new Error(
                    data.mensaje ||
                    data.message ||
                    'El servidor rechazó la restauración.'
                );

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

                if (loading) {
                    loading.style.display = 'none';
                }

                fileRestore.value = '';

                btnRestore.innerHTML = originalHTML;

                btnRestore.style.cursor = 'pointer';

                btnRestore.disabled = false;

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

    console.log(
        '✅ Sidebar inicializado correctamente'
    );

});