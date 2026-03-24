const mongoose = require("mongoose")

module.exports = mongoose.model("User",{
name:String,
email:{type:String,unique:true},
password:String,
resetToken:String,
resetTokenExpiry:Number,
phone:Number,
company:String,
bio: String,
});