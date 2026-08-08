// ============================================================
// services/excel.service.js
// Servicio para generar archivos Excel y CSV
// ============================================================
const xl = require('excel4node');

/**
 * Genera un archivo Excel con los datos de pacientes
 * @param {Array} pacientes - Lista de pacientes
 * @param {Object} res - Objeto response de Express
 */
async function generarExcelPacientes(pacientes, res) {
  try {
    console.log("📊 Generando Excel con excel4node...");

    // 1. Crear libro de Excel
    const wb = new xl.Workbook();
    const ws = wb.addWorksheet('Pacientes');

    // 2. Estilos para encabezados
    const headerStyle = wb.createStyle({
      font: {
        bold: true,
        color: '#FFFFFF',
        size: 12,
      },
      fill: {
        type: 'pattern',
        patternType: 'solid',
        bgColor: '#217346',
        fgColor: '#217346',
      },
      alignment: {
        horizontal: 'center',
        vertical: 'center',
      },
    });

    // 3. Estilos para celdas
    const cellStyle = wb.createStyle({
      alignment: {
        horizontal: 'left',
        vertical: 'center',
      },
      border: {
        left: { style: 'thin', color: '#000000' },
        right: { style: 'thin', color: '#000000' },
        top: { style: 'thin', color: '#000000' },
        bottom: { style: 'thin', color: '#000000' },
      },
    });

    // 4. Encabezados (fila 1)
    const headers = [
      'Nombres', 
      'Apellidos', 
      'Tipo Documento', 
      'Número Documento', 
      'Género', 
      'Teléfono', 
      'Correo Electrónico', 
      'Estado'
    ];
    
    headers.forEach((header, index) => {
      ws.cell(1, index + 1)
        .string(header)
        .style(headerStyle);
    });

    // 5. Datos (desde fila 2)
    pacientes.forEach((paciente, rowIndex) => {
      const row = rowIndex + 2;
      
      ws.cell(row, 1).string(paciente.NOMBRES || '').style(cellStyle);
      ws.cell(row, 2).string(paciente.APELLIDOS || '').style(cellStyle);
      ws.cell(row, 3).string(paciente.TIPO_DOCUMENTO_IDENTIDAD || '').style(cellStyle);
      ws.cell(row, 4).string(paciente.NUMERO_DOCUMENTO_IDENTIDAD || '').style(cellStyle);
      ws.cell(row, 5).string(paciente.GENERO || '').style(cellStyle);
      ws.cell(row, 6).string(paciente.TELEFONO || '').style(cellStyle);
      ws.cell(row, 7).string(paciente.CORREO_ELECTRONICO || '').style(cellStyle);
      ws.cell(row, 8).string(paciente.ESTADO || '').style(cellStyle);
    });

    // 6. Ancho de columnas
    ws.column(1).setWidth(25);
    ws.column(2).setWidth(25);
    ws.column(3).setWidth(20);
    ws.column(4).setWidth(20);
    ws.column(5).setWidth(15);
    ws.column(6).setWidth(20);
    ws.column(7).setWidth(30);
    ws.column(8).setWidth(15);

    // 7. Generar y enviar
    const fecha = new Date().toISOString().split('T')[0];
    const fileName = `Pacientes_${fecha}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);

    wb.write(fileName, res);

    console.log(`✅ Excel generado correctamente: ${pacientes.length} pacientes`);
    return true;

  } catch (error) {
    console.error("❌ Error en excel.service.js:", error);
    throw error;
  }
}

/**
 * Genera un archivo CSV con los datos de pacientes (alternativa sin dependencias)
 */
function generarCSVPacientes(pacientes, res) {
  try {
    console.log("📊 Generando archivo CSV...");

    let csvContent = '';
    const headers = [
      'Nombres', 
      'Apellidos', 
      'Tipo Documento', 
      'Número Documento', 
      'Género', 
      'Teléfono', 
      'Correo Electrónico', 
      'Estado'
    ];
    csvContent += headers.join(',') + '\n';

    pacientes.forEach(paciente => {
      const row = [
        `"${(paciente.NOMBRES || '').replace(/"/g, '""')}"`,
        `"${(paciente.APELLIDOS || '').replace(/"/g, '""')}"`,
        `"${(paciente.TIPO_DOCUMENTO_IDENTIDAD || '').replace(/"/g, '""')}"`,
        `"${(paciente.NUMERO_DOCUMENTO_IDENTIDAD || '').replace(/"/g, '""')}"`,
        `"${(paciente.GENERO || '').replace(/"/g, '""')}"`,
        `"${(paciente.TELEFONO || '').replace(/"/g, '""')}"`,
        `"${(paciente.CORREO_ELECTRONICO || '').replace(/"/g, '""')}"`,
        `"${(paciente.ESTADO || '').replace(/"/g, '""')}"`
      ];
      csvContent += row.join(',') + '\n';
    });

    // Agregar BOM para caracteres especiales (ñ, tildes)
    const csvBuffer = Buffer.from('\uFEFF' + csvContent, 'utf8');
    const fecha = new Date().toISOString().split('T')[0];

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=Pacientes_${fecha}.csv`);
    res.setHeader('Content-Length', csvBuffer.length);
    res.send(csvBuffer);

    console.log(`✅ CSV generado correctamente: ${pacientes.length} pacientes`);
    return true;

  } catch (error) {
    console.error("❌ Error en excel.service.js (CSV):", error);
    throw error;
  }
}

module.exports = {
  generarExcelPacientes,
  generarCSVPacientes
};

/**
 * Genera un archivo Excel con los datos de medicamentos
 * @param {Array} medicamentos - Lista de medicamentos
 * @param {Object} res - Objeto response de Express
 */
async function generarExcelMedicamentos(medicamentos, res) {
  try {
    console.log("📊 Generando Excel de Medicamentos...");

    const wb = new xl.Workbook();
    const ws = wb.addWorksheet('Medicamentos');

    // Estilo encabezado (verde Excel)
    const headerStyle = wb.createStyle({
      font: { bold: true, color: '#FFFFFF', size: 12 },
      fill: {
        type: 'pattern',
        patternType: 'solid',
        bgColor: '#217346',
        fgColor: '#217346',
      },
      alignment: { horizontal: 'center', vertical: 'center' },
    });

    // Estilo celdas
    const cellStyle = wb.createStyle({
      alignment: { horizontal: 'left', vertical: 'center' },
      border: {
        left: { style: 'thin', color: '#000000' },
        right: { style: 'thin', color: '#000000' },
        top: { style: 'thin', color: '#000000' },
        bottom: { style: 'thin', color: '#000000' },
      },
    });

    // Encabezados
    const headers = [
      'ID',
      'Nombre Comercial',
      'Nombre Genérico',
      'Laboratorio',
      'Lote',
      'Presentación',
      'Concentración',
      'Vía Administración',
      'Stock Actual',
      'Stock Mínimo',
      'Stock Máximo',
      'Precio Compra',
      'Precio Venta',
      'Fecha Vencimiento',
      'Requiere Receta',
      'Estado'
    ];

    headers.forEach((header, index) => {
      ws.cell(1, index + 1).string(header).style(headerStyle);
    });

    // Datos
    medicamentos.forEach((med, rowIndex) => {
      const row = rowIndex + 2;

      ws.cell(row, 1).number(med.ID_MEDICAMENTO || 0).style(cellStyle);
      ws.cell(row, 2).string(med.NOMBRE_MEDICAMENTO || '').style(cellStyle);
      ws.cell(row, 3).string(med.NOMBRE_GENERICO || '').style(cellStyle);
      ws.cell(row, 4).string(med.PROVEEDOR || '').style(cellStyle);
      ws.cell(row, 5).string(med.LOTE || '').style(cellStyle);
      ws.cell(row, 6).string(med.PRESENTACION || '').style(cellStyle);
      ws.cell(row, 7).string(med.CONCENTRACION || '').style(cellStyle);
      ws.cell(row, 8).string(med.VIA_ADMINISTRACION || '').style(cellStyle);
      ws.cell(row, 9).number(med.STOCK_ACTUAL || 0).style(cellStyle);
      ws.cell(row, 10).number(med.STOCK_MINIMO || 0).style(cellStyle);
      ws.cell(row, 11).number(med.STOCK_MAXIMO || 0).style(cellStyle);
      ws.cell(row, 12).number(parseFloat(med.PRECIO_COMPRA) || 0).style(cellStyle);
      ws.cell(row, 13).number(parseFloat(med.PRECIO_VENTA) || 0).style(cellStyle);
      ws.cell(row, 14).string(med.FECHA_VENCIMIENTO || '').style(cellStyle);
      ws.cell(row, 15).string(med.REQUIERE_RECETA ? 'Sí' : 'No').style(cellStyle);
      ws.cell(row, 16).string(med.ESTADO || '').style(cellStyle);
    });

    // Anchos de columna
    const widths = [8, 28, 25, 22, 15, 18, 18, 20, 12, 12, 12, 14, 14, 16, 15, 12];
    widths.forEach((w, i) => ws.column(i + 1).setWidth(w));

    // Enviar archivo
    const fecha = new Date().toISOString().split('T')[0];
    const fileName = `Inventario_Medicamentos_${fecha}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);

    wb.write(fileName, res);

    console.log(`✅ Excel Medicamentos generado: ${medicamentos.length} registros`);
    return true;

  } catch (error) {
    console.error("❌ Error generando Excel de Medicamentos:", error);
    throw error;
  }
}

module.exports = {
  generarExcelPacientes,
  generarCSVPacientes,
  generarExcelMedicamentos          
};