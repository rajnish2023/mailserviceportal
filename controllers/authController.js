const bcrypt     = require('bcrypt');
const jwt        = require('jsonwebtoken');
const crypto     = require('crypto');
const nodemailer = require('nodemailer');
const User       = require('../models/User');
 
const transporter = nodemailer.createTransport({
  host:   process.env.MAIL_HOST || 'sandbox.smtp.mailtrap.io',
  port:   Number(process.env.MAIL_PORT) || 2525,
  secure: false,
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
  tls: { rejectUnauthorized: false },
});

 
const COOKIE_OPTIONS = {
  httpOnly: true,                                       
  sameSite: 'lax',                                      
  secure:   process.env.NODE_ENV === 'production',      
  maxAge:   7 * 24 * 60 * 60 * 1000,                   
};
 
function verifyToken(token) {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }
}

 
exports.checkAuth = (req, res) => {
  const decoded = verifyToken(req.cookies?.token);
  if (decoded) return res.redirect('/dashboard');
  return res.render('auth/login', { layout: false });
};

exports.renderForgot = (req, res) => {
  return res.render('auth/forgot', { layout: false });
};

exports.me = (req, res) => {
  const decoded = verifyToken(req.cookies?.token);
  if (decoded) return res.status(200).json({ success: true, user: decoded });
  return res.status(401).json({ success: false });
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email?.trim() || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required.',
      });
    }

    const user = await User.findOne({ email: email.trim().toLowerCase() })
                           .select('+password +tokenVersion');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    const payload = {
      id:           user._id,
      name:         user.name,
      email:        user.email,
      role:         user.role         || 'user',
      tokenVersion: user.tokenVersion || 0,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.cookie('token', token, COOKIE_OPTIONS);

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      user:    payload,
    });

  } catch (err) {
    console.error('[login]', err);
    return res.status(500).json({
      success: false,
      message: 'Something went wrong. Please try again.',
    });
  }
};

exports.logout = async (req, res) => {
  try {
    const decoded = verifyToken(req.cookies?.token);
    if (decoded?.id) {
    
      await User.findByIdAndUpdate(decoded.id, { $inc: { tokenVersion: 1 } });
    }
  } catch {  }

  res.clearCookie('token', COOKIE_OPTIONS);
  return res.redirect('/');
};

exports.auth = async (req, res, next) => {
  try {
    const decoded = verifyToken(req.cookies?.token);

    if (!decoded) {
      return req.xhr || req.headers.accept?.includes('application/json')
        ? res.status(401).json({ success: false, message: 'Unauthorized' })
        : res.redirect('/');
    }

    const user = await User.findById(decoded.id, 'name email role tokenVersion');
    if (!user || (user.tokenVersion || 0) !== (decoded.tokenVersion || 0)) {
      res.clearCookie('token', COOKIE_OPTIONS);
      return res.redirect('/');
    }

    req.user = user; 
    next();

  } catch {
    res.clearCookie('token', COOKIE_OPTIONS);
    return res.redirect('/');
  }
};


exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email?.trim()) {
      return res.status(400).json({ success: false, message: 'Email is required.' });
    }

    const user = await User.findOne({ email: email.trim().toLowerCase() });

    if (!user) {
      return res.status(200).json({
        success: true,
        message: 'If that email exists, a reset link has been sent.',
      });
    }

    const resetToken  = crypto.randomBytes(32).toString('hex');
    const tokenExpiry = new Date(Date.now() + 60 * 60 * 1000);

    user.resetToken       = resetToken;
    user.resetTokenExpiry = tokenExpiry;
    await user.save();
    const rawBase  = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    const baseUrl  = rawBase.replace(/\/+$/, '');  
    const resetUrl = `${baseUrl}/reset/${resetToken}`;

    console.log('[forgotPassword] Reset URL:', resetUrl); 

    await transporter.sendMail({
      from:    `"${process.env.MAIL_FROM_NAME || 'MailPortal'}" <${process.env.MAIL_FROM || 'no-reply@mailportal.com'}>`,
      to:      user.email,
      subject: 'Reset your MailPortal password',
      html:    buildResetEmailHtml({ name: user.name, resetUrl, supportEmail: process.env.MAIL_FROM || 'support@mailportal.com' }),
    });

    console.log(`[forgotPassword] Reset email sent → ${user.email}`);

    return res.status(200).json({
      success: true,
      message: 'If that email exists, a reset link has been sent.',
    });

  } catch (err) {
    console.error('[forgotPassword]', err);
    return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
};

exports.renderResetPage = async (req, res) => {
  try {
    const user = await User.findOne({
      resetToken:       req.params.token,
      resetTokenExpiry: { $gt: new Date() },
    });

    if (!user) return res.redirect('/?error=link_expired');

    const tokenValue = req.params.token;

    res.locals.token       = tokenValue;
    res.locals.resetToken  = tokenValue;

    return res.render('auth/reset', {
      layout:     false,
      token:      tokenValue,
      resetToken: tokenValue,
    });
  } catch (err) {
    console.error('[renderResetPage]', err);
    return res.redirect('/');
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { token, password, confirmPassword } = req.body;

    if (!token || !password) {
      return res.status(400).json({ success: false, message: 'Token and new password are required.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'Passwords do not match.' });
    }

    const user = await User.findOne({
      resetToken:       token,
      resetTokenExpiry: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'This reset link is invalid or has expired. Please request a new one.',
      });
    }

   
    user.password         = await bcrypt.hash(password, 12);
    user.resetToken       = null;
    user.resetTokenExpiry = null;
   
    user.tokenVersion     = (user.tokenVersion || 0) + 1;
    await user.save();

    console.log(`[resetPassword] Password updated → ${user.email}`);

    return res.status(200).json({
      success: true,
      message: 'Password reset successfully! You can now log in.',
    });

  } catch (err) {
    console.error('[resetPassword]', err);
    return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
};


function buildResetEmailHtml({ name, resetUrl, supportEmail }) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f0f2f9;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0"
             style="max-width:520px;background:#ffffff;border-radius:16px;border:1px solid #e2e6f0;overflow:hidden;box-shadow:0 4px 24px rgba(67,97,238,.1);">

        <!-- Accent bar -->
        <tr><td style="height:3px;background:linear-gradient(90deg,#4361ee,#7c3aed,#e8274b);"></td></tr>

        <!-- Header -->
        <tr><td style="padding:32px 36px 20px;text-align:center;">
          <table cellpadding="0" cellspacing="0" style="margin:0 auto 22px;">
            <tr>
              <td style="width:36px;height:36px;background:linear-gradient(135deg,#4361ee,#7c3aed);border-radius:9px;text-align:center;vertical-align:middle;">
                <span style="color:#fff;font-weight:800;font-size:15px;line-height:36px;">M</span>
              </td>
              <td style="padding-left:8px;font-size:17px;font-weight:800;color:#0d1117;letter-spacing:-.3px;vertical-align:middle;">
                Mail<span style="color:#4361ee;">Portal</span>
              </td>
            </tr>
          </table>
          <div style="width:60px;height:60px;background:#eef0fd;border-radius:50%;margin:0 auto 18px;text-align:center;line-height:60px;font-size:26px;border:1.5px solid rgba(67,97,238,.2);">🔒</div>
          <h1 style="font-size:22px;font-weight:800;color:#0d1117;margin:0 0 10px;letter-spacing:-.5px;">Reset your password</h1>
          <p style="font-size:14px;color:#7a829e;margin:0;line-height:1.7;">
            Hi <strong style="color:#0d1117;">${name || 'there'}</strong>,<br>
            We received a request to reset your MailPortal password.<br>
            Click the button below to choose a new one.
          </p>
        </td></tr>

        <!-- Button -->
        <tr><td style="padding:20px 36px 28px;text-align:center;">
          <a href="${resetUrl}"
             style="display:inline-block;padding:14px 40px;background:linear-gradient(135deg,#4361ee,#3451d1);color:#fff;text-decoration:none;border-radius:10px;font-size:15px;font-weight:700;box-shadow:0 4px 16px rgba(67,97,238,.3);">
            Reset Password &rarr;
          </a>
        </td></tr>

        <!-- URL fallback -->
        <tr><td style="padding:0 36px 22px;">
          <div style="background:#f8f9ff;border:1px solid #e2e6f0;border-radius:10px;padding:14px 16px;">
            <p style="font-size:12px;color:#7a829e;margin:0 0 5px;">Or copy this link:</p>
            <p style="font-size:11.5px;color:#4361ee;word-break:break-all;margin:0;font-family:monospace;">${resetUrl}</p>
          </div>
        </td></tr>

        <!-- Warning -->
        <tr><td style="padding:0 36px 28px;">
          <div style="background:#fff8ec;border:1px solid #fdedc8;border-radius:10px;padding:12px 16px;">
            <p style="font-size:12.5px;color:#a05c00;margin:0;line-height:1.6;">
              &#9200; This link expires in <strong>1 hour</strong>.
              If you didn't request this, you can safely ignore this email.
            </p>
          </div>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:20px 36px;border-top:1px solid #e2e6f0;text-align:center;">
          <p style="font-size:12px;color:#b0b6c8;margin:0;line-height:1.7;">
            Sent by <strong style="color:#7a829e;">MailPortal CRM</strong> &bull;
            <a href="mailto:${supportEmail}" style="color:#4361ee;text-decoration:none;">${supportEmail}</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}


exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id || req.user.id)
      .select('-password -resetToken -resetTokenExpiry')
      .lean();

    if (!user) return res.redirect('/dashboard');

    return res.render('user/profile', {
      title: 'My Profile',
      user,
      success: req.query.success || null,
      error:   req.query.error   || null,
    });
  } catch (err) {
    console.error('[getProfile]', err);
    return res.redirect('/dashboard');
  }
};

exports.changePassword = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ success: false, message: 'All password fields are required.' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, message: 'New password must be at least 8 characters.' });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'New passwords do not match.' });
    }
    if (currentPassword === newPassword) {
      return res.status(400).json({ success: false, message: 'New password must be different from your current password.' });
    }
 
    const user = await User.findById(userId).select('+password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    
    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect.' });
    }
 
    user.password     = await bcrypt.hash(newPassword, 12);
    user.tokenVersion = (user.tokenVersion || 0) + 1;  
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Password changed successfully. Please log in again.',
      logout:  true, 
    });

  } catch (err) {
    console.error('[changePassword]', err);
    return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const { name, email, phone, bio, company } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ success: false, message: 'Name is required.' });
    }
    if (!email?.trim()) {
      return res.status(400).json({ success: false, message: 'Email is required.' });
    }

     
    const existing = await User.findOne({
      email: email.trim().toLowerCase(),
      _id:   { $ne: userId },
    });
    if (existing) {
      return res.status(409).json({ success: false, message: 'That email is already in use.' });
    }

    const updated = await User.findByIdAndUpdate(
      userId,
      {
        name:    name.trim(),
        email:   email.trim().toLowerCase(),
        phone:   phone?.trim()   || '',
        bio:     bio?.trim()     || '',
        company: company?.trim() || '',
      },
      { new: true, runValidators: true }
    ).select('-password');

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully.',
      user: {
        name:    updated.name,
        email:   updated.email,
        phone:   updated.phone,
        bio:     updated.bio,
        company: updated.company,
      },
    });
  } catch (err) {
    console.error('[updateProfile]', err);
    return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
};