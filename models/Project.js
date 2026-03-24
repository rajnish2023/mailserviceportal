const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema(
  {

    createdBy: {
      type:  mongoose.Schema.Types.ObjectId,
      ref:   'User',
      index: true,
    },

    name: {
      type:      String,
      required:  [true, 'Project name is required'],
      trim:      true,
      maxlength: 80,
    },
    isActive: {
      type:    Boolean,
      default: true,
    },
   domain:{
    type:String
  }
},
  {
    timestamps: true,
  }
);
 

module.exports = mongoose.model('Project', projectSchema);
