// ============================================================
// services/excel.service.js
// Servicio para generar archivos Excel y CSV
// ============================================================
const xl = require('excel4node');

/**
 * Genera un archivo Excel con los datos de pacientes
 */
async function generarExcelPacientes(pacientes, res) {
  try {
    const wb = new xl.Workbook();
    const ws = wb.addWorksheet('Pacientes');
    const headerStyle = wb.createStyle({
      font: { bold: true, color: '#FFFFFF', size: 12 },
      fill: { type: 'pattern', patternType: 'solid', bgColor: '#217346', fgColor: '#217346' },
      alignment: { horizontal: 'center', vertical: 'center' },
    });
    const cellStyle = wb.createStyle({ alignment: { horizontal: 'left', vertical: 'center' } });

    const headers = ['ID', 'Nombre', 'Identidad', 'Teléfono', 'Correo'];
    headers.forEach((header, index) => {
      ws.cell(1, index + 1).string(header).style(headerStyle);
    });

    if (Array.isArray(pacientes)) {
      pacientes.forEach((p, rowIndex) => {
        const row = rowIndex + 2;
        ws.cell(row, 1).number(p.ID_PACIENTE || 0).style(cellStyle);
        ws.cell(row, 2).string(p.NOMBRE || '').style(cellStyle);
        ws.cell(row, 3).string(p.IDENTIDAD || '').style(cellStyle);
        ws.cell(row, 4).string(p.TELEFONO || '').style(cellStyle);
        ws.cell(row, 5).string(p.CORREO || '').style(cellStyle);
      });
    }

    const fecha = new Date().toISOString().split('T')[0];
    const fileName = `Pacientes_${fecha}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
    wb.write(fileName, res);
    return true;
  } catch (error) {
    console.error("❌ Error generando Excel de Pacientes:", error);
    throw error;
  }
}

/**
 * Genera un archivo CSV con los datos de pacientes
 */
async function generarCSVPacientes(pacientes, res) {
  try {
    const fecha = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=Pacientes_${fecha}.csv`);
    
    let csv = 'ID,Nombre,Identidad,Telefono,Correo\n';
    if (Array.isArray(pacientes)) {
      pacientes.forEach(p => {
        csv += `${p.ID_PACIENTE || 0},"${p.NOMBRE || ''}","${p.IDENTIDAD || ''}","${p.TELEFONO || ''}","${p.CORREO || ''}"\n`;
      });
    }
    res.status(200).send(csv);
  } catch (error) {
    console.error("❌ Error generando CSV de Pacientes:", error);
    throw error;
  }
}

/**
 * Genera un archivo Excel con los datos de medicamentos
 */
async function generarExcelMedicamentos(medicamentos, res) {
  try {
    const wb = new xl.Workbook();
    const ws = wb.addWorksheet('Medicamentos');
    const headerStyle = wb.createStyle({
      font: { bold: true, color: '#FFFFFF', size: 12 },
      fill: { type: 'pattern', patternType: 'solid', bgColor: '#217346', fgColor: '#217346' },
      alignment: { horizontal: 'center', vertical: 'center' },
    });
    const cellStyle = wb.createStyle({ alignment: { horizontal: 'left', vertical: 'center' } });

    const headers = ['ID', 'Nombre', 'Descripción', 'Stock', 'Precio'];
    headers.forEach((header, index) => {
      ws.cell(1, index + 1).string(header).style(headerStyle);
    });

    if (Array.isArray(medicamentos)) {
      medicamentos.forEach((m, rowIndex) => {
        const row = rowIndex + 2;
        ws.cell(row, 1).number(m.ID_MEDICAMENTO || 0).style(cellStyle);
        ws.cell(row, 2).string(m.NOMBRE || '').style(cellStyle);
        ws.cell(row, 3).string(m.DESCRIPCION || '').style(cellStyle);
        ws.cell(row, 4).number(m.STOCK || 0).style(cellStyle);
        ws.cell(row, 5).number(parseFloat(m.PRECIO) || 0).style(cellStyle);
      });
    }

    const fecha = new Date().toISOString().split('T')[0];
    const fileName = `Medicamentos_${fecha}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
    wb.write(fileName, res);
    return true;
  } catch (error) {
    console.error("❌ Error generando Excel de Medicamentos:", error);
    throw error;
  }
}

/**
 * Genera un archivo Excel con los datos de preclínica
 * @param {Array} preclinicas - Lista de preclínicas
 * @param {Object} res - Objeto response de Express
 */
async function generarExcelPreclinica(preclinicas, res) {
  try {
    console.log("📊 Generando Excel de Preclínica...");

    const wb = new xl.Workbook();
    const ws = wb.addWorksheet('Preclinicas');

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

    const cellStyle = wb.createStyle({
      alignment: { horizontal: 'left', vertical: 'center' },
      border: {
        left: { style: 'thin', color: '#000000' },
        right: { style: 'thin', color: '#000000' },
        top: { style: 'thin', color: '#000000' },
        bottom: { style: 'thin', color: '#000000' },
      },
    });

    const headers = [
      'ID Preclínica', 'ID Cita', 'Paciente', 'Identidad', 'Teléfono', 
      'Fecha Registro', 'Temperatura', 'Presión Sistólica', 'Presión Diastólica', 
      'Frecuencia Cardíaca', 'Frecuencia Respiratoria', 'Saturación Oxígeno', 
      'Peso', 'Talla', 'IMC', 'Glucosa', 'Perímetro Abdominal', 
      'Estado General', 'Observaciones', 'Enfermera(o)', 'Estado Cita'
    ];

    headers.forEach((header, index) => {
      ws.cell(1, index + 1).string(header).style(headerStyle);
    });

    preclinicas.forEach((p, rowIndex) => {
      const row = rowIndex + 2;

      ws.cell(row, 1).number(p.ID_PRECLINICA || 0).style(cellStyle);
      ws.cell(row, 2).number(p.ID_CITA || 0).style(cellStyle);
      ws.cell(row, 3).string(p.NOMBRE_PACIENTE || '').style(cellStyle);
      ws.cell(row, 4).string(p.IDENTIDAD_PACIENTE || '').style(cellStyle);
      ws.cell(row, 5).string(p.TELEFONO || '').style(cellStyle);
      ws.cell(row, 6).string(p.FECHA_REGISTRO ? String(p.FECHA_REGISTRO) : '').style(cellStyle);
      ws.cell(row, 7).number(parseFloat(p.TEMPERATURA) || 0).style(cellStyle);
      ws.cell(row, 8).number(p.PRESION_SISTOLICA || 0).style(cellStyle);
      ws.cell(row, 9).number(p.PRESION_DIASTOLICA || 0).style(cellStyle);
      ws.cell(row, 10).number(p.FRECUENCIA_CARDIACA || 0).style(cellStyle);
      ws.cell(row, 11).number(p.FRECUENCIA_RESPIRATORIA || 0).style(cellStyle);
      ws.cell(row, 12).number(p.SATURACION_OXIGENO || 0).style(cellStyle);
      ws.cell(row, 13).number(parseFloat(p.PESO) || 0).style(cellStyle);
      ws.cell(row, 14).number(parseFloat(p.TALLA) || 0).style(cellStyle);
      ws.cell(row, 15).number(parseFloat(p.IMC) || 0).style(cellStyle);
      ws.cell(row, 16).number(parseFloat(p.GLUCOSA) || 0).style(cellStyle);
      ws.cell(row, 17).number(parseFloat(p.PERIMETRO_ABDOMINAL) || 0).style(cellStyle);
      ws.cell(row, 18).string(p.ESTADO_GENERAL || '').style(cellStyle);
      ws.cell(row, 19).string(p.OBSERVACIONES || '').style(cellStyle);
      ws.cell(row, 20).string(p.ENFERMERA || '').style(cellStyle);
      ws.cell(row, 21).string(p.ESTADO_CITA || '').style(cellStyle);
    });

    const fecha = new Date().toISOString().split('T')[0];
    const fileName = `Preclinicas_${fecha}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);

    wb.write(fileName, res);

    console.log(`✅ Excel Preclínica generado: ${preclinicas.length} registros`);
    return true;

  } catch (error) {
    console.error("❌ Error generando Excel de Preclínica:", error);
    throw error;
  }
}

module.exports = {
  generarExcelPacientes,
  generarCSVPacientes,
  generarExcelMedicamentos,
  generarExcelPreclinica
};