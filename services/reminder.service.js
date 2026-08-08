const cron = require('node-cron');
const pool = require('../database/db');
const { enviarCorreo } = require('./email.service');

function iniciarCronRecordatorios() {
  // Se ejecuta todos los días a las 7:00 AM ('0 7 * * *')
  cron.schedule('0 7 * * *', async () => {
    console.log("⏰ Ejecutando tarea programada: Recordatorios de citas...");
    
    try {
      // Consulta las citas programadas para el mismo día (CURDATE())
      const query = `
        SELECT 
          c.ID_CITA,
          c.FECHA_CITA,
          p.NOMBRES,
          p.APELLIDOS,
          p.CORREO_ELECTRONICO
        FROM TBL_CITAS c
        INNER JOIN TBL_PACIENTE p ON c.ID_PACIENTE = p.ID_PACIENTE
       WHERE DATE(c.FECHA_CITA) = DATE_ADD(CURDATE(), INTERVAL 1 DAY)
      `;
      
      const [citas] = await pool.query(query);

      for (const cita of citas) {
        if (!cita.CORREO_ELECTRONICO) continue;

        const pacienteNombre = `${cita.NOMBRES} ${cita.APELLIDOS}`.trim();
        const fechaObj = new Date(cita.FECHA_CITA);
        const fechaReadable = fechaObj.toLocaleDateString("es-ES", { year: "numeric", month: "long", day: "numeric" });
        const horaReadable = fechaObj.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });

        const subject = `⏰ Recordatorio: Su cita médica en Clínicas Roca Maya es hoy`;
        const html = `
          <div style="font-family:Arial,Helvetica,sans-serif;color:#222;">
            <p>Estimado(a) <strong>${pacienteNombre}</strong>,</p>
            <p>Le recordamos que tiene una cita médica programada para el día de <strong>hoy</strong> en <strong>Clínicas Roca Maya</strong>:</p>
            <ul>
              <li><strong>Fecha:</strong> ${fechaReadable}</li>
              <li><strong>Hora:</strong> ${horaReadable}</li>
            </ul>
            <p>Por favor llegue con 10 minutos de anticipación. ¡Le esperamos!</p>
          </div>
        `;

        await enviarCorreo(cita.CORREO_ELECTRONICO, subject, html);
        console.log(`✉️ Recordatorio enviado a: ${cita.CORREO_ELECTRONICO}`);
      }

      console.log(`✅ Tarea de recordatorios finalizada. Se procesaron ${citas.length} citas.`);
    } catch (error) {
      console.error("❌ Error en la tarea programada de recordatorios:", error);
    }
  });
}

module.exports = {
  iniciarCronRecordatorios
};