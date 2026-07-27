const User = require('../models/User');
const Template = require('../models/Template');
const bcrypt = require('bcrypt');

// Get all users with their template counts
exports.getUsersPage = async (req, res) => {
  try {
    const users = await User.find({}, 'name email role phone company bio').lean();
    
    // Count templates for each user
    const counts = await Template.aggregate([
      { $group: { _id: '$createdBy', count: { $sum: 1 } } }
    ]);
    
    const countMap = {};
    counts.forEach(c => {
      if (c._id) {
        countMap[c._id.toString()] = c.count;
      }
    });
    
    users.forEach(u => {
      u.templateCount = countMap[u._id.toString()] || 0;
    });

    res.render('admin/users', {
      title: 'User Management',
      user: req.user,
      users
    });
  } catch (err) {
    console.error('[getUsersPage]', err);
    res.status(500).send('Server Error');
  }
};

// Create a new user by Admin
exports.createUser = async (req, res) => {
  try {
    const { name, email, password, role, phone, company, bio } = req.body;

    if (!name?.trim() || !email?.trim() || !password) {
      return res.status(400).json({ success: false, message: 'Name, email, and password are required.' });
    }

    const existingUser = await User.findOne({ email: email.trim().toLowerCase() });
    if (existingUser) {
      return res.status(409).json({ success: false, message: 'Email is already registered.' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const newUser = await User.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password: hashedPassword,
      role: role || 'user',
      phone: phone?.trim() || '',
      company: company?.trim() || '',
      bio: bio?.trim() || ''
    });

    return res.status(201).json({
      success: true,
      message: 'User created successfully.',
      data: {
        id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role
      }
    });
  } catch (err) {
    console.error('[createUser]', err);
    return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
};

// Update a user by Admin
exports.updateUser = async (req, res) => {
  try {
    const { name, email, password, role, phone, company, bio } = req.body;
    const userId = req.params.id;

    if (!name?.trim() || !email?.trim()) {
      return res.status(400).json({ success: false, message: 'Name and email are required.' });
    }

    const existingUser = await User.findOne({
      email: email.trim().toLowerCase(),
      _id: { $ne: userId }
    });
    if (existingUser) {
      return res.status(409).json({ success: false, message: 'Email is already in use.' });
    }

    const updateData = {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      role: role || 'user',
      phone: phone?.trim() || '',
      company: company?.trim() || '',
      bio: bio?.trim() || ''
    };

    if (password && password.trim() !== '') {
      if (password.length < 8) {
        return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });
      }
      updateData.password = await bcrypt.hash(password, 12);
      // Invalidate current sessions if password changes
      updateData.$inc = { tokenVersion: 1 };
    }

    const updatedUser = await User.findByIdAndUpdate(userId, updateData, { new: true }).select('-password');
    if (!updatedUser) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    return res.status(200).json({
      success: true,
      message: 'User updated successfully.',
      data: updatedUser
    });
  } catch (err) {
    console.error('[updateUser]', err);
    return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
};

// Delete a user by Admin
exports.deleteUser = async (req, res) => {
  try {
    const userId = req.params.id;

    // Prevent admin from deleting themselves
    if (userId === req.user._id.toString()) {
      return res.status(400).json({ success: false, message: 'You cannot delete your own admin account.' });
    }

    const user = await User.findByIdAndDelete(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    // Clean up templates created by this user
    await Template.deleteMany({ createdBy: userId });

    return res.status(200).json({ success: true, message: 'User and their templates deleted successfully.' });
  } catch (err) {
    console.error('[deleteUser]', err);
    return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
};

// Transfer template ownership
exports.transferTemplate = async (req, res) => {
  try {
    const { templateId, targetUserId } = req.body;

    if (!templateId || !targetUserId) {
      return res.status(400).json({ success: false, message: 'Template ID and target User ID are required.' });
    }

    const [template, targetUser] = await Promise.all([
      Template.findById(templateId),
      User.findById(targetUserId)
    ]);

    if (!template) {
      return res.status(404).json({ success: false, message: 'Template not found.' });
    }
    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'Target user not found.' });
    }

    template.createdBy = targetUserId;
    await template.save();

    if (template.projectId) {
      const Project = require('../models/Project');
      await Project.findByIdAndUpdate(template.projectId, { createdBy: targetUserId });
    }

    return res.status(200).json({
      success: true,
      message: `Template "${template.title}" successfully transferred to ${targetUser.name}.`
    });
  } catch (err) {
    console.error('[transferTemplate]', err);
    return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
};

// Transfer project ownership
exports.transferProject = async (req, res) => {
  try {
    const { projectId, targetUserId } = req.body;

    if (!projectId || !targetUserId) {
      return res.status(400).json({ success: false, message: 'Project ID and target User ID are required.' });
    }

    const Project = require('../models/Project');
    const [project, targetUser] = await Promise.all([
      Project.findById(projectId),
      User.findById(targetUserId)
    ]);

    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found.' });
    }
    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'Target user not found.' });
    }

    project.createdBy = targetUserId;
    await project.save();

    // Also transfer all templates associated with this project to the new owner!
    await Template.updateMany({ projectId: projectId }, { createdBy: targetUserId });

    return res.status(200).json({
      success: true,
      message: `Project "${project.name}" and all its templates successfully transferred to ${targetUser.name}.`
    });
  } catch (err) {
    console.error('[transferProject]', err);
    return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
};
