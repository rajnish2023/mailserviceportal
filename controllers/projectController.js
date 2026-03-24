const Project   = require('../models/Project');
const Template  = require('../models/Template');
const EmailLog  = require('../models/emailLogModel');

exports.getProjects = async (req, res) => {
  try {
    const userId   = req.user._id || req.user.id;
    const projects = await Project
      .find({ createdBy: userId })
      .sort({ createdAt: -1 });
    const projectsWithCount = await Promise.all(
      projects.map(async (p) => {
        const count = await Template.countDocuments({ projectId: p._id });
        return { ...p.toObject(), templateCount: count };
      })
    );

    return res.render('projects/index', {
      title:    'Projects',
      user:     req.user,
      projects: projectsWithCount,
    });
  } catch (err) {
    console.error('[getProjects]', err);
    return res.status(500).send('Server error');
  }
};

exports.createProject = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const { name, domain } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ success: false, message: 'Project name is required.' });
    }

    const exists = await Project.findOne({
      createdBy: userId,
      name: { $regex: new RegExp(`^${name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
    });
    if (exists) {
      return res.status(409).json({
        success: false,
        message: `You already have a project named "${exists.name}".`,
      });
    }

    const project = await Project.create({
      createdBy:    userId,
      name:         name.trim(),
      domain:       domain?.trim()       || '',
       
    });

    return res.status(201).json({
      success: true,
      message: 'Project created successfully',
      data:    project,
    });
  } catch (err) {
    console.error('[createProject]', err);
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

exports.updateProject = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const { name, domain} = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ success: false, message: 'Project name is required.' });
    }

    const exists = await Project.findOne({
      createdBy: userId,
      _id:       { $ne: req.params.id },
      name:      { $regex: new RegExp(`^${name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
    });
    if (exists) {
      return res.status(409).json({
        success: false,
        message: `You already have a project named "${exists.name}".`,
      });
    }

    const project = await Project.findOneAndUpdate(
      { _id: req.params.id, createdBy: userId },
      {
        name:         name.trim(),
        domain:       domain?.trim()       || '',
        
      },
      { new: true, runValidators: true }
    );

    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found.' });
    }

    return res.status(200).json({
      success: true,
      message: 'Project updated successfully',
      data:    project,
    });
  } catch (err) {
    console.error('[updateProject]', err);
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

exports.deleteProject = async (req, res) => {
  try {
    const userId  = req.user._id || req.user.id;
    const project = await Project.findOneAndDelete({ _id: req.params.id, createdBy: userId });

    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found.' });
    }

    await Template.updateMany(
      { projectId: req.params.id },
      { $set: { projectId: null } }
    );

    return res.status(200).json({ success: true, message: 'Project deleted.' });
  } catch (err) {
    console.error('[deleteProject]', err);
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};


exports.getProjectTemplates = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const templates = await Template
      .find({ projectId: req.params.id, createdBy: userId }, 'title apiKey isActive')
      .sort({ title: 1 });

    return res.status(200).json({ success: true, data: templates });
  } catch (err) {
    console.error('[getProjectTemplates]', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.listProjects = async (req, res) => {
  try {
    const userId   = req.user._id || req.user.id;
    const projects = await Project
      .find({ createdBy: userId, isActive: true }, 'name color domain domainFilter')
      .sort({ name: 1 });

    return res.status(200).json({ success: true, data: projects });
  } catch (err) {
    console.error('[listProjects]', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};


exports.getProjectDetail = async (req, res) => {
  try {
    const userId  = req.user._id || req.user.id;
    const project = await Project.findOne({ _id: req.params.id, createdBy: userId });

    if (!project) {
      return res.redirect('/projects');
    }

    const templates = await Template
      .find({ projectId: project._id, createdBy: userId })
      .sort({ createdAt: -1 })
      .lean();

    const templatesWithLogs = await Promise.all(
      templates.map(async (t) => {
        const [logs, totalSent, totalFailed,submissionCount] = await Promise.all([
          EmailLog
            .find({ templateId: t._id })
            .sort({ createdAt: -1 })
            .limit(10)
            .lean(),
          EmailLog.countDocuments({ templateId: t._id, status: 'sent' }),
          EmailLog.countDocuments({ templateId: t._id, status: 'failed' }),
          EmailLog.countDocuments({ templateId: t._id }),
        ]);

        return { ...t, logs, totalSent, totalFailed,submissionCount };
      })
    );

   
    const [projectSent, projectFailed, projectTotal] = await Promise.all([
      EmailLog.countDocuments({ projectId: project._id, status: 'sent'   }),
      EmailLog.countDocuments({ projectId: project._id, status: 'failed' }),
      EmailLog.countDocuments({ projectId: project._id }),
    ]);

   
    const domainBreakdown = await EmailLog.aggregate([
      { $match: { projectId: project._id, senderDomain: { $ne: '' } } },
      { $group: { _id: '$senderDomain', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 8 },
    ]);

     const totalFromTemplates = templatesWithLogs.reduce(
  (sum, t) => sum + (t.submissionCount || 0),
  0
);
    return res.render('projects/detail', {
      title:    project.name,
      user:     req.user,
      project,
      templates: templatesWithLogs,
      stats: {
        sent:      projectSent,
        failed:    projectFailed,
        total:     totalFromTemplates,
        templates: templates.length,
      },
      domainBreakdown,
    });

  } catch (err) {
    console.error('[getProjectDetail]', err);
    return res.redirect('/projects');
  }
};

exports.resendLog = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;

    const log = await EmailLog.findById(req.params.logId).lean();
    if (!log) {
      return res.status(404).json({ success: false, message: 'Log not found' });
    }

    const template = await Template.findOne({ _id: log.templateId, createdBy: userId })
      .populate('projectId', 'name domain domainFilter');
    if (!template) {
      return res.status(404).json({ success: false, message: 'Template not found or access denied' });
    }

    const nodemailer  = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host:   process.env.MAIL_HOST || 'sandbox.smtp.mailtrap.io',
      port:   Number(process.env.MAIL_PORT) || 2525,
      secure: false,
      auth:   { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
      tls:    { rejectUnauthorized: false },
    });

   
    const data = log.formData || {};
    let subject = template.subject;
    let html    = template.html;
    Object.entries(data).forEach(([key, value]) => {
      const regex = new RegExp(`\{\{\s*${key}\s*\}\}`, 'g');
      subject = subject.replace(regex, value ?? '');
      html    = html.replace(regex, value ?? '');
    });

    const fromAddress = (template.fromEmail)
      ? (template.fromName ? `"${template.fromName}" <${template.fromEmail}>` : template.fromEmail)
      : `"${process.env.MAIL_FROM_NAME || 'App'}" <${process.env.MAIL_FROM || 'no-reply@app.com'}>`;

    const info = await transporter.sendMail({
      from:    fromAddress,
      to:      template.to.join(', '),
      subject,
      html,
      ...(template.replyTo        && { replyTo: template.replyTo }),
      ...(template.cc?.length > 0 && { cc:  template.cc.join(', ')  }),
      ...(template.bcc?.length> 0 && { bcc: template.bcc.join(', ') }),
    });

   
    await EmailLog.create({
      templateId:    template._id,
      templateTitle: template.title,
      projectId:     template.projectId?._id    || null,
      projectName:   template.projectId?.name   || '',
      projectDomain: template.projectId?.domain || '',
      triggeredBy:   'dashboard',
      subject,
      to:            template.to,
      cc:            template.cc  || [],
      bcc:           template.bcc || [],
      formData:      data,
      messageId:     info.messageId || '',
      fromAddress,
      status:        'sent',
      senderDomain:  (data.email || '').split('@')[1] || '',
    });

    console.log(`[resendLog] Resent log ${log._id} → ${info.messageId}`);

    return res.status(200).json({
      success:   true,
      message:   'Email resent successfully',
      messageId: info.messageId,
    });

  } catch (err) {
    console.error('[resendLog]', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to resend email: ' + err.message,
    });
  }
};
