const router = require("express").Router()
const c = require("../controllers/templateController")

router.post("/create",c.create)
router.get("/",c.getAll)

module.exports = router