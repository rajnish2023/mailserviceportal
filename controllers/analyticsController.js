const Template = require('../models/Template');
const EmailLog = require('../models/emailLogModel');
const Project = require('../models/Project');
exports.getAnalytics = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const { templateId, status, from, to, page = 1, projectId: filterProjectId } = req.query;
    const limit = 15;
    const skip = (parseInt(page) - 1) * limit;
    const userTemplates = await Template.find({ createdBy: userId }, '_id title');
    const userTemplateIds = userTemplates.map(t => t._id);
    const filter = { templateId: { $in: userTemplateIds } };
    if (templateId) filter.templateId = templateId;
    if (filterProjectId) filter.projectId = filterProjectId;
    if (status) filter.status = status;
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) filter.createdAt.$lte = new Date(new Date(to).setHours(23, 59, 59));
    }
    const [logs, totalLogs] = await Promise.all([
      EmailLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      EmailLog.countDocuments(filter)
    ]);

    const [totalSent, totalFailed, byTrigger] = await Promise.all([
      EmailLog.countDocuments({ ...filter, status: 'sent' }),
      EmailLog.countDocuments({ ...filter, status: 'failed' }),
      EmailLog.aggregate([
        { $match: filter },
        { $group: { _id: '$triggeredBy', count: { $sum: 1 } } },
      ]),
    ]);

    const topTemplates = await EmailLog.aggregate([
      { $match: filter },
      { $group: { _id: '$templateId', title: { $first: '$templateTitle' }, count: { $sum: 1 }, lastSent: { $max: '$createdAt' } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ]);
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const dailyVolume = await EmailLog.aggregate([
      { $match: { ...filter, createdAt: { $gte: sevenDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          sent: { $sum: { $cond: [{ $eq: ['$status', 'sent'] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const dailyMap = {};
    dailyVolume.forEach(d => { dailyMap[d._id] = d; });

    const chartDays = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      chartDays.push({
        label,
        sent: dailyMap[key]?.sent || 0,
        failed: dailyMap[key]?.failed || 0,
      });
    }

    const projects = await Project.find({}, 'name _id color domain').sort({ name: 1 }).lean();
    const templates = userTemplates.sort((a, b) => a.title.localeCompare(b.title));

    const domainBreakdown = await EmailLog.aggregate([
      { $match: { ...filter, senderDomain: { $ne: '' } } },
      { $group: { _id: '$senderDomain', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    const triggerMap = { form: 0, dashboard: 0, api: 0 };
    byTrigger.forEach(t => { if (triggerMap[t._id] !== undefined) triggerMap[t._id] = t.count; });

    res.render('analytics/index', {
      logs,
      totalLogs,
      totalPages: Math.ceil(totalLogs / limit),
      currentPage: parseInt(page),
      totalSent,
      totalFailed,
      triggerMap,
      topTemplates,
      chartDays: JSON.stringify(chartDays),
      templates,
      projects,
      domainBreakdown,
      user: req.user,
      filters: { templateId, status, from, to, projectId: filterProjectId },
    });

  } catch (err) {
    console.error('[getAnalytics]', err);
    res.status(500).send('Server error');
  }
};


exports.getLogDetail = async (req, res) => {
  try {
    const log = await EmailLog.findById(req.params.id).lean();
    if (!log) return res.redirect('/analytics');

    const template = await Template.findById(log.templateId, 'title html subject apiKey').lean();

    return res.render('analytics/detail', { log, template });
  } catch (err) {
    console.error('[getLogDetail]', err);
    res.redirect('/analytics');
  }
};


exports.getQuickStats = async (req, res) => {
  try {
    const now       = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart  = new Date(todayStart); weekStart.setDate(weekStart.getDate() - 6);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [today, week, month, failed] = await Promise.all([
      EmailLog.countDocuments({ status: 'sent', createdAt: { $gte: todayStart } }),
      EmailLog.countDocuments({ status: 'sent', createdAt: { $gte: weekStart  } }),
      EmailLog.countDocuments({ status: 'sent', createdAt: { $gte: monthStart } }),
      EmailLog.countDocuments({ status: 'failed' }),
    ]);

    const byTrigger = await EmailLog.aggregate([
      { $group: { _id: '$triggeredBy', count: { $sum: 1 } } },
    ]);
    const trigMap = { form: 0, dashboard: 0, api: 0 };
    byTrigger.forEach(t => { if (trigMap[t._id] !== undefined) trigMap[t._id] = t.count; });

    return res.json({ success: true, data: { today, week, month, failed, ...trigMap } });
  } catch (err) {
    console.error('[getQuickStats]', err);
    return res.status(500).json({ success: false });
  }
};


exports.getLogDetailJson = async (req, res) => {
  try {
    const log = await EmailLog.findById(req.params.id).lean();
    if (!log) return res.status(404).json({ success: false, message: 'Log not found' });
    return res.json({ success: true, log });
  } catch (err) {
    console.error('[getLogDetailJson]', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};


exports.deleteLog = async (req, res) => {
  try {
    await EmailLog.findByIdAndDelete(req.params.id);
    return res.json({ success: true, message: 'Log deleted' });
  } catch (err) {
    console.error('[deleteLog]', err);
    return res.status(500).json({ success: false });
  }
};
