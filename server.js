const express = require("express")
const mongoose = require("mongoose")
const cookieParser = require("cookie-parser")
require("dotenv").config()
const cors = require('cors');

const app = express()
app.use(cors());
app.use(express.json())
app.use(express.urlencoded({extended:true}))
app.use(cookieParser())
app.use(express.static("public"))

app.set("view engine","ejs")

mongoose.connect(process.env.MONGO_URI)
.then(()=>console.log("DB Connected"))

app.use("/", require("./routes/viewRoutes"))
app.use("/auth", require("./routes/authRoutes"))

app.listen(process.env.PORT, ()=>console.log("Server running"))