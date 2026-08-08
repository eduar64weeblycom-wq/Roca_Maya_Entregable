document.addEventListener('DOMContentLoaded', function() {
    const btnGuardar = document.getElementById('btnGuardar');
    const btnBackup = document.getElementById('btnBackup');
    const btnRestore = document.getElementById('btnRestore');
    const fileRestore = document.getElementById('fileRestore');
    const loading = document.getElementById('loading');
    
    if (loading) loading.style.display = 'none';

    // Configurar validación estricta en cada input
    document.querySelectorAll('.valor-parametro').forEach(input => {
        const clave = input.getAttribute('data-clave');
        
        // Validación en tiempo real
        input.addEventListener('input', function(e) {
            validarInputEnTiempoReal(this, clave);
        });
        
        // Validación al perder foco
        input.addEventListener('blur', function() {
            validarInputAlPerderFoco(this, clave);
        });
    });

    // Función para validación en tiempo real
    function validarInputEnTiempoReal(input, clave) {
        let valor = input.value;
        
        if (esParametroNumerico(clave)) {
            input.value = valor.replace(/[^0-9]/g, '');
        } else if (esParametroTexto(clave)) {
            input.value = valor.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ\s]/g, '');
        } else if (esParametroEmail(clave)) {
            input.value = valor.replace(/[^a-zA-Z0-9@._-]/g, '');
        } else {
            input.value = valor.replace(/[^a-zA-Z0-9\s@._-]/g, '');
        }
        
        const original = input.getAttribute('data-original-value');
        if (input.value !== original) {
            input.classList.add('input-modified');
        } else {
            input.classList.remove('input-modified');
        }
    }

    // Función para validación al perder foco
    function validarInputAlPerderFoco(input, clave) {
        const valor = input.value.trim();
        
        if (valor === '') {
            if (esParametroNumerico(clave)) {
                if (clave === 'ADMIN_PREGUNTAS') {
                    input.value = '3';
                    alert('ADMIN_PREGUNTAS no puede estar vacio. Se establecio a 3.');
                } else if (clave === 'ADMIN_INTENTOS_INVALIDOS') {
                    input.value = '3';
                    alert('ADMIN_INTENTOS_INVALIDOS no puede estar vacio. Se establecio a 3.');
                } else if (clave === 'SEGURIDAD_LONGITUD') {
                    input.value = '8';
                    alert('SEGURIDAD_LONGITUD no puede estar vacio. Se establecio a 8.');
                }
            }
            input.classList.add('input-modified');
        }
        
        input.value = valor;
    }

    // BOTÓN GUARDAR - VALIDACIÓN FINAL
    btnGuardar.addEventListener('click', async function() {
        if (loading) loading.style.display = 'flex';
        
        const modificados = [];
        let tieneErrores = false;

        document.querySelectorAll('.valor-parametro.input-modified').forEach(input => {
            const clave = input.getAttribute('data-clave');
            const valor = input.value.trim();
            
            if (valor === '') {
                alert('ERROR: El parametro ' + clave + ' no puede estar vacio');
                input.focus();
                tieneErrores = true;
                return;
            }
            
            if (esParametroNumerico(clave)) {
                if (!/^\d+$/.test(valor)) {
                    alert('ERROR: ' + clave + ' debe contener solo numeros');
                    input.focus();
                    tieneErrores = true;
                    return;
                }
                
                const valorNum = parseInt(valor);
                if (valorNum < 1) {
                    alert('ERROR: ' + clave + ' debe ser al menos 1');
                    input.focus();
                    tieneErrores = true;
                    return;
                }
            }
            
            if (esParametroEmail(clave) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor)) {
                alert('ERROR: ' + clave + ' debe ser un email valido');
                input.focus();
                tieneErrores = true;
                return;
            }

            modificados.push({
                id: input.getAttribute('data-id'),
                clave: clave,
                valor: valor,
                valorOriginal: input.getAttribute('data-original-value')
            });
        });

        if (tieneErrores) {
            if (loading) loading.style.display = 'none';
            return;
        }

        if (modificados.length === 0) {
            if (loading) loading.style.display = 'none';
            alert('No hay cambios para guardar');
            return;
        }

        // ENVIAR AL SERVIDOR (Ajusta la ruta según tu app.js, ej. /parametros/guardar o /bitacora/parametros/guardar)
        try {
            const response = await fetch('/parametros/guardar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ parametros: modificados })
            });
            
            const data = await response.json();
            
            if (data && (data.success === true || data.ok === true)) {
                modificados.forEach(param => {
                    const input = document.querySelector(`[data-id="${param.id}"]`);
                    if (input) {
                        input.setAttribute('data-original-value', param.valor);
                        input.classList.remove('input-modified');
                    }
                });
                
                alert(data.message || data.mensaje || 'Cambios guardados correctamente');
                setTimeout(() => window.location.reload(), 1000);
            } else {
                alert(data.message || data.mensaje || 'Error al guardar los parámetros');
            }
            
        } catch (error) {
            console.error('Error de conexion:', error);
            alert('Error de conexion con el servidor');
        } finally {
            if (loading) loading.style.display = 'none';
        }
    });

    // BOTÓN BACKUP
    if (btnBackup) {
        btnBackup.addEventListener('click', function() {
            btnBackup.disabled = true;
            if (loading) loading.style.display = 'flex';

            window.location.href = '/bitacora/parametros/backup';

            setTimeout(() => {
                if (loading) loading.style.display = 'none';
                btnBackup.disabled = false;
            }, 4000);
        });
    }

    // BOTÓN RESTORE
    if (btnRestore && fileRestore) {
        btnRestore.addEventListener('click', () => {
            if(confirm('ADVERTENCIA: La restauración reemplazará todos los datos actuales. ¿Deseas continuar?')) {
                fileRestore.click();
            }
        });

        fileRestore.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const formData = new FormData();
            formData.append('backup', file);

            if (loading) loading.style.display = 'flex';

            try {
                // Apunta a la ruta exacta definida en tu router de backend (/restore)
                const response = await fetch('/parametros/restore', {
                    method: 'POST',
                    body: formData
                });
                const data = await response.json();
                
                alert(data.message || data.mensaje);
                if(data.success || data.ok) window.location.reload();
            } catch (err) {
                console.error('Error al restaurar:', err);
                alert('Error al restaurar: ' + err.message);
            } finally {
                if (loading) loading.style.display = 'none';
                fileRestore.value = '';
            }
        });
    }

    // FUNCIONES AUXILIARES
    function esParametroNumerico(clave) {
        const numericos = ['ADMIN_INTENTOS_INVALIDOS', 'ADMIN_TIEMPO_SESION', 'ADMIN_PREGUNTAS', 
                          'SEGURIDAD_INTENTOS', 'SEGURIDAD_LONGITUD', 'CORREO_PUERTO'];
        return numericos.includes(clave);
    }

    function esParametroTexto(clave) {
        const textos = ['ADMIN_NOMBRE_SISTEMA', 'ADMIN_PAIS', 'ADMIN_IDIOMA'];
        return textos.includes(clave);
    }

    function esParametroEmail(clave) {
        const emails = ['CORREO_USUARIO', 'CORREO_DESTINATARIO', 'ADMIN_CORREO'];
        return emails.includes(clave);
    }
});

router.post('/parametros/restore', upload.single('backup'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No se ha seleccionado ningún archivo de respaldo.' });
        }

        // Procesa tu archivo .sql aquí...

        return res.status(200).json({
            success: true,
            message: 'Base de datos restaurada correctamente.'
        });

    } catch (error) {
        console.error('Error al restaurar base de datos:', error);
        return res.status(500).json({
            success: false,
            message: 'Error en el servidor al restaurar: ' + error.message
        });
    }
});