document.addEventListener('DOMContentLoaded', () => {
  const tabla = document.getElementById('bitacoraTable');
  const filas = tabla.querySelectorAll('tbody tr');
  const totalRegistros = document.getElementById('totalRegistros');
  const registrosMostrados = document.getElementById('registrosMostrados');
  const ultimaActualizacion = document.getElementById('ultimaActualizacion');

  const fechaDesde = document.getElementById('fechaDesde');
  const fechaHasta = document.getElementById('fechaHasta');
  const usuarioFilter = document.getElementById('usuarioFilter');
  const moduloFilter = document.getElementById('moduloFilter');
  const descripcionFilter = document.getElementById('descripcionFilter');

  const btnFiltros = document.getElementById('btnAplicarFiltros');
  const btnLimpiar = document.getElementById('btnLimpiarFiltros');
  const btnImprimir = document.getElementById('btnImprimir');
  const logoBtn = document.getElementById('logoBtn');
  
  // AGREGAR LA REFERENCIA AL BOTÓN DE PARÁMETROS
  const btnParametros = document.getElementById('btnParametros');

  totalRegistros.textContent = filas.length;
  registrosMostrados.textContent = filas.length;
  ultimaActualizacion.textContent = new Date().toLocaleString();

  // BOTÓN PARÁMETROS - AGREGAR ESTO AL PRINCIPIO
  if (btnParametros) {
    btnParametros.addEventListener('click', function() {
      window.location.href = '/bitacora/parametros';
    });
  }

  btnFiltros.addEventListener('click', () => {
    let mostrados = 0;
    const desde = fechaDesde.value ? new Date(fechaDesde.value) : null;
    const hasta = fechaHasta.value ? new Date(fechaHasta.value) : null;
    const usuario = usuarioFilter.value.toLowerCase();
    const modulo = moduloFilter.value.toLowerCase();
    const descripcion = descripcionFilter.value.toLowerCase();

    filas.forEach(fila => {
      const fechaCelda = new Date(fila.querySelector('.fecha-hora').textContent.trim());
      const usuarioCelda = fila.querySelector('.usuario').textContent.toLowerCase();
      const moduloCelda = fila.querySelector('.modulo').textContent.toLowerCase();
      const descripcionCelda = fila.querySelector('.descripcion').textContent.toLowerCase();

      const coincideFecha =
        (!desde || fechaCelda >= desde) &&
        (!hasta || fechaCelda <= hasta);
      const coincideUsuario = !usuario || usuarioCelda.includes(usuario);
      const coincideModulo = !modulo || moduloCelda.includes(modulo);
      const coincideDescripcion = !descripcion || descripcionCelda.includes(descripcion);

      if (coincideFecha && coincideUsuario && coincideModulo && coincideDescripcion) {
        fila.style.display = '';
        mostrados++;
      } else {
        fila.style.display = 'none';
      }
    });

    registrosMostrados.textContent = mostrados;
    ultimaActualizacion.textContent = new Date().toLocaleString();
  });

  btnLimpiar.addEventListener('click', () => {
    fechaDesde.value = '';
    fechaHasta.value = '';
    usuarioFilter.value = '';
    moduloFilter.value = '';
    descripcionFilter.value = '';
    filas.forEach(fila => (fila.style.display = ''));
    registrosMostrados.textContent = filas.length;
    ultimaActualizacion.textContent = new Date().toLocaleString();
  });

  btnImprimir.addEventListener('click', async () => {
    try {
        // Convertir imagen a Base64
        const logoBase64 = await imageToBase64('./logo-roca-maya.png');
        generarVentanaImpresion(logoBase64);
    } catch (error) {
        console.log('No se pudo cargar el logo, usando versión sin logo');
        generarVentanaImpresion(null);
    }
  });

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
            resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = reject;
        img.src = url;
    });
  }

  function generarVentanaImpresion(logoBase64) {
    const ventana = window.open('', '', 'width=900,height=700');
    
    ventana.document.write(`
      <html>
        <head>
          <title>Bitácora del Sistema</title>
          <style>
            body { 
                font-family: "Times New Roman", Times, serif; 
                padding: 20px;
                margin: 0;
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
            table { 
                width: 100%; 
                border-collapse: collapse;
                font-family: "Times New Roman", Times, serif;
                margin-top: 20px;
            }
            th, td { 
                border: 1px solid #ccc; 
                padding: 8px; 
                text-align: left; 
                font-size: 12px;
            }
            th { 
                background: #f3f3f3; 
                font-weight: bold;
            }
            h2 {
                font-family: "Times New Roman", Times, serif;
                text-align: center;
                margin: 20px 0;
                color: #2c3e50;
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
          <h2>Bitácora del Sistema</h2>
          ${tabla.outerHTML}
        </body>
      </html>
    `);
    ventana.document.close();

     setTimeout(() => {
        ventana.print();
        ventana.close();
    }, 500);
  }

  logoBtn.addEventListener('click', () => {
    window.location.href = '/dashboard';
  });
});