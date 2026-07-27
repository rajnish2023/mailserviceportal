const Template = require("../models/Template");
const EmailLog = require('../models/emailLogModel');
const User = require("../models/User");

 
exports.getDashboard = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const isAdmin = req.user.role === 'admin';
    const tplQuery = isAdmin ? {} : { createdBy: userId };
    
    const userTemplates = await Template.find(tplQuery, '_id title');
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
  try {
    const userId = req.user._id || req.user.id;
    const isAdmin = req.user.role === 'admin';
    const query = isAdmin ? {} : { createdBy: userId };

    const templates = await Template.find(
      query,
      'title subject to apiKey isActive submissionCount lastSubmittedAt createdAt zohoEnabled createdBy'
    ).populate('createdBy', 'name email').sort({ createdAt: -1 });

    let allUsers = [];
    if (isAdmin) {
      allUsers = await User.find({}, 'name email').sort({ name: 1 });
    }

    res.render("templates/index", {
      title: "Templates",
      user: req.user,
      templates,
      allUsers
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
};