module.exports = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    return next();
  }

  return req.xhr || req.headers.accept?.includes('application/json')
    ? res.status(403).json({ success: false, message: 'Access denied: Admin only' })
    : res.redirect('/dashboard');
};
