const jwt = require("jsonwebtoken");

module.exports = (req, res, next) => {
  const token = req.cookies.token;

  if (!token) {
    if (req.originalUrl.startsWith("/api")) {
      return res.status(401).json({ msg: "Unauthorized" });
    }
    return res.redirect("/");
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = decoded;  

    next();
  } catch (err) {
    res.clearCookie("token");  
    return res.redirect("/");
  }
};