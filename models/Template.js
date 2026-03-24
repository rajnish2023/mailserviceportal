const mongoose = require('mongoose');
 
function generateApiKey() {
  return 'tpl_' + new mongoose.Types.ObjectId().toHexString();
}

const templateSchema = new mongoose.Schema(
  {
    
    createdBy: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'User',
      required: [true, 'Template owner is required'],
      index:    true,
    },

    projectId: {
          type:    mongoose.Schema.Types.ObjectId,
          ref:     'Project',
          default: null,
          index:   true,
        },

    title: {
      type: String,
      required: [true, 'Template title is required'],
      trim: true,
    },

    subject: {
      type: String,
      required: [true, 'Email subject is required'],
      trim: true,
    },

    html: {
      type: String,
      required: [true, 'Email HTML content is required'],
    },
 
    fromName: {
      type: String,
      trim: true,
      default: '',
    },

    fromEmail: {
      type: String,
      trim: true,
      lowercase: true,
      default: '',
    },

    replyTo: {
      type: String,
      trim: true,
      lowercase: true,
      default: '',
    },

    
    to: {
      type: [String],
      required: [true, 'At least one "To" email is required'],
      validate: {
        validator: (arr) => arr.length > 0,
        message: 'At least one "To" email is required',
      },
    },

    cc:  { type: [String], default: [] },
    bcc: { type: [String], default: [] },

    
    apiKey: {
      type:   String,
      unique: true,
      index:  true,
       
    },

     
    isActive: {
      type:    Boolean,
      default: true,
    },

     
    submissionCount: {
      type:    Number,
      default: 0,
    },

    lastSubmittedAt: {
      type:    Date,
      default: null,
    },

     
    rateLimitMs: {
      type:    Number,
      default: 5 * 60 * 1000,  
    },
 
    rateLimitMax: {
      type:    Number,
      default: 1,
    },

    
    allowedProviders: {
      type:    [String],
      default: [],  
      enum: {
        values:  ['gmail', 'outlook', 'yahoo', 'icloud', 'custom'],
        message: '{VALUE} is not a supported provider',
      },
    },

     
    senderEmailField: {
      type:    String,
      default: 'email',
      trim:    true,
    },

     
    zohoEnabled: {
      type:    Boolean,
      default: false,
    },

    
    zohoClientId: {
      type:    String,
      default: '',
      trim:    true,
    },

    zohoClientSecret: {
      type:    String,
      default: '',
      trim:    true,
    },
 
    zohoRefreshToken: {
      type:    String,
      default: '',
      trim:    true,
    },

    
    zohoApiDomain: {
      type:    String,
      default: 'https://www.zohoapis.com',
      trim:    true,
    },

     
    zohoAccountsUrl: {
      type:    String,
      default: 'https://accounts.zoho.com',
      trim:    true,
    },

     
    zohoFieldMapping: {
      type:    mongoose.Schema.Types.Mixed,
      default: {},
    },

     
    zohoExtraFields: {
      type:    mongoose.Schema.Types.Mixed,
      default: {},
    },

     
    zohoSkipDuplicates: {
      type:    Boolean,
      default: true,
    },
  },
  {
    timestamps: true,  
  }
);

 
templateSchema.index(
  { createdBy: 1, title: 1 },
  {
    unique: true,
    collation: { locale: 'en', strength: 2 }, 
  }
);

 
templateSchema.pre('save', async function () {
  if (!this.apiKey) {
    this.apiKey = generateApiKey();
  }
});
 
templateSchema.methods.regenerateApiKey = async function () {
  this.apiKey = generateApiKey();
  await this.save();
  return this.apiKey;
};

module.exports = mongoose.model('Template', templateSchema);
