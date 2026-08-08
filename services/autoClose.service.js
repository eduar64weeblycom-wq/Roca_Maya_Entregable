const pool = require('../database/db');
const { registrarBitacora } = require('./bitacora.service');

class AutoCloseService {
    
    async cerrarConsultasInactivas(options = {}) {
        const {
            horasInactividad = 2,
            cerrarAlFinalDelDia = true
        } = options;

        console.log(`🔄 Iniciando auto-cierre de consultas (inactividad: ${horasInactividad}h, final del día: ${cerrarAlFinalDelDia})`);

        try {
            let consultasCerradas = 0;
            let errores = 0;
            const detalles = [];

            // 1. Cerrar consultas inactivas por tiempo
            const consultasInactivas = await this._obtenerConsultasInactivas(horasInactividad);
            
            for (const consulta of consultasInactivas) {
                try {
                    await this._cerrarConsulta(consulta.ID_CITA, `Inactividad de ${horasInactividad} horas`);
                    consultasCerradas++;
                    detalles.push({
                        idCita: consulta.ID_CITA,
                        idConsulta: consulta.ID_CONSULTA,
                        motivo: 'Inactividad',
                        paciente: consulta.NOMBRE_PACIENTE
                    });
                    console.log(`✅ Cita #${consulta.ID_CITA} cerrada por inactividad (${consulta.NOMBRE_PACIENTE})`);
                } catch (error) {
                    errores++;
                    console.error(`❌ Error cerrando cita #${consulta.ID_CITA}:`, error.message);
                }
            }

            // 2. Cerrar consultas al final del día
            if (cerrarAlFinalDelDia) {
                const consultasFinDia = await this._obtenerConsultasFinDia();
                
                for (const consulta of consultasFinDia) {
                    if (detalles.some(d => d.idCita === consulta.ID_CITA)) continue;
                    
                    try {
                        await this._cerrarConsulta(consulta.ID_CITA, 'Fin del día (23:59)');
                        consultasCerradas++;
                        detalles.push({
                            idCita: consulta.ID_CITA,
                            idConsulta: consulta.ID_CONSULTA,
                            motivo: 'Fin del día',
                            paciente: consulta.NOMBRE_PACIENTE
                        });
                        console.log(`✅ Cita #${consulta.ID_CITA} cerrada por fin del día (${consulta.NOMBRE_PACIENTE})`);
                    } catch (error) {
                        errores++;
                        console.error(`❌ Error cerrando cita #${consulta.ID_CITA}:`, error.message);
                    }
                }
            }

            if (consultasCerradas > 0) {
                await registrarBitacora({
                    usuario: 'SISTEMA_AUTO_CIERRE',
                    accion: 'AUTO_CIERRE_CONSULTAS',
                    descripcion: `Se cerraron automáticamente ${consultasCerradas} consultas médicas. Detalles: ${JSON.stringify(detalles)}`,
                    modulo: 'CONSULTA_MEDICA',
                    tabla: 'TBL_CITAS',
                    estado: 'EXITO',
                    req: null
                });
            }

            console.log(`📊 Auto-cierre completado: ${consultasCerradas} consultas cerradas, ${errores} errores`);

            return {
                success: true,
                consultasCerradas,
                errores,
                detalles,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            console.error('❌ Error en auto-cierre:', error);
            
            try {
                await registrarBitacora({
                    usuario: 'SISTEMA_AUTO_CIERRE',
                    accion: 'ERROR_AUTO_CIERRE',
                    descripcion: `Error en auto-cierre: ${error.message}`,
                    modulo: 'CONSULTA_MEDICA',
                    tabla: 'TBL_CITAS',
                    estado: 'ERROR',
                    detalleError: error.message,
                    req: null
                });
            } catch (bitError) {
                console.error('Error registrando bitácora de error:', bitError);
            }

            return {
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    async _obtenerConsultasInactivas(horasInactividad) {
        const [rows] = await pool.query(`
            SELECT 
                c.ID_CITA,
                cm.ID_CONSULTA,
                CONCAT(p.NOMBRES, ' ', p.APELLIDOS) AS NOMBRE_PACIENTE,
                c.FECHA_MODIFICACION,
                cm.FECHA_CONSULTA,
                GREATEST(COALESCE(c.FECHA_MODIFICACION, cm.FECHA_CONSULTA, c.FECHA_CITA), cm.FECHA_CONSULTA) AS ULTIMA_ACTIVIDAD
            FROM TBL_CITAS c
            INNER JOIN TBL_CONSULTA_MEDICA cm ON c.ID_CITA = cm.ID_CITA
            INNER JOIN TBL_PACIENTE p ON c.ID_PACIENTE = p.ID_PACIENTE
            WHERE c.ESTADO = 'CONSULTA_MEDICA'
                AND GREATEST(COALESCE(c.FECHA_MODIFICACION, cm.FECHA_CONSULTA, c.FECHA_CITA), cm.FECHA_CONSULTA) < DATE_SUB(NOW(), INTERVAL ? HOUR)
                AND DATE(c.FECHA_CITA) <= CURDATE()
        `, [horasInactividad]);

        console.log(`🔍 ${rows.length} consultas inactivas encontradas (${horasInactividad}h)`);
        if (rows.length > 0) {
            console.log(`📋 IDs: ${rows.map(r => r.ID_CITA).join(', ')}`);
        }
        return rows;
    }

    async _obtenerConsultasFinDia() {
        const [rows] = await pool.query(`
            SELECT 
                c.ID_CITA,
                cm.ID_CONSULTA,
                CONCAT(p.NOMBRES, ' ', p.APELLIDOS) AS NOMBRE_PACIENTE,
                GREATEST(COALESCE(c.FECHA_MODIFICACION, cm.FECHA_CONSULTA, c.FECHA_CITA), cm.FECHA_CONSULTA) AS ULTIMA_ACTIVIDAD
            FROM TBL_CITAS c
            INNER JOIN TBL_CONSULTA_MEDICA cm ON c.ID_CITA = cm.ID_CITA
            INNER JOIN TBL_PACIENTE p ON c.ID_PACIENTE = p.ID_PACIENTE
            WHERE c.ESTADO = 'CONSULTA_MEDICA'
                AND DATE(c.FECHA_CITA) < CURDATE()
                AND GREATEST(COALESCE(c.FECHA_MODIFICACION, cm.FECHA_CONSULTA, c.FECHA_CITA), cm.FECHA_CONSULTA) < CURDATE()
        `);
        return rows;
    }

    async _cerrarConsulta(idCita, motivo) {
        await pool.query(`
            UPDATE TBL_CITAS 
            SET ESTADO = 'FINALIZADA',
                USUARIO_MODIFICACION = 'SISTEMA_AUTO_CIERRE',
                FECHA_MODIFICACION = NOW()
            WHERE ID_CITA = ?
        `, [idCita]);

        await registrarBitacora({
            usuario: 'SISTEMA_AUTO_CIERRE',
            accion: 'AUTO_CIERRE_CONSULTA_INDIVIDUAL',
            descripcion: `Cita #${idCita} cerrada automáticamente. Motivo: ${motivo}`,
            modulo: 'CONSULTA_MEDICA',
            idRegistro: idCita,
            tabla: 'TBL_CITAS',
            estado: 'EXITO',
            req: null
        });
    }

    async ejecutar(options = {}) {
        return await this.cerrarConsultasInactivas(options);
    }
}

module.exports = new AutoCloseService();