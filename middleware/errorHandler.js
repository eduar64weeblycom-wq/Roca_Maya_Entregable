module.exports = function errorHandler(err, req, res, next) {
console.error('Unhandled error:', err);
if (res.headersSent) return next(err);
const status = err.status || 500;
if (req.accepts('html')) {
res.status(status).render('error', { error: err });
} else {
res.status(status).json({ error: err.message || 'Internal Server Error' });
}
};