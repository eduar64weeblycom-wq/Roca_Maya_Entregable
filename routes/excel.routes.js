// ============================================================
// RUTAS DEDICADAS PARA EXCEL - INDEPENDIENTE
// ============================================================
const express = require("express");
const router = express.Router();
const pool = require("../database/db");
const xl = require('excel4node');
const { registrarBitacora } = require("../services/bitacora.service");

// ============================================================
// RUTA DE PRUEBA - PARA VERIFICAR QUE EXCEL ROUTES FUNCIONA
// ============================================================
router.get("/test", (req, res) => {
    console.log("✅ Ruta /excel/test funcionando");
    res.json({
        success: true,
        message: "✅ Ruta de Excel funcionando correctamente",
        timestamp: new Date().toISOString(),
        rutas_disponibles: [
            "/excel/test",
            "/excel/preclinica",
            "/excel/usuarios",
            "/excel/pacientes",
            "/excel/citas",
            "/excel/especialidades",
            "/excel/bitacora",
            "/excel/historial/:idPaciente",
            "/excel/prueba-excel"
        ]
    });
});

// ============================================================
// GET /excel/preclinica -> Descargar Excel de Preclínica CON FILTROS
// ============================================================
router.get("/preclinica", async (req, res) => {
    try {
        console.log(" Generando Excel de Preclínica...");
        console.log(" Query params:", req.query);

        const usuario = req.user || null;
        const { paciente, telefono, identidad, fecha, estado } = req.query;

        // ============================================================
        // CONSULTA SQL
        // ============================================================
        let sql = `
            SELECT 
                p.ID_PRECLINICA,
                p.ID_CITA,
                p.FECHA_REGISTRO,
                p.TEMPERATURA,
                p.PRESION_SISTOLICA,
                p.PRESION_DIASTOLICA,
                p.FRECUENCIA_CARDIACA,
                p.FRECUENCIA_RESPIRATORIA,
                p.SATURACION_OXIGENO,
                p.PESO,
                p.TALLA,
                p.IMC,
                p.GLUCOSA,
                p.PERIMETRO_ABDOMINAL,
                p.ESTADO_GENERAL,
                p.OBSERVACIONES,
                u.NOMBRE_USUARIO AS ENFERMERA,
                c.ESTADO AS ESTADO_CITA,
                CONCAT(pa.NOMBRES, ' ', pa.APELLIDOS) AS NOMBRE_PACIENTE,
                pa.NUMERO_DOCUMENTO_IDENTIDAD AS IDENTIDAD_PACIENTE,
                pa.TELEFONO,
                pa.CORREO_ELECTRONICO
            FROM TBL_PRECLINICA p
            INNER JOIN TBL_CITAS c ON p.ID_CITA = c.ID_CITA
            INNER JOIN TBL_PACIENTE pa ON c.ID_PACIENTE = pa.ID_PACIENTE
            LEFT JOIN TBL_MS_USUARIO u ON p.ID_USUARIO_ENFERMERIA = u.ID_USUARIO
            WHERE 1=1
        `;

        const params = [];

        // Aplicar filtros si existen
        if (paciente) {
            sql += ` AND (CONCAT(pa.NOMBRES, ' ', pa.APELLIDOS) LIKE ? OR pa.NOMBRES LIKE ? OR pa.APELLIDOS LIKE ?)`;
            const searchTerm = `%${paciente}%`;
            params.push(searchTerm, searchTerm, searchTerm);
        }

        if (telefono) {
            sql += ` AND pa.TELEFONO LIKE ?`;
            params.push(`%${telefono}%`);
        }

        if (identidad) {
            sql += ` AND pa.NUMERO_DOCUMENTO_IDENTIDAD LIKE ?`;
            params.push(`%${identidad}%`);
        }

        if (fecha) {
            sql += ` AND DATE(c.FECHA_CITA) = ?`;
            params.push(fecha);
        }

        if (estado) {
            sql += ` AND c.ESTADO = ?`;
            params.push(estado.toUpperCase());
        }

        sql += ` ORDER BY p.FECHA_REGISTRO DESC`;

        console.log(" SQL Query:", sql);
        console.log(" Parámetros:", params);

        const [preclinicas] = await pool.query(sql, params);

        console.log(` Preclínicas encontradas: ${preclinicas.length}`);

        if (!preclinicas || preclinicas.length === 0) {
            return res.status(404).json({
                success: false,
                message: "No hay registros de preclínica con los filtros aplicados"
            });
        }

        // ============================================================
        //  GENERAR NOMBRE DEL ARCHIVO CON EL NOMBRE DEL PACIENTE
        // ============================================================
        let nombreBase = 'Preclinica';

        // Obtener el nombre del paciente del primer resultado
        if (preclinicas.length > 0 && preclinicas[0].NOMBRE_PACIENTE) {
            const nombreCompleto = preclinicas[0].NOMBRE_PACIENTE;
            
            // Verificar si todas las preclínicas son del mismo paciente
            const todosMismoPaciente = preclinicas.every(p => p.NOMBRE_PACIENTE === nombreCompleto);
            
            if (todosMismoPaciente) {
                // Usar el nombre completo del paciente
                const nombreLimpio = nombreCompleto
                    .replace(/[^a-zA-Z0-9ñÑáéíóúÁÉÍÓÚ\s]/g, '')
                    .trim()
                    .replace(/\s+/g, '_')
                    .substring(0, 50)
                    .toUpperCase();
                
                nombreBase = nombreLimpio;
                console.log(` Todos los pacientes son: ${nombreCompleto} → ${nombreLimpio}`);
            } else {
                // Múltiples pacientes diferentes
                if (paciente && paciente.length > 0) {
                    const nombreFiltro = paciente
                        .replace(/[^a-zA-Z0-9ñÑáéíóúÁÉÍÓÚ\s]/g, '')
                        .trim()
                        .replace(/\s+/g, '_')
                        .substring(0, 30)
                        .toUpperCase();
                    nombreBase = `Preclinica_${nombreFiltro}_y_otros`;
                } else {
                    nombreBase = 'Preclinica_Varios_Pacientes';
                }
                console.log(` Múltiples pacientes diferentes`);
            }
        }

        // Agregar fecha si existe filtro de fecha
        if (fecha) {
            const fechaFormateada = fecha.replace(/-/g, '');
            nombreBase += `_${fechaFormateada}`;
        }

        // Agregar fecha actual
        const fechaActual = new Date().toISOString().split('T')[0].replace(/-/g, '');
        const fileName = `${nombreBase}_${fechaActual}.xlsx`;

        console.log(` Nombre de archivo generado: ${fileName}`);

        // ============================================================
        // CREAR EXCEL
        // ============================================================
        const wb = new xl.Workbook();
        const ws = wb.addWorksheet('Preclínica');

        // Estilos
        const headerStyle = wb.createStyle({
            font: { bold: true, color: '#FFFFFF', size: 12 },
            fill: { type: 'pattern', patternType: 'solid', bgColor: '#1a3c6e', fgColor: '#1a3c6e' },
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

        const cellCenterStyle = wb.createStyle({
            alignment: { horizontal: 'center', vertical: 'center' },
            border: {
                left: { style: 'thin', color: '#000000' },
                right: { style: 'thin', color: '#000000' },
                top: { style: 'thin', color: '#000000' },
                bottom: { style: 'thin', color: '#000000' },
            },
        });

        // Encabezados
        const headers = [
            'ID Preclínica', 'ID Cita', 'Paciente', 'Identidad', 'Teléfono',
            'Fecha Registro', 'Temperatura °C', 'Presión Sist.', 'Presión Diast.',
            'FC (lpm)', 'FR (rpm)', 'Sat O₂ %', 'Peso (kg)', 'Talla (m)',
            'IMC', 'Glucosa (mg/dL)', 'Perímetro Abdominal (cm)',
            'Estado General', 'Estado Cita', 'Enfermera', 'Observaciones'
        ];

        headers.forEach((header, index) => {
            ws.cell(1, index + 1).string(header).style(headerStyle);
        });

        // Datos
        preclinicas.forEach((item, rowIndex) => {
            const row = rowIndex + 2;

            ws.cell(row, 1).number(item.ID_PRECLINICA || 0).style(cellCenterStyle);
            ws.cell(row, 2).number(item.ID_CITA || 0).style(cellCenterStyle);
            ws.cell(row, 3).string(item.NOMBRE_PACIENTE || '').style(cellStyle);
            ws.cell(row, 4).string(item.IDENTIDAD_PACIENTE || '').style(cellStyle);
            ws.cell(row, 5).string(item.TELEFONO || '').style(cellStyle);
            ws.cell(row, 6).string(item.FECHA_REGISTRO ? 
                new Date(item.FECHA_REGISTRO).toLocaleString('es-ES') : '').style(cellStyle);
            ws.cell(row, 7).number(parseFloat(item.TEMPERATURA) || 0).style(cellCenterStyle);
            ws.cell(row, 8).number(parseInt(item.PRESION_SISTOLICA) || 0).style(cellCenterStyle);
            ws.cell(row, 9).number(parseInt(item.PRESION_DIASTOLICA) || 0).style(cellCenterStyle);
            ws.cell(row, 10).number(parseInt(item.FRECUENCIA_CARDIACA) || 0).style(cellCenterStyle);
            ws.cell(row, 11).number(parseInt(item.FRECUENCIA_RESPIRATORIA) || 0).style(cellCenterStyle);
            ws.cell(row, 12).number(parseFloat(item.SATURACION_OXIGENO) || 0).style(cellCenterStyle);
            ws.cell(row, 13).number(parseFloat(item.PESO) || 0).style(cellCenterStyle);
            ws.cell(row, 14).number(parseFloat(item.TALLA) || 0).style(cellCenterStyle);
            ws.cell(row, 15).number(parseFloat(item.IMC) || 0).style(cellCenterStyle);
            ws.cell(row, 16).number(parseFloat(item.GLUCOSA) || 0).style(cellCenterStyle);
            ws.cell(row, 17).number(parseFloat(item.PERIMETRO_ABDOMINAL) || 0).style(cellCenterStyle);
            ws.cell(row, 18).string(item.ESTADO_GENERAL || '').style(cellStyle);
            ws.cell(row, 19).string(item.ESTADO_CITA || '').style(cellStyle);
            ws.cell(row, 20).string(item.ENFERMERA || '').style(cellStyle);
            ws.cell(row, 21).string((item.OBSERVACIONES || '').substring(0, 500)).style(cellStyle);
        });

        // Ancho de columnas
        const columnWidths = [14, 10, 35, 22, 18, 22, 16, 16, 16, 14, 14, 14, 14, 14, 12, 16, 20, 18, 18, 25, 45];
        columnWidths.forEach((width, index) => {
            ws.column(index + 1).setWidth(width);
        });

        // Agregar fila de total
        const totalRow = preclinicas.length + 2;
        ws.cell(totalRow, 1).string('TOTAL REGISTROS:').style({
            font: { bold: true, size: 11 },
            alignment: { horizontal: 'left', vertical: 'center' }
        });
        ws.cell(totalRow, 2).number(preclinicas.length).style({
            font: { bold: true, size: 11 },
            alignment: { horizontal: 'center', vertical: 'center' }
        });

        // ============================================================
        // ENVIAR ARCHIVO
        // ============================================================
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=${encodeURIComponent(fileName)}`);

        wb.write(fileName, res);

        console.log(` Excel de Preclínica generado correctamente: ${preclinicas.length} registros`);
        console.log(` Archivo: ${fileName}`);

        // Registrar en bitácora
        try {
            await registrarBitacora({
                usuario: req.user?.USUARIO || "SISTEMA",
                accion: "EXPORTAR_EXCEL_PRECLINICA",
                descripcion: `Exportados ${preclinicas.length} registros de preclínica a Excel. Archivo: ${fileName}`,
                modulo: "PRECLINICA",
                tabla: "TBL_PRECLINICA",
                estado: "EXITO",
                req
            });
        } catch (bitError) {
            console.error("Error registrando bitácora:", bitError);
        }

    } catch (error) {
        console.error(" Error exportando Excel de preclínica:", error);
        res.status(500).json({
            success: false,
            message: "Error al generar el archivo Excel: " + error.message
        });
    }
});
// ============================================================
// GET /excel/usuarios -> Descargar Excel de usuarios
// ============================================================
router.get("/usuarios", async (req, res) => {
    try {
        console.log(" Generando Excel de usuarios...");

        const [usuarios] = await pool.query(`
            SELECT 
                u.USUARIO,
                u.NOMBRE_USUARIO,
                r.ROL AS ROL,
                u.ESTADO,
                u.CORREO_ELECTRONICO,
                CASE WHEN u.ACTIVO_2FA = 1 THEN 'Sí' ELSE 'No' END AS ACTIVO_2FA,
                u.FECHA_ULTIMA_CONEXION
            FROM TBL_MS_USUARIO u
            INNER JOIN TBL_MS_ROLES r ON u.ID_ROL = r.ID_ROL
            ORDER BY u.ID_USUARIO
        `);

        console.log(` Usuarios encontrados: ${usuarios.length}`);

        if (!usuarios || usuarios.length === 0) {
            return res.status(404).json({
                success: false,
                message: "No hay usuarios para exportar"
            });
        }

        const wb = new xl.Workbook();
        const ws = wb.addWorksheet('Usuarios');

        const headerStyle = wb.createStyle({
            font: { bold: true, color: '#FFFFFF', size: 12 },
            fill: { type: 'pattern', patternType: 'solid', bgColor: '#217346', fgColor: '#217346' },
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

        const headers = ['Usuario', 'Nombre', 'Rol', 'Estado', 'Correo', '2FA Activado', 'Última Conexión'];

        headers.forEach((header, index) => {
            ws.cell(1, index + 1).string(header).style(headerStyle);
        });

        usuarios.forEach((usuario, rowIndex) => {
            const row = rowIndex + 2;
            ws.cell(row, 1).string(usuario.USUARIO || '').style(cellStyle);
            ws.cell(row, 2).string(usuario.NOMBRE_USUARIO || '').style(cellStyle);
            ws.cell(row, 3).string(usuario.ROL || '').style(cellStyle);
            ws.cell(row, 4).string(usuario.ESTADO || '').style(cellStyle);
            ws.cell(row, 5).string(usuario.CORREO_ELECTRONICO || '').style(cellStyle);
            ws.cell(row, 6).string(usuario.ACTIVO_2FA || 'No').style(cellStyle);
            ws.cell(row, 7).string(usuario.FECHA_ULTIMA_CONEXION ? new Date(usuario.FECHA_ULTIMA_CONEXION).toLocaleString() : 'Nunca').style(cellStyle);
        });

        ws.column(1).setWidth(20);
        ws.column(2).setWidth(30);
        ws.column(3).setWidth(20);
        ws.column(4).setWidth(15);
        ws.column(5).setWidth(30);
        ws.column(6).setWidth(18);
        ws.column(7).setWidth(25);

        // USAR NOMBRE DE VARIABLE DIFERENTE: fechaActual2 en lugar de fecha
        const fechaActual2 = new Date().toISOString().split('T')[0];
        const fileName = `Usuarios_${fechaActual2}.xlsx`;

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);

        wb.write(fileName, res);

        console.log(` Excel de usuarios generado correctamente: ${usuarios.length} usuarios`);

        try {
            await registrarBitacora({
                usuario: req.user?.nombre || "SISTEMA",
                accion: "EXPORTAR_EXCEL_USUARIOS",
                descripcion: `Exportados ${usuarios.length} usuarios a Excel`,
                modulo: "USUARIOS",
                tabla: "TBL_MS_USUARIO",
                estado: "EXITO",
                req
            });
        } catch (bitError) {
            console.error("Error registrando bitácora:", bitError);
        }

    } catch (error) {
        console.error(" Error exportando Excel de usuarios:", error);
        res.status(500).json({
            success: false,
            message: "Error al generar el archivo Excel: " + error.message
        });
    }
});
// ============================================================
// GET /excel/consultas -> Descargar Excel de consultas médicas
// ============================================================
router.get("/consultas", async (req, res) => {
    try {
        console.log(" Generando Excel de citas para consulta médica...");
        console.log(" Query params:", req.query);

        const usuario = req.user || null;
        const { paciente, telefono, identidad, fecha, tipo } = req.query;

        // ============================================================
        // CONSULTA SQL
        // ============================================================
        let sql = `
            SELECT 
                c.ID_CITA,
                c.FECHA_CITA,
                c.ESTADO,
                c.TIPO_CITA,
                c.PRIORIDAD,
                c.MOTIVO_CONSULTA,
                c.OBSERVACIONES,
                CONCAT(p.NOMBRES, ' ', p.APELLIDOS) AS NOMBRE_PACIENTE,
                p.TELEFONO,
                p.NUMERO_DOCUMENTO_IDENTIDAD,
                u.NOMBRE_USUARIO AS DOCTOR,
                pr.TEMPERATURA,
                pr.PRESION_SISTOLICA,
                pr.PRESION_DIASTOLICA,
                pr.PESO,
                pr.TALLA,
                pr.IMC,
                cm.ID_CONSULTA,
                cm.DIAGNOSTICO_PRINCIPAL,
                cm.TRATAMIENTO,
                cm.RECOMENDACIONES,
                cm.FECHA_CONSULTA
            FROM TBL_CITAS c
            INNER JOIN TBL_PACIENTE p ON c.ID_PACIENTE = p.ID_PACIENTE
            INNER JOIN TBL_MS_USUARIO u ON c.ID_DOCTOR = u.ID_USUARIO
            LEFT JOIN TBL_PRECLINICA pr ON c.ID_CITA = pr.ID_CITA
            LEFT JOIN TBL_CONSULTA_MEDICA cm ON c.ID_CITA = cm.ID_CITA
            WHERE c.ESTADO IN ('CONSULTA_MEDICA', 'PRECLINICA')
        `;

        const params = [];

        if (usuario && usuario.ROL === 'DOCTOR') {
            sql += ` AND c.ID_DOCTOR = ?`;
            params.push(usuario.ID_USUARIO);
        }

        if (paciente) {
            sql += ` AND (CONCAT(p.NOMBRES, ' ', p.APELLIDOS) LIKE ? OR p.NOMBRES LIKE ? OR p.APELLIDOS LIKE ?)`;
            const searchTerm = `%${paciente}%`;
            params.push(searchTerm, searchTerm, searchTerm);
        }

        if (telefono) {
            sql += ` AND p.TELEFONO LIKE ?`;
            params.push(`%${telefono}%`);
        }

        if (identidad) {
            sql += ` AND p.NUMERO_DOCUMENTO_IDENTIDAD LIKE ?`;
            params.push(`%${identidad}%`);
        }

        if (fecha) {
            sql += ` AND DATE(c.FECHA_CITA) = ?`;
            params.push(fecha);
        }

        if (tipo) {
            sql += ` AND c.TIPO_CITA = ?`;
            params.push(tipo);
        }

        sql += ` ORDER BY c.FECHA_CITA DESC`;

        console.log(" SQL Query:", sql);
        console.log(" Parámetros:", params);

        const [citas] = await pool.query(sql, params);

        console.log(` Citas encontradas: ${citas.length}`);

        if (!citas || citas.length === 0) {
            return res.status(404).json({
                success: false,
                message: "No hay citas en consulta médica con los filtros aplicados"
            });
        }

        // ============================================================
        // GENERAR NOMBRE DEL ARCHIVO CON EL NOMBRE DEL PACIENTE
        // ============================================================
        let nombreBase = 'Consultas';

        // Obtener el nombre del paciente del primer resultado
        if (citas.length > 0 && citas[0].NOMBRE_PACIENTE) {
            const nombreCompleto = citas[0].NOMBRE_PACIENTE;
            
            // Verificar si todas las citas son del mismo paciente
            const todosMismoPaciente = citas.every(c => c.NOMBRE_PACIENTE === nombreCompleto);
            
            if (todosMismoPaciente) {
                // Usar el nombre completo del paciente
                const nombreLimpio = nombreCompleto
                    .replace(/[^a-zA-Z0-9ñÑáéíóúÁÉÍÓÚ\s]/g, '')
                    .trim()
                    .replace(/\s+/g, '_')
                    .substring(0, 50)
                    .toUpperCase();
                
                nombreBase = nombreLimpio;
                console.log(` Todos los pacientes son: ${nombreCompleto} → ${nombreLimpio}`);
            } else {
                // Múltiples pacientes diferentes
                // Si el filtro tenía un nombre, usarlo como referencia
                if (paciente && paciente.length > 0) {
                    const nombreFiltro = paciente
                        .replace(/[^a-zA-Z0-9ñÑáéíóúÁÉÍÓÚ\s]/g, '')
                        .trim()
                        .replace(/\s+/g, '_')
                        .substring(0, 30)
                        .toUpperCase();
                    nombreBase = `Consultas_${nombreFiltro}_y_otros`;
                } else {
                    nombreBase = 'Consultas_Varios_Pacientes';
                }
                console.log(` Múltiples pacientes diferentes`);
            }
        }

        // Agregar fecha actual
        const fechaActual = new Date().toISOString().split('T')[0].replace(/-/g, '');
        const fileName = `${nombreBase}_${fechaActual}.xlsx`;

        console.log(` Nombre de archivo generado: ${fileName}`);

        // ============================================================
        // CREAR EXCEL
        // ============================================================
        const wb = new xl.Workbook();
        const ws = wb.addWorksheet('Consultas Médicas');

        // Estilos
        const headerStyle = wb.createStyle({
            font: { bold: true, color: '#FFFFFF', size: 12 },
            fill: { type: 'pattern', patternType: 'solid', bgColor: '#1a3c6e', fgColor: '#1a3c6e' },
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

        const cellCenterStyle = wb.createStyle({
            alignment: { horizontal: 'center', vertical: 'center' },
            border: {
                left: { style: 'thin', color: '#000000' },
                right: { style: 'thin', color: '#000000' },
                top: { style: 'thin', color: '#000000' },
                bottom: { style: 'thin', color: '#000000' },
            },
        });

        // Encabezados
        const headers = [
            'ID Cita', 'Paciente', 'Identidad', 'Teléfono',
            'Doctor', 'Fecha Cita', 'Estado', 'Tipo', 'Prioridad',
            'Motivo', 'Temperatura °C', 'Presión Sist.', 'Presión Diast.',
            'Peso (kg)', 'Talla (m)', 'IMC',
            'Diagnóstico', 'Tratamiento', 'Recomendaciones',
            'Fecha Consulta', 'Observaciones'
        ];

        headers.forEach((header, index) => {
            ws.cell(1, index + 1).string(header).style(headerStyle);
        });

        // Datos
        citas.forEach((c, idx) => {
            const row = idx + 2;
            ws.cell(row, 1).number(c.ID_CITA || 0).style(cellCenterStyle);
            ws.cell(row, 2).string(c.NOMBRE_PACIENTE || '').style(cellStyle);
            ws.cell(row, 3).string(c.NUMERO_DOCUMENTO_IDENTIDAD || '').style(cellStyle);
            ws.cell(row, 4).string(c.TELEFONO || '').style(cellStyle);
            ws.cell(row, 5).string(c.DOCTOR || '').style(cellStyle);
            ws.cell(row, 6).string(c.FECHA_CITA ? new Date(c.FECHA_CITA).toLocaleString('es-ES') : '').style(cellStyle);
            ws.cell(row, 7).string(c.ESTADO || '').style(cellCenterStyle);
            ws.cell(row, 8).string(c.TIPO_CITA || '').style(cellCenterStyle);
            ws.cell(row, 9).string(c.PRIORIDAD || 'NORMAL').style(cellCenterStyle);
            ws.cell(row, 10).string(c.MOTIVO_CONSULTA || '').style(cellStyle);
            ws.cell(row, 11).number(parseFloat(c.TEMPERATURA) || 0).style(cellCenterStyle);
            ws.cell(row, 12).number(parseInt(c.PRESION_SISTOLICA) || 0).style(cellCenterStyle);
            ws.cell(row, 13).number(parseInt(c.PRESION_DIASTOLICA) || 0).style(cellCenterStyle);
            ws.cell(row, 14).number(parseFloat(c.PESO) || 0).style(cellCenterStyle);
            ws.cell(row, 15).number(parseFloat(c.TALLA) || 0).style(cellCenterStyle);
            ws.cell(row, 16).number(parseFloat(c.IMC) || 0).style(cellCenterStyle);
            ws.cell(row, 17).string(c.DIAGNOSTICO_PRINCIPAL || '').style(cellStyle);
            ws.cell(row, 18).string(c.TRATAMIENTO || '').style(cellStyle);
            ws.cell(row, 19).string(c.RECOMENDACIONES || '').style(cellStyle);
            ws.cell(row, 20).string(c.FECHA_CONSULTA ? new Date(c.FECHA_CONSULTA).toLocaleString('es-ES') : '').style(cellStyle);
            ws.cell(row, 21).string(c.OBSERVACIONES || '').style(cellStyle);
        });

        // Ancho de columnas
        ws.column(1).setWidth(10);
        ws.column(2).setWidth(30);
        ws.column(3).setWidth(20);
        ws.column(4).setWidth(18);
        ws.column(5).setWidth(25);
        ws.column(6).setWidth(22);
        ws.column(7).setWidth(18);
        ws.column(8).setWidth(15);
        ws.column(9).setWidth(12);
        ws.column(10).setWidth(30);
        ws.column(11).setWidth(16);
        ws.column(12).setWidth(16);
        ws.column(13).setWidth(16);
        ws.column(14).setWidth(14);
        ws.column(15).setWidth(14);
        ws.column(16).setWidth(12);
        ws.column(17).setWidth(30);
        ws.column(18).setWidth(30);
        ws.column(19).setWidth(30);
        ws.column(20).setWidth(22);
        ws.column(21).setWidth(30);

        // Agregar fila de total
        const totalRow = citas.length + 2;
        ws.cell(totalRow, 1).string('TOTAL REGISTROS:').style({
            font: { bold: true, size: 11 },
            alignment: { horizontal: 'left', vertical: 'center' }
        });
        ws.cell(totalRow, 2).number(citas.length).style({
            font: { bold: true, size: 11 },
            alignment: { horizontal: 'center', vertical: 'center' }
        });

        // ============================================================
        // ENVIAR ARCHIVO
        // ============================================================
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=${encodeURIComponent(fileName)}`);

        wb.write(fileName, res);

        console.log(` Excel de consultas generado correctamente: ${citas.length} registros`);
        console.log(` Archivo: ${fileName}`);

        // Registrar en bitácora
        try {
            await registrarBitacora({
                usuario: req.user?.USUARIO || "SISTEMA",
                accion: "EXPORTAR_EXCEL_CONSULTAS",
                descripcion: `Exportados ${citas.length} registros de consultas a Excel. Archivo: ${fileName}`,
                modulo: "CONSULTA_MEDICA",
                tabla: "TBL_CITAS",
                estado: "EXITO",
                req
            });
        } catch (bitError) {
            console.error("Error registrando bitácora:", bitError);
        }

    } catch (error) {
        console.error(" Error exportando Excel de consultas:", error);
        res.status(500).json({
            success: false,
            message: "Error al generar el archivo Excel: " + error.message
        });
    }
});
// ============================================================
// GET /excel/bitacora -> Descargar Excel de bitácora
// ============================================================
router.get("/bitacora", async (req, res) => {
    try {
        console.log(" Generando Excel de bitácora...");

        const [registros] = await pool.query(`
            SELECT 
                DATE_FORMAT(b.FECHA_HORA, '%Y-%m-%d %H:%i:%s') AS FECHA_HORA,
                COALESCE(u.USUARIO, 'SISTEMA') AS USUARIO,
                b.ACCION,
                b.MODULO,
                b.DESCRIPCION
            FROM TBL_MS_BITACORA b
            LEFT JOIN TBL_MS_USUARIO u ON b.ID_USUARIO = u.ID_USUARIO
            ORDER BY b.FECHA_HORA DESC
            LIMIT 500
        `);

        if (!registros || registros.length === 0) {
            return res.status(404).json({
                success: false,
                message: "No hay registros de bitácora para exportar"
            });
        }

        const wb = new xl.Workbook();
        const ws = wb.addWorksheet('Bitácora');

        const headerStyle = wb.createStyle({
            font: { bold: true, color: '#FFFFFF', size: 12 },
            fill: { type: 'pattern', patternType: 'solid', bgColor: '#023047', fgColor: '#023047' },
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

        const headers = ['Fecha y Hora', 'Usuario', 'Acción', 'Módulo', 'Descripción'];

        headers.forEach((header, index) => {
            ws.cell(1, index + 1).string(header).style(headerStyle);
        });

        registros.forEach((registro, rowIndex) => {
            const row = rowIndex + 2;
            ws.cell(row, 1).string(registro.FECHA_HORA || '').style(cellStyle);
            ws.cell(row, 2).string(registro.USUARIO || '').style(cellStyle);
            ws.cell(row, 3).string(registro.ACCION || '').style(cellStyle);
            ws.cell(row, 4).string(registro.MODULO || '').style(cellStyle);
            ws.cell(row, 5).string(registro.DESCRIPCION || '').style(cellStyle);
        });

        ws.column(1).setWidth(25);
        ws.column(2).setWidth(20);
        ws.column(3).setWidth(25);
        ws.column(4).setWidth(20);
        ws.column(5).setWidth(50);

        const fechaActual4 = new Date().toISOString().split('T')[0];
        const fileName = `Bitacora_${fechaActual4}.xlsx`;

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);

        wb.write(fileName, res);

        console.log(` Excel de bitácora generado correctamente: ${registros.length} registros`);

    } catch (error) {
        console.error(" Error exportando Excel de bitácora:", error);
        res.status(500).json({
            success: false,
            message: "Error al generar el archivo Excel: " + error.message
        });
    }
});

// ============================================================
// GET /excel/citas -> Descargar Excel de citas
// ============================================================
router.get("/citas", async (req, res) => {
    try {
        console.log(" Generando Excel de citas...");

        const [citas] = await pool.query(`
            SELECT 
                c.ID_CITA,
                CONCAT(p.NOMBRES, ' ', p.APELLIDOS) AS NOMBRE_PACIENTE,
                p.TELEFONO AS TELEFONO_PACIENTE,
                p.CORREO_ELECTRONICO AS CORREO_PACIENTE,
                p.NUMERO_DOCUMENTO_IDENTIDAD AS IDENTIDAD_PACIENTE,
                u.NOMBRE_USUARIO AS NOMBRE_DOCTOR,
                c.FECHA_CITA,
                c.ESTADO,
                c.TIPO_CITA,
                c.PRIORIDAD,
                c.MOTIVO_CONSULTA,
                c.DURACION_ESTIMADA_MIN,
                c.CANAL_REGISTRO
            FROM TBL_CITAS c
            INNER JOIN TBL_PACIENTE p ON c.ID_PACIENTE = p.ID_PACIENTE
            INNER JOIN TBL_MS_USUARIO u ON c.ID_DOCTOR = u.ID_USUARIO
            WHERE c.ESTADO IN ('PROGRAMADA','CONFIRMADA','FINALIZADA','CANCELADA','NO_ASISTIO')
            ORDER BY c.FECHA_CITA DESC
            LIMIT 500
        `);

        if (!citas || citas.length === 0) {
            return res.status(404).json({
                success: false,
                message: "No hay citas para exportar"
            });
        }

        const wb = new xl.Workbook();
        const ws = wb.addWorksheet('Citas');

        const headerStyle = wb.createStyle({
            font: { bold: true, color: '#FFFFFF', size: 12 },
            fill: { type: 'pattern', patternType: 'solid', bgColor: '#023047', fgColor: '#023047' },
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
            'ID', 'Paciente', 'Teléfono', 'Correo', 'Identidad',
            'Doctor', 'Fecha', 'Estado', 'Tipo', 'Prioridad',
            'Motivo', 'Duración (min)', 'Canal'
        ];

        headers.forEach((header, index) => {
            ws.cell(1, index + 1).string(header).style(headerStyle);
        });

        citas.forEach((cita, rowIndex) => {
            const row = rowIndex + 2;
            ws.cell(row, 1).number(cita.ID_CITA).style(cellStyle);
            ws.cell(row, 2).string(cita.NOMBRE_PACIENTE || '').style(cellStyle);
            ws.cell(row, 3).string(cita.TELEFONO_PACIENTE || '').style(cellStyle);
            ws.cell(row, 4).string(cita.CORREO_PACIENTE || '').style(cellStyle);
            ws.cell(row, 5).string(cita.IDENTIDAD_PACIENTE || '').style(cellStyle);
            ws.cell(row, 6).string(cita.NOMBRE_DOCTOR || '').style(cellStyle);
            ws.cell(row, 7).string(new Date(cita.FECHA_CITA).toLocaleString('es-ES')).style(cellStyle);
            ws.cell(row, 8).string(cita.ESTADO || '').style(cellStyle);
            ws.cell(row, 9).string(cita.TIPO_CITA || '').style(cellStyle);
            ws.cell(row, 10).string(cita.PRIORIDAD || '').style(cellStyle);
            ws.cell(row, 11).string(cita.MOTIVO_CONSULTA || '').style(cellStyle);
            ws.cell(row, 12).number(cita.DURACION_ESTIMADA_MIN || 30).style(cellStyle);
            ws.cell(row, 13).string(cita.CANAL_REGISTRO || '').style(cellStyle);
        });

        ws.column(1).setWidth(8);
        ws.column(2).setWidth(30);
        ws.column(3).setWidth(18);
        ws.column(4).setWidth(30);
        ws.column(5).setWidth(20);
        ws.column(6).setWidth(25);
        ws.column(7).setWidth(22);
        ws.column(8).setWidth(15);
        ws.column(9).setWidth(15);
        ws.column(10).setWidth(12);
        ws.column(11).setWidth(35);
        ws.column(12).setWidth(15);
        ws.column(13).setWidth(15);

        const fechaActual5 = new Date().toISOString().split('T')[0];
        const fileName = `Citas_${fechaActual5}.xlsx`;

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);

        wb.write(fileName, res);

        console.log(`✅ Excel de citas generado correctamente: ${citas.length} citas`);

    } catch (error) {
        console.error("❌ Error exportando Excel de citas:", error);
        res.status(500).json({
            success: false,
            message: "Error al generar el archivo Excel: " + error.message
        });
    }
});

// ============================================================
// GET /excel/pacientes -> Descargar Excel de pacientes
// ============================================================
router.get("/pacientes", async (req, res) => {
    try {
        console.log("📊 Generando Excel de pacientes...");

        const [pacientes] = await pool.query(`
            SELECT 
                NOMBRES,
                APELLIDOS,
                TIPO_DOCUMENTO_IDENTIDAD,
                NUMERO_DOCUMENTO_IDENTIDAD,
                GENERO,
                TELEFONO,
                CORREO_ELECTRONICO,
                ESTADO
            FROM TBL_PACIENTE
            WHERE ESTADO = 'ACTIVO'
            ORDER BY APELLIDOS, NOMBRES
        `);

        console.log(`📋 Pacientes encontrados: ${pacientes.length}`);

        if (!pacientes || pacientes.length === 0) {
            return res.status(404).json({
                success: false,
                message: "No hay pacientes para exportar"
            });
        }

        const wb = new xl.Workbook();
        const ws = wb.addWorksheet('Pacientes');

        const headerStyle = wb.createStyle({
            font: { bold: true, color: '#FFFFFF', size: 12 },
            fill: { type: 'pattern', patternType: 'solid', bgColor: '#217346', fgColor: '#217346' },
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

        const headers = ['Nombres', 'Apellidos', 'Tipo Documento', 'Número Documento', 'Género', 'Teléfono', 'Correo Electrónico', 'Estado'];

        headers.forEach((header, index) => {
            ws.cell(1, index + 1).string(header).style(headerStyle);
        });

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

        ws.column(1).setWidth(25);
        ws.column(2).setWidth(25);
        ws.column(3).setWidth(20);
        ws.column(4).setWidth(20);
        ws.column(5).setWidth(15);
        ws.column(6).setWidth(20);
        ws.column(7).setWidth(30);
        ws.column(8).setWidth(15);

        const fechaActual6 = new Date().toISOString().split('T')[0];
        const fileName = `Pacientes_${fechaActual6}.xlsx`;

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);

        wb.write(fileName, res);

        console.log(`✅ Excel generado correctamente: ${pacientes.length} pacientes`);

        try {
            await registrarBitacora({
                usuario: req.user?.nombre || "SISTEMA",
                accion: "EXPORTAR_EXCEL_PACIENTES",
                descripcion: `Exportados ${pacientes.length} pacientes a Excel`,
                modulo: "PACIENTES",
                tabla: "TBL_PACIENTE",
                estado: "EXITO",
                req
            });
        } catch (bitError) {
            console.error("Error registrando bitácora:", bitError);
        }

    } catch (error) {
        console.error("❌ Error exportando Excel:", error);
        res.status(500).json({
            success: false,
            message: "Error al generar el archivo Excel: " + error.message
        });
    }
});

// ============================================================
// GET /excel/historial/:idPaciente - Exportar historial médico
// ============================================================
router.get("/historial/:idPaciente", async (req, res) => {
    try {
        const { idPaciente } = req.params;

        console.log(`📊 ========================================`);
        console.log(`📊 Generando Excel de historial médico`);
        console.log(`📊 Paciente ID: ${idPaciente}`);
        console.log(`📊 ========================================`);

        if (!idPaciente || isNaN(idPaciente) || parseInt(idPaciente) <= 0) {
            console.error(`❌ ID inválido: ${idPaciente}`);
            return res.status(400).json({
                success: false,
                message: "ID de paciente inválido"
            });
        }

        const [paciente] = await pool.query(`
            SELECT 
                p.ID_PACIENTE,
                p.NOMBRES,
                p.APELLIDOS,
                CONCAT(p.NOMBRES, ' ', p.APELLIDOS) AS NOMBRE_COMPLETO,
                p.FECHA_NACIMIENTO,
                p.GENERO,
                p.TELEFONO,
                p.CORREO_ELECTRONICO,
                p.DIRECCION,
                p.ESTADO,
                p.RTN_PACIENTE,
                p.OCUPACION,
                p.ESTADO_CIVIL,
                p.TIPO_DOCUMENTO_IDENTIDAD,
                p.NUMERO_DOCUMENTO_IDENTIDAD
            FROM TBL_PACIENTE p
            WHERE p.ID_PACIENTE = ?
        `, [idPaciente]);

        if (!paciente || paciente.length === 0) {
            console.error(`❌ Paciente no encontrado: ${idPaciente}`);
            return res.status(404).json({
                success: false,
                message: "Paciente no encontrado"
            });
        }

        const p = paciente[0];
        console.log(`✅ Paciente encontrado: ${p.NOMBRE_COMPLETO}`);

        const calcularEdad = (fecha) => {
            if (!fecha) return '';
            const nacimiento = new Date(fecha);
            const hoy = new Date();
            let edad = hoy.getFullYear() - nacimiento.getFullYear();
            const mes = hoy.getMonth() - nacimiento.getMonth();
            if (mes < 0 || (mes === 0 && hoy.getDate() < nacimiento.getDate())) edad--;
            return edad;
        };

        const [historial] = await pool.query(`
            SELECT 
                ALERGIAS,
                ENFERMEDADES_CRONICAS,
                CIRUGIAS_PREVIAS,
                MEDICAMENTOS_ACTUALES,
                ANTECEDENTES_FAMILIARES,
                HABITOS,
                VACUNAS,
                NOTAS_IMPORTANTES,
                FECHA_ACTUALIZACION
            FROM TBL_HISTORIAL_MEDICO
            WHERE ID_PACIENTE = ?
        `, [idPaciente]);

        const datosHistorial = historial && historial.length > 0 ? historial[0] : null;
        console.log(`📋 Historial: ${datosHistorial ? 'ENCONTRADO' : 'NO ENCONTRADO'}`);

        const [consultas] = await pool.query(`
            SELECT 
                cm.FECHA_CONSULTA,
                cm.MOTIVO_CONSULTA,
                cm.DIAGNOSTICO_PRINCIPAL,
                cm.CODIGO_CIE10_PRINCIPAL,
                cm.TRATAMIENTO,
                cm.RECOMENDACIONES,
                cm.TIPO_CONSULTA,
                u.NOMBRE_USUARIO AS DOCTOR
            FROM TBL_CONSULTA_MEDICA cm
            LEFT JOIN TBL_MS_USUARIO u ON cm.ID_DOCTOR = u.ID_USUARIO
            WHERE cm.ID_PACIENTE = ?
            ORDER BY cm.FECHA_CONSULTA DESC
            LIMIT 20
        `, [idPaciente]);

        console.log(`📋 Consultas encontradas: ${consultas.length}`);

        const [preclinicas] = await pool.query(`
            SELECT 
                pr.FECHA_REGISTRO,
                pr.TEMPERATURA,
                pr.PRESION_SISTOLICA,
                pr.PRESION_DIASTOLICA,
                pr.FRECUENCIA_CARDIACA,
                pr.SATURACION_OXIGENO,
                pr.PESO,
                pr.TALLA,
                pr.IMC,
                pr.GLUCOSA,
                pr.ESTADO_GENERAL,
                u.NOMBRE_USUARIO AS ENFERMERA
            FROM TBL_PRECLINICA pr
            LEFT JOIN TBL_MS_USUARIO u ON pr.ID_USUARIO_ENFERMERIA = u.ID_USUARIO
            WHERE pr.ID_CITA IN (
                SELECT c.ID_CITA FROM TBL_CITAS c WHERE c.ID_PACIENTE = ?
            )
            ORDER BY pr.FECHA_REGISTRO DESC
            LIMIT 20
        `, [idPaciente]);

        console.log(`📋 Signos vitales encontrados: ${preclinicas.length}`);

        const [medicamentos] = await pool.query(`
            SELECT 
                pr.FECHA_PRESCRIPCION,
                m.NOMBRE_MEDICAMENTO,
                pr.DOSIS,
                pr.FRECUENCIA,
                pr.DURACION,
                pr.ESTADO
            FROM TBL_PRESCRIPCION pr
            LEFT JOIN TBL_INVENTARIO_MEDICAMENTOS m ON pr.ID_MEDICAMENTO = m.ID_MEDICAMENTO
            LEFT JOIN TBL_CONSULTA_MEDICA cm ON pr.ID_CONSULTA = cm.ID_CONSULTA
            WHERE cm.ID_PACIENTE = ?
            ORDER BY pr.FECHA_PRESCRIPCION DESC
            LIMIT 20
        `, [idPaciente]);

        console.log(`📋 Medicamentos encontrados: ${medicamentos.length}`);

        const wb = new xl.Workbook();

        const titleStyle = wb.createStyle({
            font: { bold: true, color: '#FFFFFF', size: 14 },
            fill: { type: 'pattern', patternType: 'solid', bgColor: '#023047', fgColor: '#023047' },
            alignment: { horizontal: 'center', vertical: 'center' },
        });

        const headerStyle = wb.createStyle({
            font: { bold: true, color: '#FFFFFF', size: 11 },
            fill: { type: 'pattern', patternType: 'solid', bgColor: '#219ebc', fgColor: '#219ebc' },
            alignment: { horizontal: 'center', vertical: 'center' },
        });

        const labelStyle = wb.createStyle({
            font: { bold: true, size: 11, color: '#023047' },
            fill: { type: 'pattern', patternType: 'solid', bgColor: '#E8F0FE', fgColor: '#E8F0FE' },
            alignment: { horizontal: 'left', vertical: 'center' },
        });

        const cellStyle = wb.createStyle({
            alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
            border: {
                left: { style: 'thin', color: '#000000' },
                right: { style: 'thin', color: '#000000' },
                top: { style: 'thin', color: '#000000' },
                bottom: { style: 'thin', color: '#000000' },
            },
        });

        const cellCenterStyle = wb.createStyle({
            alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
            border: {
                left: { style: 'thin', color: '#000000' },
                right: { style: 'thin', color: '#000000' },
                top: { style: 'thin', color: '#000000' },
                bottom: { style: 'thin', color: '#000000' },
            },
        });

        // HOJA 1: DATOS DEL PACIENTE
        const wsPaciente = wb.addWorksheet('1. Datos Paciente');

        wsPaciente.cell(1, 1).string('HISTORIAL MÉDICO COMPLETO').style({
            font: { bold: true, size: 16, color: '#023047' },
            alignment: { horizontal: 'center' },
        });
        wsPaciente.column(1).setWidth(30);
        wsPaciente.column(2).setWidth(50);

        let row = 3;

        const infoPaciente = [
            ['ID Paciente:', p.ID_PACIENTE],
            ['Nombre Completo:', p.NOMBRE_COMPLETO || ''],
            ['Nombres:', p.NOMBRES || ''],
            ['Apellidos:', p.APELLIDOS || ''],
            ['Fecha de Nacimiento:', p.FECHA_NACIMIENTO ? new Date(p.FECHA_NACIMIENTO).toLocaleDateString('es-ES') : ''],
            ['Edad:', p.FECHA_NACIMIENTO ? `${calcularEdad(p.FECHA_NACIMIENTO)} años` : ''],
            ['Género:', p.GENERO || ''],
            ['Teléfono:', p.TELEFONO || ''],
            ['Correo Electrónico:', p.CORREO_ELECTRONICO || ''],
            ['Dirección:', p.DIRECCION || ''],
            ['RTN:', p.RTN_PACIENTE || 'N/A'],
            ['Ocupación:', p.OCUPACION || 'N/A'],
            ['Estado Civil:', p.ESTADO_CIVIL || 'N/A'],
            ['Tipo Documento:', p.TIPO_DOCUMENTO_IDENTIDAD || ''],
            ['Número Documento:', p.NUMERO_DOCUMENTO_IDENTIDAD || ''],
            ['Estado:', p.ESTADO || '']
        ];

        infoPaciente.forEach(([label, value]) => {
            wsPaciente.cell(row, 1).string(label).style(labelStyle);
            wsPaciente.cell(row, 2).string(String(value || '')).style(cellStyle);
            row++;
        });

        // HOJA 2: HISTORIAL MÉDICO
        const wsHistorial = wb.addWorksheet('2. Historial Médico');

        let rowH = 1;
        wsHistorial.cell(rowH, 1).string('HISTORIAL MÉDICO').style({
            font: { bold: true, size: 14, color: '#023047' },
            alignment: { horizontal: 'center' },
        });
        rowH += 2;

        const parseArray = (value) => {
            if (!value) return '';
            if (Array.isArray(value)) return value.join(', ');
            try {
                const parsed = JSON.parse(value);
                if (Array.isArray(parsed)) return parsed.join(', ');
                return value;
            } catch {
                return value;
            }
        };

        if (datosHistorial) {
            const camposHistorial = [
                ['Alergias:', datosHistorial.ALERGIAS],
                ['Enfermedades Crónicas:', datosHistorial.ENFERMEDADES_CRONICAS],
                ['Cirugías Previas:', datosHistorial.CIRUGIAS_PREVIAS],
                ['Medicamentos Actuales:', datosHistorial.MEDICAMENTOS_ACTUALES],
                ['Antecedentes Familiares:', datosHistorial.ANTECEDENTES_FAMILIARES],
                ['Hábitos:', datosHistorial.HABITOS],
                ['Vacunas:', datosHistorial.VACUNAS],
                ['Notas Importantes:', datosHistorial.NOTAS_IMPORTANTES],
                ['Última Actualización:', datosHistorial.FECHA_ACTUALIZACION ? new Date(datosHistorial.FECHA_ACTUALIZACION).toLocaleString('es-ES') : '']
            ];

            camposHistorial.forEach(([label, value]) => {
                wsHistorial.cell(rowH, 1).string(label).style(labelStyle);
                wsHistorial.cell(rowH, 2).string(parseArray(value)).style(cellStyle);
                rowH++;
            });
        } else {
            wsHistorial.cell(rowH, 1).string('No hay historial médico registrado para este paciente.').style(cellStyle);
        }

        wsHistorial.column(1).setWidth(30);
        wsHistorial.column(2).setWidth(60);

        // HOJA 3: CONSULTAS MÉDICAS
        const wsConsultas = wb.addWorksheet('3. Consultas Médicas');

        const headersConsulta = ['Fecha', 'Motivo', 'Diagnóstico Principal', 'CIE-10', 'Tratamiento', 'Recomendaciones', 'Tipo', 'Doctor'];
        headersConsulta.forEach((header, index) => {
            wsConsultas.cell(1, index + 1).string(header).style(headerStyle);
        });

        if (consultas && consultas.length > 0) {
            consultas.forEach((consulta, idx) => {
                const rowIdx = idx + 2;
                wsConsultas.cell(rowIdx, 1).string(consulta.FECHA_CONSULTA ? new Date(consulta.FECHA_CONSULTA).toLocaleDateString('es-ES') : '').style(cellCenterStyle);
                wsConsultas.cell(rowIdx, 2).string(consulta.MOTIVO_CONSULTA || '').style(cellStyle);
                wsConsultas.cell(rowIdx, 3).string(consulta.DIAGNOSTICO_PRINCIPAL || '').style(cellStyle);
                wsConsultas.cell(rowIdx, 4).string(consulta.CODIGO_CIE10_PRINCIPAL || '').style(cellCenterStyle);
                wsConsultas.cell(rowIdx, 5).string(consulta.TRATAMIENTO || '').style(cellStyle);
                wsConsultas.cell(rowIdx, 6).string(consulta.RECOMENDACIONES || '').style(cellStyle);
                wsConsultas.cell(rowIdx, 7).string(consulta.TIPO_CONSULTA || '').style(cellCenterStyle);
                wsConsultas.cell(rowIdx, 8).string(consulta.DOCTOR || '').style(cellStyle);
            });
        } else {
            wsConsultas.cell(2, 1).string('No hay consultas médicas registradas.').style(cellStyle);
        }

        wsConsultas.column(1).setWidth(15);
        wsConsultas.column(2).setWidth(30);
        wsConsultas.column(3).setWidth(30);
        wsConsultas.column(4).setWidth(15);
        wsConsultas.column(5).setWidth(30);
        wsConsultas.column(6).setWidth(30);
        wsConsultas.column(7).setWidth(18);
        wsConsultas.column(8).setWidth(25);

        // HOJA 4: SIGNOS VITALES
        const wsPre = wb.addWorksheet('4. Signos Vitales');

        const headersPre = ['Fecha', 'Temperatura °C', 'Presión Sist.', 'Presión Diast.', 'F.C. (lat/min)', 'Sat. O₂ %', 'Peso (kg)', 'Talla (cm)', 'IMC', 'Glucosa', 'Estado General', 'Enfermera'];
        headersPre.forEach((header, index) => {
            wsPre.cell(1, index + 1).string(header).style(headerStyle);
        });

        if (preclinicas && preclinicas.length > 0) {
            preclinicas.forEach((pre, idx) => {
                const rowIdx = idx + 2;
                wsPre.cell(rowIdx, 1).string(pre.FECHA_REGISTRO ? new Date(pre.FECHA_REGISTRO).toLocaleDateString('es-ES') : '').style(cellCenterStyle);
                wsPre.cell(rowIdx, 2).number(parseFloat(pre.TEMPERATURA) || 0).style(cellCenterStyle);
                wsPre.cell(rowIdx, 3).number(parseFloat(pre.PRESION_SISTOLICA) || 0).style(cellCenterStyle);
                wsPre.cell(rowIdx, 4).number(parseFloat(pre.PRESION_DIASTOLICA) || 0).style(cellCenterStyle);
                wsPre.cell(rowIdx, 5).number(parseFloat(pre.FRECUENCIA_CARDIACA) || 0).style(cellCenterStyle);
                wsPre.cell(rowIdx, 6).number(parseFloat(pre.SATURACION_OXIGENO) || 0).style(cellCenterStyle);
                wsPre.cell(rowIdx, 7).number(parseFloat(pre.PESO) || 0).style(cellCenterStyle);
                wsPre.cell(rowIdx, 8).number(parseFloat(pre.TALLA) || 0).style(cellCenterStyle);
                wsPre.cell(rowIdx, 9).number(parseFloat(pre.IMC) || 0).style(cellCenterStyle);
                wsPre.cell(rowIdx, 10).number(parseFloat(pre.GLUCOSA) || 0).style(cellCenterStyle);
                wsPre.cell(rowIdx, 11).string(pre.ESTADO_GENERAL || '').style(cellStyle);
                wsPre.cell(rowIdx, 12).string(pre.ENFERMERA || '').style(cellStyle);
            });
        } else {
            wsPre.cell(2, 1).string('No hay registros de signos vitales.').style(cellStyle);
        }

        wsPre.column(1).setWidth(15);
        wsPre.column(2).setWidth(15);
        wsPre.column(3).setWidth(14);
        wsPre.column(4).setWidth(14);
        wsPre.column(5).setWidth(15);
        wsPre.column(6).setWidth(12);
        wsPre.column(7).setWidth(12);
        wsPre.column(8).setWidth(12);
        wsPre.column(9).setWidth(12);
        wsPre.column(10).setWidth(12);
        wsPre.column(11).setWidth(20);
        wsPre.column(12).setWidth(25);

        // HOJA 5: MEDICAMENTOS
        const wsMed = wb.addWorksheet('5. Medicamentos');

        const headersMed = ['Fecha', 'Medicamento', 'Dosis', 'Frecuencia', 'Duración', 'Estado'];
        headersMed.forEach((header, index) => {
            wsMed.cell(1, index + 1).string(header).style(headerStyle);
        });

        if (medicamentos && medicamentos.length > 0) {
            medicamentos.forEach((med, idx) => {
                const rowIdx = idx + 2;
                wsMed.cell(rowIdx, 1).string(med.FECHA_PRESCRIPCION ? new Date(med.FECHA_PRESCRIPCION).toLocaleDateString('es-ES') : '').style(cellCenterStyle);
                wsMed.cell(rowIdx, 2).string(med.NOMBRE_MEDICAMENTO || '').style(cellStyle);
                wsMed.cell(rowIdx, 3).string(med.DOSIS || '').style(cellCenterStyle);
                wsMed.cell(rowIdx, 4).string(med.FRECUENCIA || '').style(cellCenterStyle);
                wsMed.cell(rowIdx, 5).string(med.DURACION || '').style(cellCenterStyle);
                wsMed.cell(rowIdx, 6).string(med.ESTADO || '').style(cellCenterStyle);
            });
        } else {
            wsMed.cell(2, 1).string('No hay medicamentos prescritos.').style(cellStyle);
        }

        wsMed.column(1).setWidth(15);
        wsMed.column(2).setWidth(30);
        wsMed.column(3).setWidth(15);
        wsMed.column(4).setWidth(18);
        wsMed.column(5).setWidth(15);
        wsMed.column(6).setWidth(15);

        // GENERAR Y ENVIAR
        const fechaActual7 = new Date().toISOString().split('T')[0];
        const nombreArchivo = `Historial_${p.NOMBRE_COMPLETO.replace(/\s/g, '_')}_${fechaActual7}.xlsx`;

        console.log(`📊 Enviando archivo: ${nombreArchivo}`);

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=${encodeURIComponent(nombreArchivo)}`);

        wb.write(nombreArchivo, res);

        console.log(`✅ Excel generado exitosamente: ${nombreArchivo}`);
        console.log(`   - ${consultas.length} consultas`);
        console.log(`   - ${preclinicas.length} signos vitales`);
        console.log(`   - ${medicamentos.length} medicamentos`);
        console.log(`📊 ========================================`);

    } catch (error) {
        console.error(`❌ Error exportando Excel de historial médico:`);
        console.error(`❌ Mensaje:`, error.message);
        console.error(`❌ Stack:`, error.stack);

        try {
            res.status(500).json({
                success: false,
                message: "Error al generar el archivo Excel: " + error.message
            });
        } catch (e) {
            console.error('❌ Error al enviar respuesta de error:', e);
            res.status(500).send('Error interno del servidor');
        }
    }
});

// ============================================================
// GET /excel/prueba-excel -> Excel de prueba simple
// ============================================================
router.get("/prueba-excel", (req, res) => {
    try {
        console.log("📊 Generando Excel de prueba...");

        const wb = new xl.Workbook();
        const ws = wb.addWorksheet('Prueba');

        ws.cell(1, 1).string('Prueba de Excel');
        ws.cell(2, 1).string('¡Funciona correctamente!');
        ws.cell(3, 1).string('Fecha: ' + new Date().toLocaleString());

        const fechaActual8 = new Date().toISOString().split('T')[0];
        const fileName = `Prueba_Excel_${fechaActual8}.xlsx`;

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);

        wb.write(fileName, res);

        console.log("✅ Excel de prueba generado correctamente");
    } catch (error) {
        console.error("❌ Error:", error);
        res.status(500).json({
            success: false,
            message: "Error: " + error.message
        });
    }
});

module.exports = router;