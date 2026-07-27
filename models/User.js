const mongoose = require("mongoose")

module.exports = mongoose.model("User",{
name:String,
email:{type:String,unique:true},
password:String,
resetToken:String,
resetTokenExpiry:Number,
phone:String,
company:String,
bio: String,
role: { type: String, enum: ['user', 'admin'], default: 'user' },
tokenVersion: { type: Number, default: 0 }
});