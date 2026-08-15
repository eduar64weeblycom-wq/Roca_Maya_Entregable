// ============================================================
// services/excel.service.js
// Servicio para generar archivos Excel y CSV
// ============================================================
const xl = require('excel4node');
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

// Asegúrate de exportar todas las funciones juntas al final del archivo:
module.exports = {
  generarExcelPacientes,
  generarCSVPacientes,
  generarExcelMedicamentos,
  generarExcelPreclinica
};