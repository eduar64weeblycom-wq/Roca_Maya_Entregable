const express = require("express");
const router = express.Router();
const pool = require("../database/db");
const speakeasy = require("speakeasy");
const QRCode = require("qrcode");
const { registrarBitacora } = require("../services/bitacora.service");

router.get("/setup/:userId", async (req, res) => {
  const { userId } = req.params;
  const secret = speakeasy.generateSecret({ name: `Roca Maya (${userId})`, issuer: "Sistema Roca Maya" });

  await pool.query("UPDATE TBL_MS_USUARIO SET SECRET_2FA=?, ACTIVO_2FA=1 WHERE USUARIO=?", [secret.base32, userId]);

  const qr = await QRCode.toDataURL(secret.otpauth_url);
  res.render("setup-2fa", { userId, data_url: qr, secret: secret.base32 });
});

router.post("/verify", async (req, res) => {
  const { userId, token } = req.body;
  const [rows] = await pool.query("SELECT SECRET_2FA FROM TBL_MS_USUARIO WHERE USUARIO=?", [userId]);
  if (!rows.length) return res.render("login-2fa", { userId, error: "Usuario no encontrado" });

  const valid = speakeasy.totp.verify({ secret: rows[0].SECRET_2FA, encoding: "base32", token, window: 1 });
  if (valid) return res.redirect("/bienvenido");
  res.render("login-2fa", { userId, error: "Código incorrecto" });
});

module.exports = router;
