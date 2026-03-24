const Template = require("../models/Template")
const EmailLog = require('../models/emailLogModel');

// Dashboard stats
exports.getDashboard = async (req,res)=>{
const totalTemplates = await Template.countDocuments();
const recentLogs = await EmailLog
      .find({})
      .sort({ createdAt: -1 })
      .limit(8)
      .lean();

res.render("dashboard/index",{
title:"Dashboard",
user:req.user,
stats:{
templates: totalTemplates,
},
recentLogs
})
}

// Templates page
exports.getTemplates = async (req,res)=>{
const templates = await Template.find()

res.render("templates/index",{
title:"Templates",
user:req.user,
templates
})
}

