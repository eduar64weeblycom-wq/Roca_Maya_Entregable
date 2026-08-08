const autoCloseService = require('./autoClose.service');

class SchedulerService {
    constructor() {
        this.isRunning = false;
        this.intervalId = null;
        this.dailyJobId = null;
        this.dailyTimeout = null;
    }

    start() {
        if (this.isRunning) {
            console.log('⚠️ Scheduler ya está en ejecución');
            return;
        }

        console.log('📅 Iniciando scheduler de auto-cierre de consultas...');

        // ✅ Ejecutar cada hora (en lugar de node-cron)
        this.intervalId = setInterval(async () => {
            console.log(`⏰ [${new Date().toISOString()}] Ejecutando auto-cierre (cada hora)`);
            try {
                const resultado = await autoCloseService.ejecutar({
                    horasInactividad: 1, // Cambiado de 2 a 1 hora
                    cerrarAlFinalDelDia: false
                });
                if (resultado.consultasCerradas > 0) {
                    console.log(`✅ [${new Date().toISOString()}] Auto-cierre completado: ${resultado.consultasCerradas} consultas cerradas`);
                } else {
                    console.log(`ℹ️ [${new Date().toISOString()}] Auto-cierre: No hay consultas para cerrar`);
                }
            } catch (error) {
                console.error(`❌ [${new Date().toISOString()}] Error en auto-cierre:`, error.message);
            }
        }, 60 * 60 * 1000); // 1 hora

        // ✅ Programar cierre al final del día (23:59)
        this.programarCierreDiario();

        this.isRunning = true;
        console.log('✅ Scheduler iniciado correctamente (con setInterval)');
    }

    programarCierreDiario() {
        // Calcular tiempo hasta las 23:59 de hoy
        const ahora = new Date();
        const manana = new Date(ahora);
        manana.setHours(23, 59, 0, 0);
        const diffMs = manana - ahora;

        if (this.dailyTimeout) {
            clearTimeout(this.dailyTimeout);
        }

        this.dailyTimeout = setTimeout(async () => {
            console.log(`⏰ [${new Date().toISOString()}] Ejecutando auto-cierre (fin del día)`);
            try {
                const resultado = await autoCloseService.ejecutar({
                    horasInactividad: 1,
                    cerrarAlFinalDelDia: true
                });
                if (resultado.consultasCerradas > 0) {
                    console.log(`✅ [${new Date().toISOString()}] Auto-cierre de fin de día completado: ${resultado.consultasCerradas} consultas cerradas`);
                } else {
                    console.log(`ℹ️ [${new Date().toISOString()}] Auto-cierre de fin de día: No hay consultas para cerrar`);
                }
            } catch (error) {
                console.error(`❌ [${new Date().toISOString()}] Error en auto-cierre de fin de día:`, error.message);
            }
            // Reprogramar para el siguiente día
            this.programarCierreDiario();
        }, diffMs);

        console.log(`📅 Próximo cierre de fin de día programado para: ${manana.toLocaleString()}`);
    }

    stop() {
        if (!this.isRunning) {
            console.log('⚠️ Scheduler no está en ejecución');
            return;
        }

        console.log('🛑 Deteniendo scheduler...');
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        if (this.dailyTimeout) {
            clearTimeout(this.dailyTimeout);
            this.dailyTimeout = null;
        }
        this.isRunning = false;
        console.log('✅ Scheduler detenido');
    }

    async ejecutarManual(options = {}) {
        return await autoCloseService.ejecutar(options);
    }

    isActive() {
        return this.isRunning;
    }
}

module.exports = new SchedulerService();