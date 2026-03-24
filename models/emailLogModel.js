const mongoose = require('mongoose');
 
const emailLogSchema = new mongoose.Schema(
  { 
    templateId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Template',
      required: true,
      index:    true,
    },

    templateTitle: {
      type:    String,
      default: '',
    },

    
    projectId: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     'Project',
      default: null,
      index:   true,
    },

    projectName: {
      type:    String,
      default: '',
    },

     
    projectDomain: {
      type:    String,
      default: '',
    },

    
    senderDomain: {
      type:    String,
      default: '',
    },

   
    triggeredBy: {
      type: String,
      enum: ['form', 'dashboard', 'api'],
      default: 'form',
    },

     
    subject: {
      type: String,
      default: '',
    },

    
    to:  { type: [String], default: [] },
    cc:  { type: [String], default: [] },
    bcc: { type: [String], default: [] },

     
    formData: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    
    messageId: {
      type: String,
      default: '',
    },

     
    status: {
      type: String,
      enum: ['sent', 'failed'],
      default: 'sent',
    },
 
    errorMessage: {
      type: String,
      default: '',
    },

     
    fromAddress: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,  
  }
);

 
emailLogSchema.index({ createdAt: -1 });
emailLogSchema.index({ templateId: 1, createdAt: -1 });
emailLogSchema.index({ projectId:  1, createdAt: -1 });
emailLogSchema.index({ status: 1 });
emailLogSchema.index({ senderDomain: 1 });

module.exports = mongoose.model('EmailLog', emailLogSchema);
