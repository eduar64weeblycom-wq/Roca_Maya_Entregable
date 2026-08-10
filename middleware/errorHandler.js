module.exports = function errorHandler(err, req, res, next) {
  console.error('Unhandled error:', err);
  if (res.headersSent) return next(err);
  
  const status = err.status || 500;
  
  // Forzar respuesta JSON si es una petición de tipo API o AJAX
  if (req.xhr || req.headers['content-type'] === 'application/json' || !req.accepts('html')) {
    return res.status(status).json({ 
      success: false, 
      error: err.message || 'Internal Server Error' 
    });
  }

  // Renderizar HTML solo para páginas web normales
  res.status(status).render('error', { error: err });
};