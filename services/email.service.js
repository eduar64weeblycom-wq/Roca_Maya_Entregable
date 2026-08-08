const nodemailer = require("nodemailer");

// Cargar variables de entorno
try {
  require("dotenv").config();
} catch (e) {
  // ignore si no está instalado dotenv
}

/**
 * Crea el transporter usando variables de entorno
 */
function createTransporter() {
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;

  if (!user || !pass) {
    console.error("❌ Faltan EMAIL_USER o EMAIL_PASS en las variables de entorno");
    return null;
  }

  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST || "smtp.gmail.com",
    port: Number(process.env.EMAIL_PORT) || 465,
    secure: process.env.EMAIL_SECURE !== "false", // true por defecto (465)
    auth: {
      user,
      pass,
    },
  });
}

/**
 * Envía un correo electrónico
 * @param {string} to 
 * @param {string} subject 
 * @param {string} html 
 * @returns {Promise<boolean>}
 */
async function enviarCorreo(to, subject, html) {
  try {
    if (!to) {
      console.error("Error: Destinatario no especificado");
      return false;
    }

    const transporter = createTransporter();
    if (!transporter) return false;

    const mailOptions = {
      from: process.env.EMAIL_FROM || `"Clínicas Roca Maya" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    };

    console.log(`Enviando correo a: ${to}`);
    const info = await transporter.sendMail(mailOptions);
    console.log(`Correo enviado exitosamente. MessageId: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error("Error enviando correo:", error.message);
    return false;
  }
}

module.exports = { enviarCorreo };