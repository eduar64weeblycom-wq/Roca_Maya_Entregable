// ============================================================
// MODAL-REGISTER.JS - Manejo del modal de registro
// ============================================================
document.addEventListener('DOMContentLoaded', function() {
    // Referencias a elementos del modal
    const modalRegister = document.getElementById('modalRegister');
    const btnCerrarRegister = document.getElementById('btnCerrarModalRegister');
    const btnCancelarRegister = document.getElementById('btnCancelarRegister');
    const formRegister = document.getElementById('formRegisterModal');
    const btnGuardar = document.getElementById('btnGuardarRegister');

    const regNombre = document.getElementById('regNombreCompleto');
    const regUsuario = document.getElementById('regUsuario');
    const regPassword = document.getElementById('regPassword');
    const regConfirm = document.getElementById('regConfirmPassword');
    const regEmail = document.getElementById('regEmail');
    const regTelefono = document.getElementById('regTelefono');   // NUEVO
    const regRol = document.getElementById('regRol');
    const regErrorContainer = document.getElementById('regErrorContainer');
    const regErrorMessage = document.getElementById('regErrorMessage');
    const passwordStrength = document.getElementById('regPasswordStrength');
    const passwordHelp = document.getElementById('regPasswordHelp');

    // Botones de mostrar/ocultar contraseña (dentro del modal)
    document.querySelectorAll('#modalRegister .toggle-password-modal').forEach(btn => {
        btn.addEventListener('click', function() {
            const input = this.parentElement.querySelector('.password-field-modal');
            if (input) {
                const icon = this.querySelector('i');
                if (input.type === 'password') {
                    input.type = 'text';
                    icon.classList.remove('fa-eye');
                    icon.classList.add('fa-eye-slash');
                } else {
                    input.type = 'password';
                    icon.classList.remove('fa-eye-slash');
                    icon.classList.add('fa-eye');
                }
            }
        });
    });

    // ============================================================
    // VALIDACIONES EN TIEMPO REAL
    // ============================================================

    // Nombre: solo letras y espacios
    regNombre.addEventListener('input', function() {
        this.value = this.value.replace(/[^A-Za-zÁÉÍÓÚáéíóúÑñÜü\s]/g, '');
    });

    // Usuario: sin espacios y caracteres permitidos
    regUsuario.addEventListener('input', function() {
        this.value = this.value.replace(/\s/g, '');
    });

    // Fortaleza de contraseña
    function checkPasswordStrength(password) {
        let strength = 0;
        let messages = [];
        
        if (password.length >= 9 && password.length <= 15) {
            strength++;
        } else if (password.length > 0) {
            if (password.length < 9) messages.push('Mínimo 9 caracteres');
            else if (password.length > 15) messages.push('Máximo 15 caracteres');
        } else {
            messages.push('Mínimo 9 caracteres');
        }
        
        if (/[A-Za-z]/.test(password)) strength++;
        else messages.push('Debe contener letras');
        
        if (/\d/.test(password)) strength++;
        else messages.push('Debe contener números');
        
        if (/[@$!%*#?&._-]/.test(password)) strength++;
        else messages.push('Debe contener un símbolo (@$!%*#?&._-)');
        
        let width = (strength / 4) * 100;
        passwordStrength.style.width = width + '%';
        
        if (strength === 4) {
            passwordStrength.className = 'progress-bar bg-success';
            passwordHelp.innerHTML = 'Contraseña segura (9-15 caracteres)';
        } else if (strength >= 2) {
            passwordStrength.className = 'progress-bar bg-warning';
            passwordHelp.innerHTML = messages.join(' • ');
        } else {
            passwordStrength.className = 'progress-bar bg-danger';
            passwordHelp.innerHTML = messages.join(' • ');
        }
    }

    regPassword.addEventListener('input', function() {
        checkPasswordStrength(this.value);
    });

    // Confirmación de contraseña (validación en tiempo real)
    regConfirm.addEventListener('input', function() {
        if (this.value && this.value !== regPassword.value) {
            this.style.borderColor = '#dc3545';
            document.getElementById('regConfirmPasswordHelp').innerHTML = '⚠️ Las contraseñas no coinciden';
        } else {
            this.style.borderColor = '';
            document.getElementById('regConfirmPasswordHelp').innerHTML = 'Repite la contraseña para confirmar';
        }
    });

    // ============================================================
    // ENVÍO DEL FORMULARIO
    // ============================================================
    formRegister.addEventListener('submit', async function(e) {
        e.preventDefault();

        // Limpiar errores
        regErrorContainer.style.display = 'none';
        regErrorMessage.textContent = '';

        // Capturar datos
        const nombre = regNombre.value.trim();
        const usuario = regUsuario.value.trim();
        const password = regPassword.value;
        const confirm = regConfirm.value;
        const email = regEmail.value.trim();
        const telefono = regTelefono.value.trim();   // NUEVO
        const rol = regRol.value;

        // Validaciones
        if (!nombre || !usuario || !password || !confirm || !email) {
            mostrarError('Todos los campos marcados con * son obligatorios');
            return;
        }

        if (password !== confirm) {
            mostrarError('Las contraseñas no coinciden');
            return;
        }

        if (password.length < 9 || password.length > 15) {
            mostrarError('La contraseña debe tener entre 9 y 15 caracteres');
            return;
        }

        const passwordRegex = /^(?=.*[a-zA-Z])(?=.*\d)(?=.*[@$!%*#?&._-])[A-Za-z\d@$!%*#?&._-]{9,15}$/;
        if (!passwordRegex.test(password)) {
            mostrarError('La contraseña debe incluir al menos una letra, un número y un símbolo (@$!%*#?&._-)');
            return;
        }

        // Preparar datos para enviar
        const data = {
            nombre_completo: nombre,
            usuario: usuario,
            contrasena: password,
            confirm_contrasena: confirm,
            correo_electronico: email,
            id_rol: parseInt(rol),
            telefono_profesional: telefono   // NUEVO
        };

        // Deshabilitar botón
        btnGuardar.disabled = true;
        btnGuardar.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Registrando...';

        try {
            const resp = await fetch('/auth/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            const result = await resp.json();

            if (!result.success) {
                mostrarError(result.error || 'Error al registrar usuario');
                btnGuardar.disabled = false;
                btnGuardar.innerHTML = '<i class="fas fa-save"></i> Registrar Usuario';
                return;
            }

            // Éxito
            alert('✅ ' + result.message);
            cerrarModal();
            window.location.reload(); // Recargar para ver el nuevo usuario

        } catch (error) {
            console.error('Error en registro:', error);
            mostrarError('Error de conexión: ' + error.message);
            btnGuardar.disabled = false;
            btnGuardar.innerHTML = '<i class="fas fa-save"></i> Registrar Usuario';
        }
    });

    // ============================================================
    // FUNCIONES AUXILIARES
    // ============================================================
    function mostrarError(mensaje) {
        regErrorContainer.style.display = 'block';
        regErrorMessage.textContent = mensaje;
    }

    function cerrarModal() {
        modalRegister.style.display = 'none';
        formRegister.reset();
        passwordStrength.style.width = '0%';
        passwordStrength.className = 'progress-bar';
        passwordHelp.innerHTML = 'Mínimo 9 caracteres, máximo 15. Debe incluir letras, números y un símbolo (@$!%*#?&)';
        regErrorContainer.style.display = 'none';
        btnGuardar.disabled = false;
        btnGuardar.innerHTML = '<i class="fas fa-save"></i> Registrar Usuario';
    }

    // Eventos para cerrar el modal
    btnCerrarRegister.addEventListener('click', cerrarModal);
    btnCancelarRegister.addEventListener('click', cerrarModal);
    window.addEventListener('click', function(e) {
        if (e.target === modalRegister) cerrarModal();
    });

    // ============================================================
    // BOTÓN PARA GENERAR CONTRASEÑA ALEATORIA (opcional)
    // ============================================================
    // Si deseas agregar un botón para generar contraseña, puedes hacerlo aquí.
    // Ejemplo: document.getElementById('btnGeneratePasswordModal')...

    console.log('🚀 modal-register.js cargado correctamente');
});