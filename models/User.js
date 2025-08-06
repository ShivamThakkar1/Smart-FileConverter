const mongoose = require('mongoose');

const historySchema = new mongoose.Schema({
  originalName: {
    type: String,
    required: true
  },
  fromType: {
    type: String,
    required: true
  },
  toType: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['success', 'failed', 'processing'],
    default: 'processing'
  },
  fileSize: {
    type: Number,
    default: 0
  },
  processingTime: {
    type: Number, // in seconds
    default: 0
  },
  error: {
    type: String,
    default: null
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

const userSchema = new mongoose.Schema({
  userId: {
    type: Number,
    required: true,
    unique: true
    // Removed duplicate index: true since unique already creates an index
  },
  username: {
    type: String,
    default: null
  },
  firstName: {
    type: String,
    default: null
  },
  lastName: {
    type: String,
    default: null
  },
  source: {
    type: String,
    default: 'direct',
    enum: ['direct', 'referral', 'channel', 'group', 'ads']
  },
  referralSource: {
    type: String,
    default: null
  },
  freeCredits: {
    type: Number,
    default: 15,
    min: 0
  },
  paidCredits: {
    type: Number,
    default: 0,
    min: 0
  },
  totalCreditsUsed: {
    type: Number,
    default: 0
  },
  lastReset: {
    type: Date,
    default: Date.now
  },
  history: [historySchema],
  preferences: {
    language: {
      type: String,
      default: 'en'
    },
    notifications: {
      type: Boolean,
      default: true
    },
    defaultQuality: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium'
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isBanned: {
    type: Boolean,
    default: false
  },
  banReason: {
    type: String,
    default: null
  },
  lastActivity: {
    type: Date,
    default: Date.now
  },
  totalConversions: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Indexes for better performance (removed duplicate userId index)
userSchema.index({ lastActivity: -1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ source: 1 });
userSchema.index({ isBanned: 1 });
userSchema.index({ isActive: 1 });

// Virtual for total available credits
userSchema.virtual('totalCredits').get(function() {
  return this.freeCredits + this.paidCredits;
});

// Method to add conversion to history
userSchema.methods.addConversion = function(conversionData) {
  this.history.push(conversionData);
  this.totalConversions += 1;
  
  // Keep only last 50 conversions to save space
  if (this.history.length > 50) {
    this.history = this.history.slice(-50);
  }
  
  return this.save();
};

// Method to deduct credits
userSchema.methods.deductCredit = function() {
  if (this.paidCredits > 0) {
    this.paidCredits -= 1;
  } else if (this.freeCredits > 0) {
    this.freeCredits -= 1;
  } else {
    throw new Error('No credits available');
  }
  
  this.totalCreditsUsed += 1;
  return this.save();
};

// Method to check if user has credits
userSchema.methods.hasCredits = function() {
  return (this.freeCredits + this.paidCredits) > 0;
};

// Method to get credit summary
userSchema.methods.getCreditSummary = function() {
  return {
    free: this.freeCredits,
    paid: this.paidCredits,
    total: this.freeCredits + this.paidCredits,
    used: this.totalCreditsUsed
  };
};

// Static method to get user stats
userSchema.statics.getStats = async function() {
  const totalUsers = await this.countDocuments();
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const activeToday = await this.countDocuments({
    lastActivity: { $gte: today }
  });
  
  const thisWeek = new Date();
  thisWeek.setDate(thisWeek.getDate() - 7);
  
  const activeThisWeek = await this.countDocuments({
    lastActivity: { $gte: thisWeek }
  });
  
  const totalConversions = await this.aggregate([
    { $group: { _id: null, total: { $sum: '$totalConversions' } } }
  ]);
  
  return {
    totalUsers,
    activeToday,
    activeThisWeek,
    totalConversions: totalConversions[0]?.total || 0
  };
};

// Static method to find active users
userSchema.statics.findActiveUsers = function(days = 7) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  
  return this.find({
    lastActivity: { $gte: cutoffDate },
    isActive: true,
    isBanned: false
  });
};

module.exports = mongoose.model('User', userSchema);