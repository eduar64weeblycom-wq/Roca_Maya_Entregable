const nodemailer = require("nodemailer");
const crypto = require("crypto");
const path = require("path");

// Try load dotenv if present (silently)
try {
  require("dotenv").config();
} catch (e) {
  // ignore
}

const ENV = {
  HOST: process.env.EMAIL_HOST || "smtp.gmail.com",
  PORT: process.env.EMAIL_PORT ? Number(process.env.EMAIL_PORT) : undefined,
  SECURE: process.env.EMAIL_SECURE
    ? process.env.EMAIL_SECURE === "true"
    : undefined,
  USER: process.env.EMAIL_USER || null,
  PASS: process.env.EMAIL_PASS || null,
  FROM: process.env.EMAIL_FROM || null,
};

function formatDateICS(date) {
  const d = new Date(date.getTime());
  const pad = (n) => String(n).padStart(2, "0");
  const YYYY = d.getUTCFullYear();
  const MM = pad(d.getUTCMonth() + 1);
  const DD = pad(d.getUTCDate());
  const hh = pad(d.getUTCHours());
  const mm = pad(d.getUTCMinutes());
  const ss = pad(d.getUTCSeconds());
  return `${YYYY}${MM}${DD}T${hh}${mm}${ss}Z`;
}

function generateIcs({
  uid,
  startDate,
  endDate,
  summary,
  description,
  location = "Clínicas Roca Maya",
  organizer,
  attendees = [],
}) {
  const dtstamp = formatDateICS(new Date());
  const dtstart = formatDateICS(startDate);
  const dtend = formatDateICS(endDate);

  const lines = [
    "BEGIN:VCALENDAR",
    "PRODID:-//Clínicas Roca Maya//Cita//ES",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${dtstart}`,
    `DTEND:${dtend}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    `LOCATION:${location}`,
    organizer ? `ORGANIZER:MAILTO:${organizer}` : "",
    ...(attendees.map(
      (a) =>
        `ATTENDEE;CN=${a.name};ROLE=REQ-PARTICIPANT;RSVP=TRUE:MAILTO:${a.email}`
    ) || []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return lines.filter(Boolean).join("\r\n");
}

async function buildTransporterIfPossible() {
  // If ENV.USER and PASS present use them, else return null (caller may fallback)
  if (ENV.USER && ENV.PASS) {
    const port = ENV.PORT || (ENV.SECURE === false ? 587 : 465);
    const secure = ENV.SECURE === undefined ? port === 465 : ENV.SECURE;
    return nodemailer.createTransport({
      host: ENV.HOST || "smtp.gmail.com",
      port,
      secure,
      auth: {
        user: ENV.USER,
        pass: ENV.PASS,
      },
    });
  }
  return null;
}

let fallbackEmailService = null;
try {
  // Try to require the existing email.service.js only if needed at runtime.
  fallbackEmailService = require("./email.service");
} catch (err) {
  // it's OK if not present; we'll surface error later if transporter missing and fallback missing
  fallbackEmailService = null;
}

/**
 * enviarCorreoCita
 * Independiente pero con fallback.
 */
async function enviarCorreoCita(
  to,
  pacienteNombre,
  doctorNombre,
  fecha,
  duracionMin,
  canal,
  motivo,
  opts = {}
) {
  if (!to) return { ok: false, error: new Error("Parámetro 'to' requerido") };
  if (!(fecha instanceof Date))
    return {
      ok: false,
      error: new Error("Parámetro 'fecha' debe ser instancia Date"),
    };

  // Build human-friendly pieces
  const fechaReadable = fecha.toLocaleDateString("es-ES", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const horaReadable = fecha.toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const duracionReadable = `${duracionMin || 30} minutos`;
  const subject =
    opts.subject ||
    `Confirmación de cita - Clínicas Roca Maya (${fechaReadable} ${horaReadable})`;

  // basic escape for HTML
  const esc = (s) =>
    s === undefined || s === null
      ? ""
      : String(s)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#039;");

  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; color:#222;">
      <p>Estimado(a) <strong>${esc(pacienteNombre)}</strong>,</p>
      <p>Se ha programado una cita médica en <strong>Clínicas Roca Maya</strong> con los siguientes detalles:</p>
      <ul>
        <li><strong>Fecha:</strong> ${esc(fechaReadable)}</li>
        <li><strong>Hora:</strong> ${esc(horaReadable)}</li>
        <li><strong>Doctor(a):</strong> ${esc(doctorNombre)}</li>
        <li><strong>Duración estimada:</strong> ${esc(duracionReadable)}</li>
        <li><strong>Canal:</strong> ${esc(canal || "PRESENCIAL")}</li>
       
      </ul>
      <p>Por favor llegue con 10 minutos de anticipación y lleve su identificación.</p>
      <p>Saludos cordiales,<br/>Clínicas Roca Maya</p>
    </div>
  `;

  // Attempt to create transporter from env
  try {
    const transporter = await buildTransporterIfPossible();
    if (!transporter) {
      // No env credentials -> fallback to existing email.service if available
      if (
        fallbackEmailService &&
        typeof fallbackEmailService.enviarCorreo === "function"
      ) {
        // fallback enviarCorreo signature: (to, subject, html)
        try {
          const sent = await fallbackEmailService.enviarCorreo(
            to,
            subject,
            html
          );
          if (sent === true)
            return { ok: true, info: "sent-via-fallback-email.service" };
          return {
            ok: false,
            error: new Error("Fallback enviarCorreo returned false"),
          };
        } catch (err) {
          return { ok: false, error: err };
        }
      } else {
        return {
          ok: false,
          error: new Error(
            "No transporter available and fallback email.service not found/configured"
          ),
        };
      }
    }

    // Build attachments (.ics) if requested (default true)
    const attachments = [];
    const addIcs = opts.addIcs === undefined ? true : Boolean(opts.addIcs);
    if (addIcs) {
      const start = fecha;
      const end = new Date(fecha.getTime() + (duracionMin || 30) * 60000);
      const uid = `cita-${
        opts.idCita || crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`
      }@rocamaya`;
      const summary = `Cita Médica - Clínicas Roca Maya`;
      const description = `Cita con ${doctorNombre}. Motivo: ${
        motivo || "No especificado"
      }`;
      const ics = generateIcs({
        uid,
        startDate: start,
        endDate: end,
        summary,
        description,
        organizer: ENV.USER || opts.from || undefined,
        attendees: opts.attendees || [],
      });

      attachments.push({
        filename: `cita-${opts.idCita || Date.now()}.ics`,
        content: ics,
        contentType: "text/calendar; charset=utf-8; method=REQUEST",
      });
    }

    const mailOptions = {
      from:
        opts.from ||
        ENV.FROM ||
        (ENV.USER
          ? `"Clínicas Roca Maya" <${ENV.USER}>`
          : `"Clínicas Roca Maya" <serviciotecnico.rocamaya@gmail.com>`),
      to,
      subject,
      html,
      attachments,
    };
    if (opts.cc) mailOptions.cc = opts.cc;
    if (opts.bcc) mailOptions.bcc = opts.bcc;
    if (opts.text) mailOptions.text = opts.text;

    const info = await transporter.sendMail(mailOptions);
    const sentOk = !!(info && (info.accepted?.length > 0 || info.messageId));
    if (!sentOk)
      return {
        ok: false,
        info,
        error: new Error("Transporter did not accept recipients"),
      };
    return { ok: true, info };
  } catch (err) {
    return { ok: false, error: err };
  }
}

module.exports = { enviarCorreoCita };
