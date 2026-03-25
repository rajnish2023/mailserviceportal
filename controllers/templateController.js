const nodemailer = require('nodemailer');
const Template   = require('../models/Template');
const EmailLog   = require('../models/emailLogModel');
const { checkProviderAllowed }  = require('../middleware/emailProvider'); 
const { checkRateLimit, checkSpam } = require('../middleware/formGuard'); 
const { createZohoLead, validateZohoCredentials } = require('../middleware/zohoService');

const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST || 'sandbox.smtp.mailtrap.io',
  port: Number(process.env.MAIL_PORT) || 2525,
  secure: false,
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
  tls: { rejectUnauthorized: false },
});

function resolvePlaceholders(template, data = {}) {
  let subject = template.subject;
  let html    = template.html;

  Object.entries(data).forEach(([key, value]) => {
    const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
    subject = subject.replace(regex, value ?? '');
    html    = html.replace(regex, value ?? '');
  });

  return { subject, html };
}

function buildFrom(template) {
  if (template && template.fromEmail) {
    return template.fromName
      ? `"${template.fromName}" <${template.fromEmail}>`
      : template.fromEmail;
  }
  const name  = process.env.MAIL_FROM_NAME || 'App';
  const email = process.env.MAIL_FROM      || 'hello@pmstool.dynamicssquare.com';
  return `"${name}" <${email}>`;
}


async function dispatchMail(template, data = {}, triggeredBy = 'form') {
  const { subject, html } = resolvePlaceholders(template, data);
  const fromAddress = buildFrom(template);

  const mailOptions = {
    from:    fromAddress,
    to:      template.to.join(', '),
    subject,
    html,
    ...(template.replyTo        && { replyTo: template.replyTo }),
    ...(template.cc.length  > 0 && { cc:  template.cc.join(', ')  }),
    ...(template.bcc.length > 0 && { bcc: template.bcc.join(', ') }),
  };

  let info;

  try {
    info = await transporter.sendMail(mailOptions);
  } catch (mailErr) {
    await EmailLog.create({
      templateId:    template._id,
      templateTitle: template.title,
      triggeredBy,
      subject,
      to:           template.to,
      cc:           template.cc  || [],
      bcc:          template.bcc || [],
      formData:     data,
      messageId:    '',
      fromAddress,
      status:       'failed',
      errorMessage: mailErr.message,
    }).catch(() => {});
    throw mailErr;
  }


  EmailLog.create({
    templateId:    template._id,
    templateTitle: template.title,
    triggeredBy,
    subject,
    to:          template.to,
    cc:          template.cc  || [],
    bcc:         template.bcc || [],
    formData:    data,
    messageId:   info.messageId || '',
    fromAddress,
    status:      'sent',
  }).catch(() => {});

  return info;
}

exports.createNewTemplate = async (req, res) => {
  try {
    res.render('templates/newtemplate', { title: "Create Template", user: req.user });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
};

exports.createTemplate = async (req, res) => {
  try {
    const { title, subject, projectId, fromName, fromEmail, replyTo, to, cc, bcc, html } = req.body;

    if (!title?.trim())   return res.status(400).json({ success: false, message: 'Template title is required' });
    if (!subject?.trim()) return res.status(400).json({ success: false, message: 'Subject is required' });
    if (!html?.trim())    return res.status(400).json({ success: false, message: 'HTML content is required' });
    if (!to?.length)      return res.status(400).json({ success: false, message: 'At least one "To" email is required' });


    const userId = req.user._id || req.user.id;
    const existing = await Template.findOne({
      createdBy: userId,
      title:     { $regex: new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
    });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: `You already have a template named "${existing.title}". Please use a different title.`,
        code:    'DUPLICATE_TITLE',
      });
    }

    const template = await Template.create({
      createdBy:        userId,
      title, subject, html, projectId,
      fromName:         fromName         || '',
      fromEmail:        fromEmail        || '',
      replyTo:          replyTo          || '',
      to,
      cc:               cc               || [],
      bcc:              bcc              || [],
      allowedProviders: Array.isArray(req.body.allowedProviders)
                          ? req.body.allowedProviders
                          : (req.body.allowedProviders ? [req.body.allowedProviders] : []),
      senderEmailField: req.body.senderEmailField || 'email',
    });

    return res.status(201).json({
      success: true,
      message: 'Template saved successfully',
      data: {
        _id:      template._id,
        title:    template.title,
        apiKey:   template.apiKey,
        endpoint: `${req.protocol}://${req.get('host')}/api/form/${template.apiKey}`,
      },
    });
  } catch (err) {
    if (err.code === 11000 && err.keyPattern?.title) {
      return res.status(409).json({
        success: false,
        message: 'A template with this title already exists. Please use a different title.',
        code:    'DUPLICATE_TITLE',
      });
    }
    console.error('[createTemplate]', err);
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

exports.getAllTemplates = async (req, res) => {
  try {

    const userId = req.user._id || req.user.id;
    const templates = await Template
      .find({ createdBy: userId }, 'title subject to apiKey isActive submissionCount lastSubmittedAt createdAt')
      .sort({ createdAt: -1 });
    return res.status(200).json({ success: true, data: templates });
  } catch (err) {
    console.error('[getAllTemplates]', err);
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

exports.editTemplate = async (req, res) => {
  try {
    const userId   = req.user._id || req.user.id;
    const template = await Template.findOne({ _id: req.params.id, createdBy: userId });
    if (!template) return res.redirect('/templates'); 
    res.render('templates/edittemplate', { title: "Edit Template", user: req.user, template });
  } catch (err) {
    console.error('[editTemplate]', err);
    res.redirect('/templates');
  }
};

exports.getTemplateById = async (req, res) => {
  try {
    const template = await Template.findById(req.params.id);
    if (!template) return res.status(404).json({ success: false, message: 'Template not found' });
    return res.status(200).json({ success: true, data: template });
  } catch (err) {
    console.error('[getTemplateById]', err);
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

exports.updateTemplate = async (req, res) => {
  try {
    
    if (req.body.allowedProviders !== undefined) {
      req.body.allowedProviders = Array.isArray(req.body.allowedProviders)
        ? req.body.allowedProviders
        : (req.body.allowedProviders ? [req.body.allowedProviders] : []);
    }

    if (req.body.title) {
      const userId = req.user._id || req.user.id;
      const newTitle = req.body.title.trim();
      const duplicate = await Template.findOne({
        createdBy: userId,
        _id:       { $ne: req.params.id }, 
        title:     { $regex: new RegExp(`^${newTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
      });
      if (duplicate) {
        return res.status(409).json({
          success: false,
          message: `You already have a template named "${duplicate.title}". Please use a different title.`,
          code:    'DUPLICATE_TITLE',
        });
      }
    }

    const template = await Template.findByIdAndUpdate(
      req.params.id,
      { ...req.body },
      { new: true, runValidators: true }
    );
    if (!template) return res.status(404).json({ success: false, message: 'Template not found' });
    return res.status(200).json({ success: true, message: 'Template updated', data: template });
  } catch (err) {
    console.error('[updateTemplate]', err);
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

exports.toggleTemplate = async (req, res) => {
  try {
    const template = await Template.findById(req.params.id);
    if (!template) return res.status(404).json({ success: false, message: 'Template not found' });
    template.isActive = !template.isActive;
    await template.save();
    return res.status(200).json({
      success:  true,
      message:  `Template ${template.isActive ? 'activated' : 'deactivated'} successfully`,
      isActive: template.isActive,
    });
  } catch (err) {
    console.error('[toggleTemplate]', err);
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

exports.deleteTemplate = async (req, res) => {
  try {
    const userId   = req.user._id || req.user.id;

    const template = await Template.findOneAndDelete({ _id: req.params.id, createdBy: userId });
    if (!template) return res.status(404).json({ success: false, message: 'Template not found or access denied' });
    return res.status(200).json({ success: true, message: 'Template deleted' });
  } catch (err) {
    console.error('[deleteTemplate]', err);
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

exports.regenerateApiKey = async (req, res) => {
  try {
    const template = await Template.findById(req.params.id);
    if (!template) return res.status(404).json({ success: false, message: 'Template not found' });
    const newKey = await template.regenerateApiKey();
    return res.status(200).json({
      success:  true,
      message:  'API key regenerated',
      apiKey:   newKey,
      endpoint: `${req.protocol}://${req.get('host')}/api/form/${newKey}`,
    });
  } catch (err) {
    console.error('[regenerateApiKey]', err);
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

exports.toggleActive = async (req, res) => {
  try {
    const template = await Template.findById(req.params.id);
    if (!template) return res.status(404).json({ success: false, message: 'Template not found' });
    template.isActive = !template.isActive;
    await template.save();
    return res.status(200).json({
      success:  true,
      message:  `Template ${template.isActive ? 'activated' : 'deactivated'}`,
      isActive: template.isActive,
    });
  } catch (err) {
    console.error('[toggleActive]', err);
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

 exports.handleFormSubmit = async (req, res) => {
   try {
     const { apiKey } = req.params;
     const template = await Template.findOne({ apiKey });
 
     if (!template) {
       return res.status(404).json({ success: false, message: 'Invalid API key' });
     }
     if (!template.isActive) {
       return res.status(403).json({ success: false, message: 'This form endpoint is disabled' });
     }
 
     const data = req.body || {};
  
     const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'unknown';
    //  const rateCheck = checkRateLimit(
    //    ip,
    //    template._id.toString(),
    //    template.rateLimitMs  || 5 * 60 * 1000,  
    //    template.rateLimitMax || 1000              
    //  );
 
    //  if (!rateCheck.allowed) {
    //    return res.status(429).json({
    //      success:           false,
    //      message:           rateCheck.message,
    //      retryAfterSeconds: rateCheck.retryAfterSeconds,
    //      code:              'RATE_LIMITED',
    //    });
    //  }
 
     
     const spamCheck = checkSpam(data, {
       maxUrls:   1,
       minLength: 3,
       maxLength: 5000,
     });
 
     if (spamCheck.isSpam) {
        
       console.warn(`[SPAM BLOCKED] template=${template._id} ip=${ip} keyword=${spamCheck.keyword || 'pattern'}`);
       return res.status(400).json({
         success: false,
         message: spamCheck.reason || 'Your message could not be submitted.',
         code:    'SPAM_DETECTED',
       });
     }
  
     if (template.allowedProviders && template.allowedProviders.length > 0) {
       const senderField = template.senderEmailField || 'email';
       const senderEmail = data[senderField];
 
       if (!senderEmail) {
         return res.status(400).json({
           success: false,
           message: `Email field "${senderField}" is required for this form`,
           code:    'EMAIL_REQUIRED',
         });
       }
 
       const { allowed, reason } = checkProviderAllowed(
         senderEmail,
         template.allowedProviders
       );
 
       if (!allowed) {
         return res.status(403).json({
           success: false,
           message: reason,
           code:    'PROVIDER_NOT_ALLOWED',
         });
       }
     }
 
  
     const info = await dispatchMail(template, data, 'form');
  
     let zohoResult = null;
     if (template.zohoEnabled) {
       
       if (!template.zohoClientId || !template.zohoClientSecret || !template.zohoRefreshToken) {
         console.warn(`[Zoho] Template "${template.title}" has zohoEnabled but missing credentials — skipping`);
       } else {
         try {
         
           zohoResult = await createZohoLead(data, template);
           console.log(`[Zoho] ${zohoResult.skipped ? 'Lead exists' : 'Lead created'} — id: ${zohoResult.leadId}`);
         } catch (zohoErr) {
           
           console.error(`[Zoho] Lead creation failed for template "${template.title}":`, zohoErr.message);
         }
       }
     }
 
     await Template.findByIdAndUpdate(template._id, {
       $inc: { submissionCount: 1 },
       lastSubmittedAt: new Date(),
     });
 
     return res.status(200).json({
       success:   true,
       message:   'Your message has been sent successfully!',
       messageId: info.messageId,
       ...(zohoResult && { zoho: { leadId: zohoResult.leadId, skipped: zohoResult.skipped || false } }),
     });
 
   } catch (err) {
     console.error('[handleFormSubmit]', err);
     return res.status(500).json({ success: false, message: 'Failed to send message', error: err.message });
   }
 };

exports.sendTemplate = async (req, res) => {
  try {
    const template = await Template.findById(req.params.id);
    if (!template) return res.status(404).json({ success: false, message: 'Template not found' });

    const info = await dispatchMail(template, req.body.data || {}, 'dashboard');

    return res.status(200).json({
      success:   true,
      message:   'Email sent successfully',
      messageId: info.messageId,
    });
  } catch (err) {
    console.error('[sendTemplate]', err);
    return res.status(500).json({ success: false, message: 'Failed to send email', error: err.message });
  }
};

exports.getZohoSettings = async (req, res) => {
  try {
    const userId   = req.user._id || req.user.id;
    const template = await Template.findOne(
      { _id: req.params.id, createdBy: userId },
      'zohoEnabled zohoClientId zohoClientSecret zohoRefreshToken zohoApiDomain zohoAccountsUrl zohoSkipDuplicates zohoFieldMapping zohoExtraFields'
    ).lean();

    if (!template) {
      return res.status(404).json({ success: false, message: 'Template not found' });
    }

    return res.status(200).json({ success: true, data: template });
  } catch (err) {
    console.error('[getZohoSettings]', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.saveZohoSettings = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const {
      zohoEnabled, zohoClientId, zohoClientSecret,
      zohoRefreshToken, zohoApiDomain, zohoAccountsUrl,
      zohoSkipDuplicates, zohoFieldMapping, zohoExtraFields,
    } = req.body;

    const template = await Template.findOneAndUpdate(
      { _id: req.params.id, createdBy: userId },
      {
        zohoEnabled:        !!zohoEnabled,
        zohoClientId:       zohoClientId?.trim()       || '',
        zohoClientSecret:   zohoClientSecret?.trim()   || '',
        zohoRefreshToken:   zohoRefreshToken?.trim()   || '',
        zohoApiDomain:      zohoApiDomain              || 'https://www.zohoapis.com',
        zohoAccountsUrl:    zohoAccountsUrl            || 'https://accounts.zoho.com',
        zohoSkipDuplicates: zohoSkipDuplicates !== false,
        zohoFieldMapping:   zohoFieldMapping           || {},
        zohoExtraFields:    zohoExtraFields            || {},
      },
      { new: true, runValidators: false }
    );

    if (!template) {
      return res.status(404).json({ success: false, message: 'Template not found' });
    }

    return res.status(200).json({
      success:     true,
      message:     `Zoho CRM ${template.zohoEnabled ? 'enabled' : 'disabled'} successfully`,
      zohoEnabled: template.zohoEnabled,
    });
  } catch (err) {
    console.error('[saveZohoSettings]', err);
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

exports.testZohoConnection = async (req, res) => {
  try {
    const userId   = req.user._id || req.user.id;
    const template = await Template.findOne({ _id: req.params.id, createdBy: userId });
    
    if (!template) {
      return res.status(404).json({ success: false, message: 'Template not found' });
    }

    if (!template.zohoEnabled) {
      return res.status(400).json({ success: false, message: 'Zoho is not enabled for this template' });
    }

    if (!template.zohoClientId || !template.zohoClientSecret || !template.zohoRefreshToken) {
      return res.status(400).json({
        success: false,
        message: 'Zoho credentials are incomplete. Please fill in Client ID, Client Secret, and Refresh Token.',
      });
    }

    const result = await validateZohoCredentials(template);

    return res.status(result.valid ? 200 : 400).json({
      success: result.valid,
      message: result.message,
      orgName: result.orgName || null,
    });

  } catch (err) {
    console.error('[testZohoConnection]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.testSend = async (req, res) => {
  try {
    const { to, subject, html, data = {} } = req.body;

    if (!to || !subject || !html) {
      return res.status(400).json({ success: false, message: 'to, subject, and html are required' });
    }

    let resolvedSubject = subject;
    let resolvedHtml    = html;
    Object.entries(data).forEach(([key, value]) => {
      const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
      resolvedSubject = resolvedSubject.replace(regex, value ?? '');
      resolvedHtml    = resolvedHtml.replace(regex, value ?? '');
    });

    const info = await transporter.sendMail({
      from:    buildFrom(null),
      to:      Array.isArray(to) ? to.join(', ') : to,
      subject: resolvedSubject,
      html:    resolvedHtml,
    });

    return res.status(200).json({
      success:   true,
      message:   'Test email sent',
      messageId: info.messageId,
    });
  } catch (err) {
    console.error('[testSend]', err);
    return res.status(500).json({ success: false, message: 'Failed to send test email', error: err.message });
  }
};
