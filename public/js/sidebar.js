// ============================================================
// SIDEBAR - COMPORTAMIENTO COMPLETO Y MEJORADO
// ============================================================

document.addEventListener('DOMContentLoaded', function() {
    console.log(' Sidebar iniciado correctamente');
    
    // ============================================================
    // 1. LÓGICA DEL MENÚ LATERAL (SIDEBAR)
    // ============================================================
    const sidebarModal = document.getElementById('sidebarModal');
    const modalOverlay = document.getElementById('modalOverlay');
    const menuToggle = document.getElementById('menuToggle');
    const closeSidebar = document.getElementById('closeSidebar');

    if (!sidebarModal || !modalOverlay || !menuToggle || !closeSidebar) {
        console.error(" Error: Elementos del menú no encontrados.");
        return;
    }

    function openMenu() {
        sidebarModal.classList.add('open');
        modalOverlay.classList.add('active');
        document.body.style.overflow = "hidden";
    }

    function closeMenu() {
        sidebarModal.classList.remove('open');
        modalOverlay.classList.remove('active');
        document.body.style.overflow = "auto";
    }

    menuToggle.addEventListener('click', openMenu);
    closeSidebar.addEventListener('click', closeMenu);
    modalOverlay.addEventListener('click', closeMenu);

    document.addEventListener('keydown', function(e) {
        if (e.key === "Escape") {
            closeMenu();
        }
    });

    // ============================================================
    // 2. CERRAR SIDEBAR AL HACER CLIC EN UN ENLACE (MEJORADO)
    // ============================================================
    const sidebarLinks = document.querySelectorAll('.sidebar-item:not(.logout-item)');
    sidebarLinks.forEach(link => {
        link.addEventListener('click', function() {
            // Si es un enlace normal (no el botón de restaurar)
            if (this.tagName === 'A' && this.id !== 'btnRestore') {
                setTimeout(() => {
                    if (sidebarModal.classList.contains('open')) {
                        closeMenu();
                    }
                }, 150);
            }
        });
    });

    // ============================================================
    // 3. LÓGICA DEL BOTÓN DE RESTAURAR BASE DE DATOS (MEJORADA)
    // ============================================================
    const btnRestore = document.getElementById('btnRestore');
    const fileRestore = document.getElementById('fileRestore');
    const loading = document.getElementById('loading');

    if (btnRestore && fileRestore) {
        // Evento para abrir el selector de archivos
        btnRestore.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            if (confirm(' ADVERTENCIA: La restauración reemplazará TODOS los datos actuales.\n\n¿Estás seguro de que deseas continuar?')) {
                fileRestore.click();
            }
        });

        // Evento cuando se selecciona un archivo
        fileRestore.addEventListener('change', async function(e) {
            const file = e.target.files[0];
            if (!file) return;

            //  Validar extensión
            if (!file.name.endsWith('.sql') && !file.name.endsWith('.SQL')) {
                alert(' Por favor, selecciona un archivo con extensión .sql');
                fileRestore.value = '';
                return;
            }

            //  Validar tamaño (máximo 50MB)
            if (file.size > 50 * 1024 * 1024) {
                alert(' El archivo es demasiado grande. El tamaño máximo permitido es 50MB.');
                fileRestore.value = '';
                return;
            }

            //  Mostrar estado de carga
            if (loading) loading.style.display = 'flex';

            // Guardar texto original del botón
            const originalHTML = btnRestore.innerHTML;
            btnRestore.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Restaurando...';
            btnRestore.style.cursor = 'wait';
            btnRestore.disabled = true;

            const formData = new FormData();
            formData.append('backup', file);

            try {
                //  RUTA CORRECTA: /parametros/restore
                const response = await fetch('/parametros/restore', {
                    method: 'POST',
                    body: formData
                });

                const data = await response.json();
                
                if (data.ok || data.success) {
                    alert('✅ ' + (data.mensaje || data.message || 'Base de datos restaurada exitosamente.'));
                    setTimeout(() => {
                        window.location.reload();
                    }, 2000);
                } else {
                    alert('❌ ' + (data.mensaje || data.message || 'Error al restaurar la base de datos.'));
                }
            } catch (err) {
                console.error(' Error al restaurar:', err);
                alert(' Error al restaurar: ' + err.message);
            } finally {
                //  Restaurar estado del botón
                if (loading) loading.style.display = 'none';
                fileRestore.value = '';
                btnRestore.innerHTML = originalHTML;
                btnRestore.style.cursor = 'pointer';
                btnRestore.disabled = false;
            }
        });
    }

    // ============================================================
    // 4. CONFIRMACIÓN PARA CERRAR SESIÓN (MEJORADO)
    // ============================================================
    const logoutLink = document.querySelector('.logout-item');
    if (logoutLink) {
        logoutLink.addEventListener('click', function(e) {
            if (!confirm('¿Estás seguro de que deseas cerrar sesión?')) {
                e.preventDefault();
            }
        });
    }

    console.log(' Sidebar inicializado correctamente');
});