// ============================================================
// PACIENTES - Gestión completa de pacientes
// ============================================================

console.log("pacientes.js cargado");

document.addEventListener('DOMContentLoaded', function() {
  // ---- Elementos principales ----
  const container = document.getElementById('tablaPacientesContainer');
  const totalSpan = document.getElementById('totalPacientes');
  const mostradosSpan = document.getElementById('pacientesMostrados');

  // Elementos de filtros
  const nombresFilter = document.getElementById("nombresFilter");
  const apellidosFilter = document.getElementById("apellidosFilter");
  const documentoFilter = document.getElementById("documentoFilter");
  const estadoFilter = document.getElementById("estadoFilter");
  const generoFilter = document.getElementById("generoFilter");          
  const edadDesdeFilter = document.getElementById("edadDesdeFilter");    
  const edadHastaFilter = document.getElementById("edadHastaFilter");     
  const mesFiltro = document.getElementById("mesFiltro");
  const telefonoFilter = document.getElementById("telefonoFilter");       
  const correoFilter = document.getElementById("correoFilter");          
  const btnAplicarFiltros = document.getElementById("btnAplicarFiltros");
  const btnLimpiarFiltros = document.getElementById("btnLimpiarFiltros");

  // Modal de paciente (nuevo/editar)
  const modalPaciente = document.getElementById("modalPaciente");
  const formPaciente = document.getElementById("formPaciente");
  const idPacienteInput = document.getElementById("idPaciente");
  const btnNuevoPaciente = document.getElementById("btnNuevoPaciente");
  const btnCancelar = document.getElementById("btnCancelar");
  const btnImprimir = document.getElementById("btnImprimir");
  const logoBtn = document.getElementById("logoBtn");

  // Campos del formulario
  const nombresInput = document.getElementById("nombres");
  const apellidosInput = document.getElementById("apellidos");
  const fechaNacimientoInput = document.getElementById("fechaNacimiento");
  const edadInput = document.getElementById("edad");
  const tipoEdadSelect = document.getElementById("tipoEdad");
  const generoSelect = document.getElementById("genero");
  const estadoCivilSelect = document.getElementById("estadoCivil");
  const ocupacionInput = document.getElementById("ocupacion");
  const direccionInput = document.getElementById("direccion");
  const telefonoInput = document.getElementById("telefono");
  const correoInput = document.getElementById("correo");
  const tipoDocumentoSelect = document.getElementById("tipoDocumento");
  const numeroDocumentoInput = document.getElementById("numeroDocumento");
  const rtnInput = document.getElementById("rtn");
  const nombreContactoEmergenciaInput = document.getElementById("nombreContactoEmergencia");
  const telefonoContactoEmergenciaInput = document.getElementById("telefonoContactoEmergencia");
  const parentescoContactoEmergenciaInput = document.getElementById("parentescoContactoEmergencia");
  const estadoSelect = document.getElementById("estado");
  const edadCalculadaSpan = document.getElementById("edadCalculada");
  const edadHelpText = document.getElementById("edadHelpText");

  // Historial
  const alergiasInput = document.getElementById("alergias");
  const enfermedadesCronicasInput = document.getElementById("enfermedadesCronicas");
  const cirugiasPreviasInput = document.getElementById("cirugiasPrevias");
  const medicamentosActualesInput = document.getElementById("medicamentosActuales");
  const vacunasInput = document.getElementById("vacunas");

  //  NUEVOS CAMPOS: Antecedentes Familiares y Hábitos
  const antecedentesFamiliaresInput = document.getElementById("antecedentesFamiliares");
  const habitosInput = document.getElementById("habitos");

  // Loading overlay
  const loadingEl = document.getElementById("loading");

  // ---- Utilidades ----
  function setLoading(show, text) {
    if (!loadingEl) return;
    loadingEl.style.display = show ? "flex" : "none";
    if (show) loadingEl.querySelector("div").textContent = text || "Procesando...";
  }

  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  //  Función para calcular edad detallada (años o meses)
  function calcularEdadDetallada(fechaNacimiento) {
    if (!fechaNacimiento) return { texto: "N/A", años: 0, meses: 0 };
    const nacimiento = new Date(fechaNacimiento);
    if (isNaN(nacimiento)) return { texto: "N/A", años: 0, meses: 0 };
    const hoy = new Date();
    
    let años = hoy.getFullYear() - nacimiento.getFullYear();
    let mes = hoy.getMonth() - nacimiento.getMonth();
    if (mes < 0 || (mes === 0 && hoy.getDate() < nacimiento.getDate())) años--;
    
    let mesesTotales = (hoy.getFullYear() - nacimiento.getFullYear()) * 12 + (hoy.getMonth() - nacimiento.getMonth());
    if (hoy.getDate() < nacimiento.getDate()) mesesTotales--;
    
    const anios = Math.max(0, años);
    const meses = Math.max(0, mesesTotales);

    if (anios === 0) {
      return { texto: `${meses} ${meses === 1 ? 'mes' : 'meses'}`, años: anios, meses: meses };
    }
    return { texto: `${anios} ${anios === 1 ? 'año' : 'años'}`, años: anios, meses: meses };
  }

  //  Función para obtener solo los meses
  function obtenerMeses(fechaNacimiento) {
    if (!fechaNacimiento) return 0;
    const nacimiento = new Date(fechaNacimiento);
    if (isNaN(nacimiento)) return 0;
    const hoy = new Date();
    let mesesTotales = (hoy.getFullYear() - nacimiento.getFullYear()) * 12 + (hoy.getMonth() - nacimiento.getMonth());
    if (hoy.getDate() < nacimiento.getDate()) mesesTotales--;
    return Math.max(0, mesesTotales);
  }

  //  Actualizar fecha de nacimiento desde edad
  function actualizarFechaNacimientoDesdeEdad() {
    const valor = parseInt(edadInput.value);
    const tipo = tipoEdadSelect ? tipoEdadSelect.value : "anios";

    if (tipo === "meses" && !isNaN(valor) && valor > 24) {
      mostrarFieldError(edadInput, "Para bebés, máximo 24 meses");
      edadInput.value = 24;
      return;
    }

    if (tipo === "anios" && !isNaN(valor) && valor > 120) {
      mostrarFieldError(edadInput, "Edad máxima 120 años");
      edadInput.value = 120;
      return;
    }

    limpiarFieldError(edadInput);

    if (isNaN(valor) || valor < 0) {
      fechaNacimientoInput.value = "";
      if (edadCalculadaSpan) edadCalculadaSpan.textContent = "";
      return;
    }

    const hoy = new Date();
    const fechaNac = new Date(hoy);

    if (tipo === "meses") {
      fechaNac.setMonth(hoy.getMonth() - valor);
      if (edadCalculadaSpan) {
        edadCalculadaSpan.textContent = valor === 1 ? `${valor} mes` : `${valor} meses`;
      }
    } else {
      fechaNac.setFullYear(hoy.getFullYear() - valor);
      if (edadCalculadaSpan) {
        edadCalculadaSpan.textContent = valor === 1 ? `${valor} año` : `${valor} años`;
      }
    }

    fechaNacimientoInput.value = fechaNac.toISOString().split("T")[0];
  }

  //  Actualizar edad desde fecha de nacimiento
  function actualizarEdadDesdeFechaNacimiento() {
    if (!fechaNacimientoInput.value) {
      edadInput.value = "";
      if (edadCalculadaSpan) edadCalculadaSpan.textContent = "";
      return;
    }

    const nacimiento = new Date(fechaNacimientoInput.value);
    if (isNaN(nacimiento)) return;

    //  NUEVO: aviso inmediato si la fecha elegida es futura
    const hoy0 = new Date();
    hoy0.setHours(0, 0, 0, 0);
    if (nacimiento > hoy0) {
      mostrarFieldError(fechaNacimientoInput, "La fecha de nacimiento no puede ser una fecha futura");
      edadInput.value = "";
      if (edadCalculadaSpan) edadCalculadaSpan.textContent = "";
      return;
    } else {
      limpiarFieldError(fechaNacimientoInput);
    }

    const hoy = new Date();
    let años = hoy.getFullYear() - nacimiento.getFullYear();
    let mes = hoy.getMonth() - nacimiento.getMonth();
    if (mes < 0 || (mes === 0 && hoy.getDate() < nacimiento.getDate())) años--;
    
    let mesesTotales = (hoy.getFullYear() - nacimiento.getFullYear()) * 12 + (hoy.getMonth() - nacimiento.getMonth());
    if (hoy.getDate() < nacimiento.getDate()) mesesTotales--;
    
    const anios = Math.max(0, años);
    const meses = Math.max(0, mesesTotales);

    if (anios === 0) {
      tipoEdadSelect.value = "meses";
      edadInput.value = meses;
      if (edadCalculadaSpan) {
        edadCalculadaSpan.textContent = meses === 1 ? `${meses} mes` : `${meses} meses`;
      }
    } else {
      tipoEdadSelect.value = "anios";
      edadInput.value = anios;
      if (edadCalculadaSpan) {
        edadCalculadaSpan.textContent = anios === 1 ? `${anios} año` : `${anios} años`;
      }
    }
  }

  function showToast(type, message, ms = 3500) {
    document.querySelectorAll('.pm-toast').forEach(el => el.remove());
    
    const toast = document.createElement("div");
    toast.className = `pm-toast pm-toast-${type}`;
    toast.style.position = "fixed";
    toast.style.right = "20px";
    toast.style.bottom = "20px";
    toast.style.background = type === "error" ? "#b91c1c" : "#059669";
    toast.style.color = "white";
    toast.style.padding = "10px 14px";
    toast.style.borderRadius = "8px";
    toast.style.boxShadow = "0 6px 18px rgba(0,0,0,0.15)";
    toast.style.zIndex = 2000;
    toast.style.maxWidth = "400px";
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.transition = "opacity 250ms";
      toast.style.opacity = 0;
      setTimeout(() => toast.remove(), 300);
    }, ms);
  }

  // ---- Convertir a mayúsculas automáticamente ----
  function configurarMayusculas() {
    const camposMayusculas = [
      nombresInput,
      apellidosInput,
      direccionInput,
      nombreContactoEmergenciaInput,
      alergiasInput,
      enfermedadesCronicasInput,
      cirugiasPreviasInput,
      medicamentosActualesInput,
      vacunasInput,
      antecedentesFamiliaresInput,  //  NUEVO
      habitosInput                 // NUEVO
    ];

    camposMayusculas.forEach(input => {
      if (!input) return;
      input.addEventListener('input', function() {
        if (this.value) {
          const start = this.selectionStart;
          const end = this.selectionEnd;
          const valorActual = this.value;
          const valorMayusculas = valorActual.toUpperCase();
          if (valorActual !== valorMayusculas) {
            this.value = valorMayusculas;
            this.setSelectionRange(start, end);
          }
        }
      });
    });
  }

  // ---- Validaciones robustas ----
  function limpiarSoloLetras(valor, max) {
    let limpio = valor.normalize("NFD").replace(/[^a-zA-ZñÑáéíóúÁÉÍÓÚ\s]/g, "");
    if (max) limpio = limpio.slice(0, max);
    return limpio.toUpperCase();
  }

  function limpiarSoloNumeros(valor, max) {
    let limpio = valor.replace(/\D/g, "");
    if (max) limpio = limpio.slice(0, max);
    return limpio;
  }

  function esEmailValido(email) {
    if (!email) return true;
    const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return re.test(String(email).toLowerCase());
  }

  function mostrarFieldError(inputEl, mensaje) {
    if (!inputEl) return;
    let span = inputEl.parentNode.querySelector(".field-error");
    if (!span) {
      span = document.createElement("div");
      span.className = "field-error";
      span.style.color = "#b91c1c";
      span.style.fontSize = "12px";
      span.style.marginTop = "6px";
      inputEl.parentNode.appendChild(span);
    }
    span.textContent = mensaje;
    inputEl.classList.add("input-error");
  }

  function limpiarFieldError(inputEl) {
    if (!inputEl) return;
    const span = inputEl.parentNode.querySelector(".field-error");
    if (span) span.remove();
    inputEl.classList.remove("input-error");
  }

  function configurarValidaciones() {
    const camposLetras = [
      { input: nombresInput, max: 60 },
      { input: apellidosInput, max: 60 },
      { input: ocupacionInput, max: 20 },
      { input: nombreContactoEmergenciaInput, max: 60 },
    ];
    camposLetras.forEach(({ input, max }) => {
      if (!input) return;
      input.addEventListener("input", (e) => {
        const valorLimpio = limpiarSoloLetras(e.target.value, max);
        if (e.target.value !== valorLimpio) e.target.value = valorLimpio;
        limpiarFieldError(e.target);
      });
      input.addEventListener("blur", (e) => {
        if (e.target.value.trim() === "") limpiarFieldError(e.target);
      });
    });

    const camposNumeros = [
      { input: telefonoInput, max: 15 },
      { input: numeroDocumentoInput, max: 13 },
      { input: rtnInput, max: 14 },
      { input: telefonoContactoEmergenciaInput, max: 15 },
    ];
    camposNumeros.forEach(({ input, max }) => {
      if (!input) return;
      input.addEventListener("input", (e) => {
        const valorLimpio = limpiarSoloNumeros(e.target.value, max);
        if (e.target.value !== valorLimpio) e.target.value = valorLimpio;
        limpiarFieldError(e.target);
      });
    });

    if (direccionInput) {
      direccionInput.addEventListener("input", (e) => {
        if (e.target.value.length > 255) e.target.value = e.target.value.slice(0, 255);
        e.target.style.height = 'auto';
        e.target.style.height = e.target.scrollHeight + 'px';
        limpiarFieldError(e.target);
      });
    }

    if (correoInput) {
      correoInput.addEventListener("input", (e) => {
        if (e.target.value.length > 30) e.target.value = e.target.value.slice(0, 30);
        limpiarFieldError(e.target);
      });
      correoInput.addEventListener("blur", (e) => {
        if (e.target.value && !esEmailValido(e.target.value)) {
          mostrarFieldError(e.target, "Formato de correo inválido");
        } else {
          limpiarFieldError(e.target);
        }
      });
    }

    if (telefonoInput) {
      telefonoInput.addEventListener("blur", (e) => {
        if (e.target.value && e.target.value.length < 7) {
          mostrarFieldError(e.target, "Teléfono demasiado corto (mínimo 7 dígitos)");
        } else {
          limpiarFieldError(e.target);
        }
      });
    }

    if (edadInput) {
      edadInput.addEventListener("blur", function() {
        const valor = parseInt(this.value);
        const tipo = tipoEdadSelect ? tipoEdadSelect.value : "anios";
        
        if (!isNaN(valor) && valor >= 0) {
          if (tipo === "meses" && valor > 24) {
            mostrarFieldError(this, "Para bebés, máximo 24 meses");
            this.value = 24;
          } else if (tipo === "anios" && valor > 120) {
            mostrarFieldError(this, "Edad máxima 120 años");
            this.value = 120;
          } else {
            limpiarFieldError(this);
          }
        }
      });
    }
  }

  // ---- Funciones de API ----
  async function guardarPacienteAPI(datos) {
    if (!validarFormulario()) {
      showToast("error", "Por favor corrija los campos en rojo");
      return;
    }

    const id = idPacienteInput.value;
    const url = id ? `/pacientes/api/${id}` : "/pacientes/api";
    const method = id ? "PUT" : "POST";

    try {
      setLoading(true, id ? "Actualizando paciente..." : "Creando paciente...");
      const resp = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(datos),
      });
      const data = await resp.json();
      setLoading(false);

      if (!data.success) {
        showToast("error", data.message || "Error al guardar paciente");
        if (data.code === "DUPLICATE_DOCUMENT") {
          mostrarFieldError(numeroDocumentoInput, data.message);
        }
        return;
      }

      showToast("success", `Paciente ${id ? "actualizado" : "creado"} exitosamente`);
      cerrarModal();
      setTimeout(() => location.reload(), 800);
    } catch (err) {
      setLoading(false);
      console.error("Error al guardar paciente:", err);
      showToast("error", "Error al guardar paciente");
    }
  }

  async function eliminarPacienteAPI(id, nombres, apellidos) {
    if (!confirm(`¿Está seguro de que desea eliminar al paciente ${nombres} ${apellidos}?`)) return;

    try {
      setLoading(true, "Eliminando paciente...");
      const resp = await fetch(`/pacientes/api/${id}`, { method: "DELETE" });
      const data = await resp.json();
      setLoading(false);

      if (!data.success) {
        showToast("error", data.message || "Error al eliminar paciente");
        return;
      }
      showToast("success", "Paciente eliminado exitosamente");
      setTimeout(() => location.reload(), 600);
    } catch (err) {
      setLoading(false);
      console.error("Error al eliminar paciente:", err);
      showToast("error", "Error al eliminar paciente");
    }
  }

  // ---- Funciones del modal de paciente ----
  function validarFormulario() {
    Array.from(formPaciente.querySelectorAll(".field-error")).forEach(el => el.remove());
    Array.from(formPaciente.querySelectorAll(".input-error")).forEach(el => el.classList.remove("input-error"));
    let isValid = true;

    if (!nombresInput.value.trim()) {
      mostrarFieldError(nombresInput, "Nombres es obligatorio");
      isValid = false;
    }
    if (!apellidosInput.value.trim()) {
      mostrarFieldError(apellidosInput, "Apellidos es obligatorio");
      isValid = false;
    }
    if (!numeroDocumentoInput.value.trim()) {
      mostrarFieldError(numeroDocumentoInput, "Número de documento es obligatorio");
      isValid = false;
    } else if (numeroDocumentoInput.value.length < 5) {
      mostrarFieldError(numeroDocumentoInput, "Mínimo 5 dígitos");
      isValid = false;
    }
    if (correoInput.value && !esEmailValido(correoInput.value)) {
      mostrarFieldError(correoInput, "Correo electrónico inválido");
      isValid = false;
    }
    if (telefonoInput.value && telefonoInput.value.length < 7) {
      mostrarFieldError(telefonoInput, "Teléfono demasiado corto (mínimo 7 dígitos)");
      isValid = false;
    }

    //  NUEVO: no permitir una fecha de nacimiento futura
    if (fechaNacimientoInput.value) {
      const nacimiento = new Date(fechaNacimientoInput.value + "T00:00:00");
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      if (nacimiento > hoy) {
        mostrarFieldError(fechaNacimientoInput, "La fecha de nacimiento no puede ser una fecha futura");
        isValid = false;
      }
    }

    const edadValor = parseInt(edadInput.value);
    const tipo = tipoEdadSelect ? tipoEdadSelect.value : "anios";
    if (!isNaN(edadValor) && edadValor >= 0) {
      if (tipo === "meses" && edadValor > 24) {
        mostrarFieldError(edadInput, "Máximo 24 meses para bebés");
        isValid = false;
      } else if (tipo === "anios" && edadValor > 120) {
        mostrarFieldError(edadInput, "Edad máxima 120 años");
        isValid = false;
      }
    }

    return isValid;
  }

  function cerrarModal() {
    modalPaciente.style.display = "none";
    idPacienteInput.value = "";
    Array.from(formPaciente.querySelectorAll(".input-error")).forEach(el => el.classList.remove("input-error"));
    Array.from(formPaciente.querySelectorAll(".field-error")).forEach(el => el.remove());
  }

  function abrirModalNuevo() {
    const titulo = document.getElementById("modalTitulo");
    if (titulo) titulo.textContent = "Nuevo Paciente";
    formPaciente.reset();
    idPacienteInput.value = "";
    if (edadCalculadaSpan) edadCalculadaSpan.textContent = "";
    //  Limpiar nuevos campos
    if (antecedentesFamiliaresInput) antecedentesFamiliaresInput.value = '';
    if (habitosInput) habitosInput.value = '';
    Array.from(formPaciente.querySelectorAll(".input-error")).forEach(el => el.classList.remove("input-error"));
    Array.from(formPaciente.querySelectorAll(".field-error")).forEach(el => el.remove());
    modalPaciente.style.display = "block";
  }

  async function abrirModalEditar(id) {
    try {
      setLoading(true, "Cargando paciente...");
      const resp = await fetch(`/pacientes/api/${id}`);
      const data = await resp.json();
      setLoading(false);

      if (!data.success) {
        showToast("error", data.message || "Error al cargar paciente");
        return;
      }

      const paciente = data.data;
      idPacienteInput.value = paciente.ID_PACIENTE;
      nombresInput.value = (paciente.NOMBRES || "").toUpperCase();
      apellidosInput.value = (paciente.APELLIDOS || "").toUpperCase();

      if (paciente.FECHA_NACIMIENTO) {
        const fecha = new Date(paciente.FECHA_NACIMIENTO);
        const iso = !isNaN(fecha) ? fecha.toISOString().split("T")[0] : String(paciente.FECHA_NACIMIENTO).split("T")[0];
        fechaNacimientoInput.value = iso;
        actualizarEdadDesdeFechaNacimiento();
      } else {
        fechaNacimientoInput.value = "";
        if (edadCalculadaSpan) edadCalculadaSpan.textContent = "";
        edadInput.value = "";
      }

      generoSelect.value = paciente.GENERO || "MASCULINO";
      estadoCivilSelect.value = paciente.ESTADO_CIVIL || "SOLTERO";
      ocupacionInput.value = (paciente.OCUPACION || "").toUpperCase();
      direccionInput.value = (paciente.DIRECCION || "").toUpperCase();
      telefonoInput.value = paciente.TELEFONO || "";
      correoInput.value = paciente.CORREO_ELECTRONICO || "";
      tipoDocumentoSelect.value = paciente.TIPO_DOCUMENTO_IDENTIDAD || "DNI";
      numeroDocumentoInput.value = paciente.NUMERO_DOCUMENTO_IDENTIDAD || "";
      rtnInput.value = paciente.RTN_PACIENTE || "";
      nombreContactoEmergenciaInput.value = (paciente.NOMBRE_CONTACTO_EMERGENCIA || "").toUpperCase();
      telefonoContactoEmergenciaInput.value = paciente.TELEFONO_CONTACTO_EMERGENCIA || "";
      parentescoContactoEmergenciaInput.value = (paciente.PARENTESCO_CONTACTO_EMERGENCIA || "").toUpperCase();
      estadoSelect.value = paciente.ESTADO || "ACTIVO";

      alergiasInput.value = (paciente.ALERGIAS || []).join(', ').toUpperCase();
      enfermedadesCronicasInput.value = (paciente.ENFERMEDADES_CRONICAS || []).join(', ').toUpperCase();
      cirugiasPreviasInput.value = (paciente.CIRUGIAS_PREVIAS || []).join(', ').toUpperCase();
      medicamentosActualesInput.value = (paciente.MEDICAMENTOS_ACTUALES || []).join(', ').toUpperCase();
      vacunasInput.value = (paciente.VACUNAS || []).join(', ').toUpperCase();

      //  Asignar Antecedentes Familiares y Hábitos
      if (paciente.ANTECEDENTES_FAMILIARES && Array.isArray(paciente.ANTECEDENTES_FAMILIARES)) {
        antecedentesFamiliaresInput.value = paciente.ANTECEDENTES_FAMILIARES.join(', ').toUpperCase();
      } else {
        antecedentesFamiliaresInput.value = '';
      }

      if (paciente.HABITOS && Array.isArray(paciente.HABITOS)) {
        habitosInput.value = paciente.HABITOS.join(', ').toUpperCase();
      } else {
        habitosInput.value = '';
      }

      const titulo = document.getElementById("modalTitulo");
      if (titulo) titulo.textContent = "Editar Paciente";
      modalPaciente.style.display = "block";
    } catch (err) {
      setLoading(false);
      console.error("Error al cargar paciente:", err);
      showToast("error", "Error al cargar datos del paciente");
    }
  }

  // ---- Impresión / PDF ----
  async function imageToBase64(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "Anonymous";
      img.onload = function () {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  async function generarVentanaImpresion(logoBase64) {
    const tabla = document.getElementById("pacientesTable");
    if (!tabla) {
      showToast("error", "No se encontró la tabla de pacientes.");
      return;
    }

    const ventana = window.open("", "", "width=900,height=700");
    const tablaClon = tabla.cloneNode(true);
    const filasTabla = tablaClon.querySelectorAll("tr");
    filasTabla.forEach((fila) => {
      const celdas = fila.querySelectorAll("td, th");
      if (celdas.length > 10) {
        for (let i = 10; i < celdas.length; i++) {
          celdas[i].remove();
        }
      }
    });

    const totalPacientesSpan = document.getElementById("totalPacientes");
    const totalTexto = totalPacientesSpan ? totalPacientesSpan.textContent : "";

    ventana.document.write(`
      <html>
        <head>
          <title>Pacientes - Clínicas Roca Maya</title>
          <style>
            body { font-family: "Times New Roman", Times, serif; padding: 20px; margin: 0; }
            .header { display:flex; align-items:center; margin-bottom:20px; border-bottom:2px solid #333; padding-bottom:15px; }
            .logo { height:80px; margin-right:20px; max-width:200px; object-fit:contain; }
            .logo-placeholder { height:80px; width:200px; background:#f0f0f0; border:2px dashed #ccc; display:flex; align-items:center; justify-content:center; margin-right:20px; color:#666; font-size:12px; text-align:center; }
            .company-info { flex:1; }
            .company-name { font-size:20px; font-weight:bold; color:#333; margin-bottom:5px; }
            .company-slogan { font-size:14px; color:#666; font-style:italic; }
            table { width:100%; border-collapse:collapse; font-family:"Times New Roman", Times, serif; margin-top:20px; font-size:11px; }
            th, td { border:1px solid #ccc; padding:6px 4px; text-align:left; }
            th { background:#f3f3f3; font-weight:bold; }
            h2 { font-family:"Times New Roman", Times, serif; text-align:center; margin:20px 0; color:#2c3e50; }
          </style>
        </head>
        <body>
          <div class="header">
            ${logoBase64 ? `<img src="${logoBase64}" alt="Clínicas Roca Maya" class="logo">` : '<div class="logo-placeholder">Logo no disponible</div>'}
            <div class="company-info">
                <div class="company-name">Clínicas Médicas Roca Maya</div>
                <div class="company-slogan">Tu salud es nuestra seguridad</div>
            </div>
          </div>
          <h2>Lista de Pacientes</h2>
          ${tablaClon.outerHTML}
          <div style="margin-top:20px; font-size:12px; text-align:right;">
            <strong>Total de pacientes:</strong> ${totalTexto}<br>
            <strong>Generado el:</strong> ${new Date().toLocaleString()}
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

  // ---- Filtros ----
  let filtrosActivos = {
    nombres: "", apellidos: "", documento: "", estado: "",
    genero: "", edadDesde: "", edadHasta: "", mes: "", telefono: "", correo: "" 
  };

  function aplicarFiltros() {
    const filas = document.querySelectorAll(".fila-paciente");
    let contadorMostrados = 0;
    
    let mesFiltroValor = "";
    if (filtrosActivos.mes) {
      const matchMes = filtrosActivos.mes.toString().match(/\d+/);
      mesFiltroValor = matchMes ? parseInt(matchMes[0], 10) : "";
    }

    filas.forEach((fila) => {
      const nombres = fila.querySelector(".nombres").textContent.toLowerCase();
      const apellidos = fila.querySelector(".apellidos").textContent.toLowerCase();
      const documento = fila.querySelector(".documento").textContent.toLowerCase();
      const estado = fila.querySelector(".estado-td span").textContent;
      const genero = fila.querySelector(".genero").textContent.trim().toUpperCase();
      const edadTexto = fila.querySelector(".edad").textContent.trim().toLowerCase();
      const mesesTexto = fila.querySelector(".meses").textContent.trim().toLowerCase();
      const telefono = fila.querySelector(".telefono").textContent.toLowerCase();
      const correo = fila.querySelector(".correo").textContent.toLowerCase();

      const esMeses = edadTexto.includes("mes") || mesesTexto.includes("mes");
      const matchEdad = edadTexto.match(/\d+/);
      const valorEdadNum = matchEdad ? parseInt(matchEdad[0], 10) : 0;

      const matchMeses = mesesTexto.match(/\d+/);
      const valorMesesNum = matchMeses ? parseInt(matchMeses[0], 10) : 0;

      const coincideNombres = nombres.includes(filtrosActivos.nombres.toLowerCase());
      const coincideApellidos = apellidos.includes(filtrosActivos.apellidos.toLowerCase());
      const coincideDocumento = documento.includes(filtrosActivos.documento.toLowerCase());
      const coincideEstado = !filtrosActivos.estado || estado === filtrosActivos.estado;
      const coincideGenero = !filtrosActivos.genero || genero === filtrosActivos.genero;
      
      const coincideEdadDesde = filtrosActivos.edadDesde === "" || (!esMeses && valorEdadNum >= Number(filtrosActivos.edadDesde));
      const coincideEdadHasta = filtrosActivos.edadHasta === "" || (!esMeses && valorEdadNum <= Number(filtrosActivos.edadHasta));
      
      const coincideMes = mesFiltroValor === "" || (valorMesesNum === mesFiltroValor);

      const coincideTelefono = telefono.includes(filtrosActivos.telefono.toLowerCase());
      const coincideCorreo = correo.includes(filtrosActivos.correo.toLowerCase());

      if (
        coincideNombres && coincideApellidos && coincideDocumento && coincideEstado &&
        coincideGenero && coincideEdadDesde && coincideEdadHasta && coincideMes &&
        coincideTelefono && coincideCorreo
      ) {
        fila.style.display = "";
        contadorMostrados++;
      } else {
        fila.style.display = "none";
      }
    });

    if (mostradosSpan) mostradosSpan.textContent = contadorMostrados;

    let noResults = document.querySelector(".no-results-message");
    if (contadorMostrados === 0) {
      if (!noResults) {
        const tr = document.createElement("tr");
        tr.innerHTML = '<td colspan="10" class="no-results no-results-message">No se encontraron pacientes con los filtros aplicados.</td>';
        document.querySelector("#pacientesTable tbody").appendChild(tr);
      }
    } else if (noResults) {
      noResults.remove();
    }
  }

  function limpiarFiltros() {
    if (nombresFilter) nombresFilter.value = "";
    if (apellidosFilter) apellidosFilter.value = "";
    if (documentoFilter) documentoFilter.value = "";
    if (estadoFilter) estadoFilter.value = "";
    if (generoFilter) generoFilter.value = "";
    if (edadDesdeFilter) edadDesdeFilter.value = "";
    if (edadHastaFilter) edadHastaFilter.value = "";
    if (mesFiltro) mesFiltro.value = "";
    if (telefonoFilter) telefonoFilter.value = "";
    if (correoFilter) correoFilter.value = "";
    
    filtrosActivos = {
      nombres: "", apellidos: "", documento: "", estado: "",
      genero: "", edadDesde: "", edadHasta: "", mes: "", telefono: "", correo: ""
    };
    aplicarFiltros();
    actualizarContadores();
  }

  function actualizarContadores() {
    const filas = document.querySelectorAll(".fila-paciente");
    const visibles = Array.from(filas).filter(f => f.style.display !== "none");
    if (totalSpan) totalSpan.textContent = filas.length;
    if (mostradosSpan) mostradosSpan.textContent = visibles.length;
    const fechaEl = document.getElementById("ultimaActualizacion");
    if (fechaEl) fechaEl.textContent = new Date().toLocaleString();
  }

  // ---- Event Listeners ----

  // Filtros
  if (btnAplicarFiltros) {
    btnAplicarFiltros.addEventListener('click', () => {
      filtrosActivos.nombres = nombresFilter ? nombresFilter.value : "";
      filtrosActivos.apellidos = apellidosFilter ? apellidosFilter.value : "";
      filtrosActivos.documento = documentoFilter ? documentoFilter.value : "";
      filtrosActivos.estado = estadoFilter ? estadoFilter.value : "";
      filtrosActivos.genero = generoFilter ? generoFilter.value : "";
      filtrosActivos.edadDesde = edadDesdeFilter ? edadDesdeFilter.value : "";
      filtrosActivos.edadHasta = edadHastaFilter ? edadHastaFilter.value : "";
      filtrosActivos.mes = mesFiltro ? mesFiltro.value : "";
      filtrosActivos.telefono = telefonoFilter ? telefonoFilter.value : "";
      filtrosActivos.correo = correoFilter ? correoFilter.value : "";
      aplicarFiltros();
      actualizarContadores();
    });
  }

  if (btnLimpiarFiltros) {
    btnLimpiarFiltros.addEventListener('click', limpiarFiltros);
  }

  // Modal de paciente
  if (btnNuevoPaciente) {
    btnNuevoPaciente.addEventListener('click', abrirModalNuevo);
  }

  if (btnCancelar) {
    btnCancelar.addEventListener('click', cerrarModal);
  }

  if (btnImprimir) {
    btnImprimir.addEventListener('click', async () => {
      try {
        setLoading(true, "Preparando impresión...");
        const logoBase64 = await imageToBase64("/roca-maya-oct.jpg");
        setLoading(false);
        generarVentanaImpresion(logoBase64);
      } catch (error) {
        setLoading(false);
        console.log("No se pudo cargar el logo, usando versión sin logo");
        generarVentanaImpresion(null);
      }
    });
  }

  if (logoBtn) {
    logoBtn.addEventListener('click', (e) => {
      if (logoBtn.tagName === "A") {
        e.preventDefault();
        window.location.href = logoBtn.getAttribute("href") || "/dashboard";
      } else {
        window.location.href = "/dashboard";
      }
    });
  }

  // Event listeners para la edad
  if (fechaNacimientoInput) {
    fechaNacimientoInput.addEventListener('change', actualizarEdadDesdeFechaNacimiento);
    fechaNacimientoInput.addEventListener('input', actualizarEdadDesdeFechaNacimiento);
    //  NUEVO: el propio calendario del navegador ya no deja elegir un día futuro
    fechaNacimientoInput.max = new Date().toISOString().split('T')[0];
  }

  if (edadInput) {
    edadInput.addEventListener('input', actualizarFechaNacimientoDesdeEdad);
  }

  if (tipoEdadSelect) {
    tipoEdadSelect.addEventListener('change', function() {
      if (edadInput.value) {
        actualizarFechaNacimientoDesdeEdad();
      }
    });
  }

  // Submit del formulario
  if (formPaciente) {
    let isSubmitting = false;
    
    formPaciente.addEventListener('submit', function(e) {
      e.preventDefault();
      
      if (isSubmitting) {
        console.log("⏳ Envío en progreso, ignorando...");
        return;
      }
      
      isSubmitting = true;

      const camposMayusculasSubmit = [
        nombresInput,
        apellidosInput,
        direccionInput,
        nombreContactoEmergenciaInput,
        alergiasInput,
        enfermedadesCronicasInput,
        cirugiasPreviasInput,
        medicamentosActualesInput,
        vacunasInput,
        antecedentesFamiliaresInput,  //  NUEVO
        habitosInput                 // NUEVO
      ];

      camposMayusculasSubmit.forEach(input => {
        if (input && input.value) {
          input.value = input.value.toUpperCase();
        }
      });

      const datosPaciente = {
        NOMBRES: nombresInput.value.trim(),
        APELLIDOS: apellidosInput.value.trim(),
        FECHA_NACIMIENTO: fechaNacimientoInput.value || null,
        GENERO: generoSelect.value,
        DIRECCION: direccionInput.value.trim() || null,
        TELEFONO: telefonoInput.value.trim() || null,
        CORREO_ELECTRONICO: correoInput.value.trim() || null,
        TIPO_DOCUMENTO_IDENTIDAD: tipoDocumentoSelect.value,
        NUMERO_DOCUMENTO_IDENTIDAD: numeroDocumentoInput.value.trim(),
        RTN_PACIENTE: rtnInput.value.trim() || null,
        ESTADO_CIVIL: estadoCivilSelect.value,
        OCUPACION: ocupacionInput.value.trim() || null,
        NOMBRE_CONTACTO_EMERGENCIA: nombreContactoEmergenciaInput.value.trim() || null,
        TELEFONO_CONTACTO_EMERGENCIA: telefonoContactoEmergenciaInput.value.trim() || null,
        PARENTESCO_CONTACTO_EMERGENCIA: parentescoContactoEmergenciaInput.value.trim() || null,
        ESTADO: estadoSelect.value,
        ALERGIAS: alergiasInput ? alergiasInput.value.trim() : '',
        ENFERMEDADES_CRONICAS: enfermedadesCronicasInput ? enfermedadesCronicasInput.value.trim() : '',
        CIRUGIAS_PREVIAS: cirugiasPreviasInput ? cirugiasPreviasInput.value.trim() : '',
        MEDICAMENTOS_ACTUALES: medicamentosActualesInput ? medicamentosActualesInput.value.trim() : '',
        VACUNAS: vacunasInput ? vacunasInput.value.trim() : '',
        //  NUEVOS CAMPOS
        ANTECEDENTES_FAMILIARES: antecedentesFamiliaresInput ? antecedentesFamiliaresInput.value.trim() : '',
        HABITOS: habitosInput ? habitosInput.value.trim() : ''
      };

      if (!datosPaciente.NOMBRES || !datosPaciente.APELLIDOS || !datosPaciente.NUMERO_DOCUMENTO_IDENTIDAD) {
        validarFormulario();
        isSubmitting = false;
        return;
      }
      
      guardarPacienteAPI(datosPaciente);
      
      setTimeout(() => {
        isSubmitting = false;
      }, 3000);
    });
  }

  // Cerrar modal al hacer clic fuera
  window.addEventListener('click', function(e) {
    if (e.target === modalPaciente) cerrarModal();
  });

  // ---- Delegación de eventos para Editar, Eliminar y Citas ----
  const tablaBody = document.getElementById("tablaBody");
  if (tablaBody) {
    tablaBody.addEventListener("click", function (e) {
      const target = e.target.closest("button");
      if (!target) return;

      if (target.classList.contains("btn-editar")) {
        const fila = target.closest(".fila-paciente");
        const id = parseInt(fila.getAttribute("data-id"));
        abrirModalEditar(id);
        return;
      }

      if (target.classList.contains("btn-eliminar")) {
        const fila = target.closest(".fila-paciente");
        const id = parseInt(fila.getAttribute("data-id"));
        const nombres = fila.querySelector(".nombres").textContent;
        const apellidos = fila.querySelector(".apellidos").textContent;
        eliminarPacienteAPI(id, nombres, apellidos);
        return;
      }

      if (target.classList.contains("btn-citas")) {
        console.log("Botón Citas clickeado");
        const id = target.dataset.id;
        const nombre = target.dataset.nombre;
        
        console.log("ID:", id, "Nombre:", nombre);

        if (!id) {
          console.error("ID no encontrado en el botón");
          return;
        }

        if (typeof abrirCitas === 'function') {
          console.log("Llamando a abrirCitas con:", id, nombre);
          abrirCitas(id, nombre);
        } else {
          console.error('La función abrirCitas no está definida');
          alert('Error: no se pudo abrir el módulo de citas. Asegúrate de que citas-paciente-visualizar.js esté cargado.');
        }
        return;
      }
    });
  }

  //  Configurar mayúsculas automáticas
  configurarMayusculas();

  //  Configurar validaciones
  configurarValidaciones();

  // Inicializar contadores
  actualizarContadores();

  console.log("pacientes.js inicializado correctamente");
});