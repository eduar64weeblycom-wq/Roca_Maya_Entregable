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
    // 7. RESTAURACIÓN DE BASE DE DATOS (CON BASE64 PARA EVITAR WAF)
    // ============================================================

    const btnRestore = document.getElementById('btnRestore');
    const fileRestore = document.getElementById('fileRestore');
    const loading = document.getElementById('loading');

    let restauracionEnProceso = false;

    if (btnRestore && fileRestore) {

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

        fileRestore.addEventListener('change', async function () {
            const archivoSql = this.files && this.files[0];

            if (!archivoSql) {
                return;
            }

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

            const MAX_SIZE = 50 * 1024 * 1024; // 50 MB

            if (archivoSql.size > MAX_SIZE) {
                alert(
                    '❌ El archivo es demasiado grande.\n\n' +
                    'Tamaño máximo permitido: 50 MB.'
                );
                fileRestore.value = '';
                return;
            }

            if (archivoSql.size === 0) {
                alert('❌ El archivo seleccionado está vacío.');
                fileRestore.value = '';
                return;
            }

            restauracionEnProceso = true;

            const originalHTML = btnRestore.innerHTML;

            btnRestore.innerHTML =
                '<i class="fas fa-spinner fa-spin"></i> Restaurando...';
            btnRestore.style.cursor = 'wait';

            if ('disabled' in btnRestore) {
                btnRestore.disabled = true;
            }

            if (loading) {
                loading.style.display = 'flex';
            }

            try {
                console.log(
                    'Iniciando restauración:',
                    archivoSql.name,
                    archivoSql.size,
                    'bytes'
                );

                // Leer el archivo y pasarlo a Base64
                const base64Content = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = error => reject(error);
                    reader.readAsDataURL(archivoSql);
                });

                const response = await fetch('/parametros/upload-sql-data', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        backupBase64: base64Content,
                        fileName: archivoSql.name
                    }),
                    credentials: 'include'
                });

                const responseText = await response.text();
                console.log("Respuesta cruda del servidor:", responseText);

                let data;

                try {
                    data = JSON.parse(responseText);
                } catch (jsonError) {
                    console.error('El servidor no devolvió JSON:', responseText);
                    throw new Error(
                        'El servidor respondió esto:\n\n' + responseText.substring(0, 300)
                    );
                }

                if (!response.ok) {
                    const mensajeError =
                        data.mensaje ||
                        data.message ||
                        `Error HTTP ${response.status}`;
                    throw new Error(mensajeError);
                }

                if (data.ok === true || data.success === true) {
                    alert(
                        '✅ ' +
                        (
                            data.mensaje ||
                            data.message ||
                            'Base de datos restaurada exitosamente.'
                        )
                    );

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
                console.error('❌ Error durante la restauración:', error);
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