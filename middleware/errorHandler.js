module.exports = (err, req, res, next) => {
    console.error("ErrorHandler:", err.message || err);

    // Detectar si es una petición de API
    const isApiRequest =
        req.originalUrl.startsWith('/parametros') ||
        req.originalUrl.startsWith('/api') ||
        req.xhr ||
        (req.headers.accept && req.headers.accept.includes('application/json')) ||
        (req.headers['content-type'] && req.headers['content-type'].includes('multipart/form-data'));

    if (isApiRequest) {
        return res.status(err.status || 500).json({
            ok: false,
            mensaje: err.message || 'Error interno del servidor'
        });
    }

    // Para páginas normales (vistas EJS)
    res.status(err.status || 500).render('error', {
        message: err.message || 'Error interno del servidor'
    });
};