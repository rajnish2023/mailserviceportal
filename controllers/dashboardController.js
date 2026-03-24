const Template = require("../models/Template");
const EmailLog = require('../models/emailLogModel');

 
exports.getDashboard = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const userTemplates = await Template.find({ createdBy: userId }, '_id title');
    const templateIds = userTemplates.map(t => t._id);
    const recentLogs = await EmailLog.find({ templateId: { $in: templateIds } })
      .sort({ createdAt: -1 })
      .limit(8)
      .lean();

    const totalTemplates = userTemplates.length;

    res.render("dashboard/index", {
      title: "Dashboard",
      user: req.user,
      stats: { templates: totalTemplates },
      recentLogs
    });

  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
};

 
exports.getTemplates = async (req, res) => {
  const userId = req.user._id || req.user.id;

  const templates = await Template.find(
    { createdBy: userId },
    'title subject to apiKey isActive submissionCount lastSubmittedAt createdAt zohoEnabled'
  ).sort({ createdAt: -1 });

  res.render("templates/index", {
    title: "Templates",
    user: req.user,
    templates
  });
};