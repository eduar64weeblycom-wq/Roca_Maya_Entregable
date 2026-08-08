const { registrarBitacora } = require("../services/bitacora.service");

const logAction = async (req, res, next) => {
  await registrarBitacora("SISTEMA", "PETICION_HTTP", req.originalUrl, "NAVEGACION", null, null, req, "EXITO");
  next();
};

module.exports = { logAction };
