const router = require("express").Router()
const c = require("../controllers/projectController")
const auth = require("../middleware/auth")

router.post("/create",auth,c.create)
router.get("/",auth,c.getAll)

module.exports = router