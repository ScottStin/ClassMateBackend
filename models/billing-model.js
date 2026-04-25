const mongoose = require('mongoose');

const studentBillingSchema = new mongoose.Schema({
  stripeCustomerId: {
    type: String,
  },

  subscriptionId: {
    type: String,
  },

  subscriptionStatus: {
    type: String,
    enum: ['active', 'trialing', 'past_due', 'canceled'],
  },

  currentPeriodEnd: {
    type: Number, // unix timestamp (Stripe standard)
  },

  subscriptionPackageId: { type: String, default: null }
}, { _id: false });

const schoolBillingSchema = new mongoose.Schema({
  stripeCustomerId: {
    type: String,
  },

  payoutsEnabled: {
    type: Boolean,
  },

  chargesEnabled: {
    type: Boolean,
  },
}, { _id: false });

const paymentHistorySchema  = new mongoose.Schema(
  {
    // 🔗 Who made the payment
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'userModel',
      required: true,
      index: true,
    },

    // 🔁 Optional: who received the payment (school, platform, etc.)
    targetUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'userModel',
    },

    // Stripe references (source of truth)
    stripePaymentIntentId: {
      type: String,
      index: true,
    },

    stripeInvoiceId: {
      type: String,
      index: true,
    },

    stripeCustomerId: {
      type: String,
    },

    // 💰 Money
    amount: {
      type: Number, // stored in major units (e.g. 9.99)
      required: true,
    },

    currency: {
      type: String,
      default: 'usd',
    },

    status: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'refunded'],
      required: true,
    },

    // 🔄 Business meaning
    paymentType: {
      type: String,
      enum: ['student_to_school', 'school_to_platform'],
      required: true,
    },

    description: {
      type: String,
    },

    // Stripe timestamp (preferred over Mongo createdAt)
    stripeCreatedAt: {
      type: Number, // unix timestamp
    },
  },
  {
    timestamps: true, // still useful for UI sorting
  }
);

const PaymentHistory = mongoose.model('PaymentHistory', paymentHistorySchema);

module.exports = {
  studentBillingSchema,
  schoolBillingSchema,
  PaymentHistory
};
