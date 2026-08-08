// ============================================
// AUTH.JS - TODAS LAS VALIDACIONES Y FUNCIONALIDADES
// ============================================

document.addEventListener('DOMContentLoaded', function() {

    // 1. SWITCH ENTRE TABS (Login / Register)
    document.querySelectorAll('.auth-tab, .switch-form').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            const target = this.getAttribute('data-tab') || this.getAttribute('data-form');

            document.querySelectorAll('.auth-form').forEach(function(f) {
                f.classList.remove('active');
            });
            
            const targetForm = document.querySelector('#form-' + target);
            if (targetForm) {
                targetForm.classList.add('active');
            }

            document.querySelectorAll('.auth-tab').forEach(function(t) {
                t.classList.remove('active');
            });
            
            const targetTab = document.querySelector('[data-tab="' + target + '"]');
            if (targetTab) {
                targetTab.classList.add('active');
            }
        });
    });

    // 2. MOSTRAR/OCULTAR CONTRASEÑA (TODOS LOS BOTONES)
    document.querySelectorAll('.toggle-password').forEach(function(button) {
        button.addEventListener('click', function() {
            const input = this.parentElement.querySelector('.password-field');
            const icon = this.querySelector('i');
            
            if (input) {
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


    // 3. VALIDACIÓN DE NOMBRE COMPLETO (SOLO LETRAS)
    function validarNombreCompleto(input) {
        if (!input) return;
        input.value = input.value.replace(/[^A-Za-zÁÉÍÓÚáéíóúÑñÜü\s]/g, '');
    }

    function bloquearTeclasNombre(event) {
        const key = event.key;
        const teclasPermitidas = [
            'Backspace', 'Delete', 'Tab', 'Escape', 'Enter',
            'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
            'Home', 'End', 'Shift', 'Control', 'Alt', 'Meta'
        ];
        
        if (teclasPermitidas.includes(key)) return true;
        if (key === ' ') return true;
        
        const esLetra = /^[A-Za-zÁÉÍÓÚáéíóúÑñÜü]$/.test(key);
        if (!esLetra) {
            event.preventDefault();
            return false;
        }
        return true;
    }

    document.querySelectorAll('input[name="nombre_completo"]').forEach(function(input) {
        input.addEventListener('keydown', bloquearTeclasNombre);
        input.addEventListener('input', function() {
            validarNombreCompleto(this);
        });
        input.addEventListener('paste', function(e) {
            e.preventDefault();
            return false;
        });
        input.addEventListener('drop', function(e) {
            e.preventDefault();
            return false;
        });
    });

    // 4. VALIDACIÓN DE USUARIO (SIN ESPACIOS, PERMITE SÍMBOLOS)
    function validarUsuario(input) {
        if (!input) return;
        input.value = input.value.replace(/\s/g, '');
    }

    function bloquearTeclasUsuario(event) {
        const key = event.key;
        const teclasPermitidas = [
            'Backspace', 'Delete', 'Tab', 'Escape', 'Enter',
            'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
            'Home', 'End', 'Shift', 'Control', 'Alt', 'Meta'
        ];
        
        if (teclasPermitidas.includes(key)) return true;
        
        if (key === ' ') {
            event.preventDefault();
            return false;
        }
        
        const esValido = /^[A-Za-z0-9@._\-+*%$#!&=?]$/.test(key);
        if (!esValido) {
            event.preventDefault();
            return false;
        }
        return true;
    }

    document.querySelectorAll('input[name="usuario"], input[name="nombre_usuario"]').forEach(function(input) {
        input.addEventListener('keydown', bloquearTeclasUsuario);
        input.addEventListener('input', function() {
            validarUsuario(this);
        });
        input.addEventListener('paste', function(e) {
            e.preventDefault();
            return false;
        });
        input.addEventListener('drop', function(e) {
            e.preventDefault();
            return false;
        });
    });

    // 5. VALIDACIÓN DE CORREO ELECTRÓNICO
    function validarEmail(input) {
        if (!input) return;
        input.value = input.value.replace(/[^A-Za-zÁÉÍÓÚáéíóúÑñÜü0-9@._-]/g, '');
    }

    document.querySelectorAll('input[type="email"]').forEach(function(input) {
        input.addEventListener('input', function() {
            validarEmail(this);
        });
    });


    // 6. VALIDACIÓN DE CONTRASEÑAS (SOLO REGISTRO)
    const registerForm = document.getElementById('form-register');
    if (registerForm) {
        registerForm.addEventListener('submit', function(e) {
            const pwd = this.querySelector('input[name="contrasena"]');
            const confirm = this.querySelector('input[name="confirm_contrasena"]');
            
            if (!pwd || !confirm) {
                e.preventDefault();
                alert(' Error: Campos de contraseña no encontrados');
                return false;
            }
            
            if (pwd.value !== confirm.value) {
                e.preventDefault();
                alert(' Las contraseñas no coinciden');
                return false;
            }

            if (pwd.value.length < 9) {
                e.preventDefault();
                alert(' La contraseña debe tener mínimo 9 caracteres');
                return false;
            }
            
            if (pwd.value.length > 15) {
                e.preventDefault();
                alert(' La contraseña debe tener máximo 15 caracteres');
                return false;
            }

            return true;
        });
    }

    // 7. VALIDACIÓN DE CONTRASEÑA EN TIEMPO REAL (SOLO SI EXISTEN LOS ELEMENTOS)
    // Verificar si existen los elementos de fortaleza de contraseña
    const passwordInput = document.querySelector('input[name="contrasena"], input[name="pass1"]');
    const passwordStrength = document.getElementById('passwordStrength');
    const passwordHelp = document.getElementById('passwordHelp');

    if (passwordInput && passwordStrength && passwordHelp) {
        function checkPasswordStrength(password) {
            let strength = 0;
            let messages = [];
            
            // Validar longitud (9-15 caracteres)
            if (password.length >= 9 && password.length <= 15) {
                strength++;
            } else if (password.length > 0) {
                if (password.length < 9) {
                    messages.push(' Mínimo 9 caracteres');
                } else if (password.length > 15) {
                    messages.push(' Máximo 15 caracteres');
                }
            } else {
                messages.push(' Mínimo 9 caracteres');
            }
            
            if (/[A-Za-z]/.test(password)) {
                strength++;
            } else {
                messages.push(' Debe contener letras');
            }
            
            if (/\d/.test(password)) {
                strength++;
            } else {
                messages.push(' Debe contener números');
            }
            
            if (/[@$!%*#?&]/.test(password)) {
                strength++;
            } else {
                messages.push(' Debe contener un símbolo (@$!%*#?&)');
            }
            
            let width = (strength / 4) * 100;
            passwordStrength.style.width = width + '%';
            
            if (strength === 4) {
                passwordStrength.className = 'progress-bar bg-success';
                passwordHelp.innerHTML = ' Contraseña segura (9-15 caracteres)';
            } else if (strength >= 2) {
                passwordStrength.className = 'progress-bar bg-warning';
                passwordHelp.innerHTML = ' ' + messages.join(' • ');
            } else {
                passwordStrength.className = 'progress-bar bg-danger';
                passwordHelp.innerHTML = ' ' + messages.join(' • ');
            }
            
            return strength === 4;
        }

        passwordInput.addEventListener('input', function() {
            checkPasswordStrength(this.value);
        });
    }

    // 8. LOG DE INICIALIZACIÓN
    console.log(' auth.js cargado correctamente');
});