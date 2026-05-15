const express = require("express");
const router = express.Router();
const userModel = require('../models/user-models');
const schoolModel = require('../models/school-models');
const Stripe = require('stripe');
const { PaymentHistory } = require('../models/billing-model');
const { getIo } = require('../socket-io');
const { trackStudentActivity } = require('./StudentActivityRoute');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-08-16' // todo - update with latest version.
});

/**
 * ===========================================
 * Handling Payment Methods
 * ===========================================
 */

router.post("/setup-intent", async (req, res, next) => {
  try {
    const userId = req.body.userId;
    if (!userId) return res.status(400).json({ message: "Missing userId" });

    const user = await userModel.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.userType !== "student") {
      return res.status(403).json({ message: "Only students can add payment methods" });
    }

    const customerId = await getOrCreateStripeCustomer(user);

    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ["card"]
    });

    res.json({ clientSecret: setupIntent.client_secret });
  } catch (err) {
    next(err);
  }
});

router.post('/set-default-payment-method', async (req, res, next) => {
  try {
    const { userId, paymentMethodId } = req.body;

    const user = await userModel.findById(userId);
    if (!user?.studentBilling?.stripeCustomerId) {
      return res.status(400).json({ message: 'No Stripe customer' });
    }

    await stripe.customers.update(user.studentBilling.stripeCustomerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.get("/payment-method/:userId", async (req, res, next) => {
  try {
    const user = await userModel.findById(req.params.userId);

    if (!user?.studentBilling?.stripeCustomerId) {
      return res.json(null);
    }

    const methods = await stripe.paymentMethods.list({
      customer: user.studentBilling.stripeCustomerId,
      type: "card"
    });

    if (!methods.data.length) {
      return res.json(null);
    }

    const card = methods.data[0].card;

    res.json({
      brand: card.brand,
      last4: card.last4,
      expMonth: card.exp_month,
      expYear: card.exp_year
    });
  } catch (err) {
    next(err);
  }
});

router.delete("/payment-method/:userId", async (req, res, next) => {
  try {
    const user = await userModel.findById(req.params.userId);

    if (!user?.studentBilling?.stripeCustomerId) {
      return res.json({ success: true });
    }

    const methods = await stripe.paymentMethods.list({
      customer: user.studentBilling.stripeCustomerId,
      type: "card"
    });

    if (methods.data.length) {
      await stripe.paymentMethods.detach(methods.data[0].id);
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

/**
 * ===========================================
 * Payment History
 * ===========================================
 */

router.get("/history/:userId", async (req, res, next) => {
  try {
    const history = await PaymentHistory
      .find({ userId: req.params.userId })
      .sort({ createdAt: -1 });

    res.json(history);
  } catch (err) {
    next(err);
  }
});

router.get("/history-school/:schoolId", async (req, res, next) => {
  try {
    const history = await PaymentHistory
      .find({ schoolId: req.params.schoolId })
      .sort({ createdAt: -1 });

    res.json(history);
  } catch (err) {
    next(err);
  }
});

/**
 * ===========================================
 * Making Payments (single payments only)
 * ===========================================
 */

router.post('/charge', async (req, res, next) => {
  try {
    const { userId, amount, currency = 'usd', description, schoolId } = req.body;


    if (!userId || !amount || !schoolId) {
      return res.status(400).json({ message: 'Missing parameters (userId, amount, or school account)' });
    }

    const school = await schoolModel.findById(schoolId);
    let schoolStripeAccountId = school?.stripe?.stripeAccountId;

    if(!schoolStripeAccountId) {
      return res.status(400).json({ message: 'Missing stripe account data for school' });
    }

    const user = await userModel.findById(userId);
    if (!user?.studentBilling?.stripeCustomerId) {
      return res.status(400).json({ message: 'No payment method on file' });
    }

    // Get default payment method
    const customer = await stripe.customers.retrieve(
      user.studentBilling.stripeCustomerId
    );

    const paymentMethodId =
      customer.invoice_settings.default_payment_method;

    if (!paymentMethodId) {
      return res.status(400).json({ message: 'No default payment method' });
    }

    // Create PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // cents
      currency,
      customer: user.studentBilling.stripeCustomerId,
      payment_method: paymentMethodId,
      off_session: true,
      confirm: true,
      description,
      transfer_data: {
        destination: schoolStripeAccountId, // ensure the funds go to the correct school
      },
      metadata: {
        userId: user._id.toString(),
        schoolId: schoolId,
        paymentType: 'student_to_school',
      },
    });

    // Save payment history
    const paymentHistory = await PaymentHistory.create({
      userId: user._id,
      schoolId: schoolId,
      stripePaymentIntentId: paymentIntent.id,
      stripeCustomerId: user.studentBilling.stripeCustomerId,
      amount,
      description,
      currency,
      status: 'paid',
      paymentType: 'student_to_school',
      stripeCreatedAt: paymentIntent.created,
    });

    // --- emit socket event:
    if (paymentHistory) {
      const io = getIo();
      io.emit('paymentEvent-' + schoolId, {action: 'paymentCreated', data: paymentHistory});
    }

    // Update student activity (student should be marked as active for the month when they make a payment):
    await trackStudentActivity(user.schoolId, user._id);

    res.json({ success: true, paymentIntentId: paymentIntent.id });
  } catch (err) {
    next(err);
  }
});

  router.post("/refund-payment", async (req, res, next) => {
    try {
      // 1. ADD schoolId to your destructuring here
      const { paymentHistoryId, reason, amount, recipient, schoolId } = req.body;

      // 2. FIX: Use findOne with the correct field name
      const payment = await PaymentHistory.findOne({ stripePaymentIntentId: paymentHistoryId });

      if (!payment) {
        return res.status(404).json({ message: "Payment record not found." });
      }

      if (payment.status === "refunded") {
        return res.status(400).json({ message: "This payment has already been refunded." });
      }

      // 3. Execute the refund on Stripe
      const refund = await stripe.refunds.create({
        payment_intent: payment.stripePaymentIntentId,
        amount: amount ? Math.round(amount * 100) : undefined,
        reverse_transfer: true,
        refund_application_fee: true,
        metadata: {
          reason: reason || "Admin initiated refund",
          mongoPaymentId: payment._id.toString(),
        },
      });

      // 4. Update the ORIGINAL record
      payment.status = amount && amount < payment.amount ? "partially_refunded" : "refunded";
      payment.refundReason = reason || "No reason provided";
      payment.stripeRefundId = refund.id; 
      await payment.save();

      // 5. Create the REFUND history record
      // const newHistoryRecord = await PaymentHistory.create({
      //   userId: recipient._id,
      //   schoolId: schoolId,
      //   stripePaymentIntentId: payment.stripePaymentIntentId,
      //   stripeCustomerId: recipient.studentBilling.stripeCustomerId,
      //   amount: amount || payment.amount, // Record the amount being sent back
      //   description: `Refund: ${reason}`,
      //   currency: 'usd',
      //   status: 'refunded',
      //   paymentType: 'school_to_student',
      //   stripeCreatedAt: new Date(),
      // });

      // --- emit socket event:
      if (payment) {
        const io = getIo();
        io.emit('paymentEvent-' + schoolId, {action: 'paymentHistoryUpdated', data: payment});
      }

      res.json({
        success: true,
        status: payment.status,
        refundId: refund.id,
        paymentHistory: payment
      });

    } catch (err) {
      console.error("Stripe Refund Error:", err);
      res.status(500).json({ error: err.message });
    }
  });

/**
 * ===========================================
 * Subscription Payments:
 * ===========================================
 */

router.post('/start-subscription-payment', async (req, res, next) => {
  try {
     const { 
      studentId, 
      stripePriceId, 
      packageId,
      price,
      description, 
      metadata = {},
      schoolId,
      } = req.body;

      if (!studentId || !stripePriceId || !packageId) {
        return res.status(400).json({ message: 'Missing required parameters.' });
      }

      const school = await schoolModel.findById(schoolId);
      let schoolStripeAccountId = school?.stripe?.stripeAccountId;

    // --- get user:

    const user = await userModel.findById(studentId);
    if (!user?.studentBilling?.stripeCustomerId) {
      return res.status(400).json({ message: 'User does not have a Stripe Customer ID' });
    }

    // --- Ensure that user doesn't have existing subscription:

    const subs = await stripe.subscriptions.list({
      customer: user.studentBilling.stripeCustomerId,
      status: "all",
      limit: 99
    });

    const activeSub = subs.data.find((sub) => {
      const isActive = sub.status === "active" || sub.status === "trialing";
      const isCancelling = sub.cancel_at_period_end === true;
      return isActive && !isCancelling;
    });

    if (activeSub) {
      return res.status(400).json({
        message: "User already has an active subscription. Cancel it before starting another.",
        subscriptionId: activeSub.id,
        status: activeSub.status,
        currentPeriodEnd: activeSub.current_period_end
      });
    }

    // --- Get payment method:

    const customer = await stripe.customers.retrieve(
      user.studentBilling.stripeCustomerId
    );
    const paymentMethodId = customer.invoice_settings.default_payment_method;
    if (!paymentMethodId) {
      return res.status(400).json({ message: 'No default payment method on file' });
    }

    // --- Create the Subscription

    const subscription = await stripe.subscriptions.create({
      customer: user.studentBilling.stripeCustomerId,
      description: description || `Subscription for ${user.email}`,
      items: [{ price: stripePriceId }],
      default_payment_method: paymentMethodId,
      payment_behavior: 'error_if_incomplete', // This makes Stripe fail if it cannot charge immediately

      transfer_data: {
        destination: schoolStripeAccountId, // The school gets the payment
      },
      
      expand: ['latest_invoice.payment_intent'],
      metadata: {
        packageId: packageId,
        userId: studentId.toString(),
        schoolId: schoolId,
        ...metadata
      }
    });

    // --- update database:

    user.studentBilling.subscriptionId = subscription.id;
    user.studentBilling.subscriptionStatus = subscription.status;
    user.studentBilling.subscriptionPackageId = packageId;
    await user.save();

    // Create PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(price * 100),
      currency: 'usd',
      customer: user.studentBilling.stripeCustomerId,
      payment_method: paymentMethodId,
      off_session: true,
      confirm: true,
      description,
      transfer_data: {
        destination: schoolStripeAccountId, // ensure the funds go to the correct school
      },
      metadata: {
        userId: user._id.toString(),
        schoolId: schoolId,
        paymentType: 'student_to_school',
      },
    });

    // Save payment history
    const paymentHistory = await PaymentHistory.create({
      userId: user._id,
      schoolId: schoolId,
      stripePaymentIntentId: paymentIntent.id,
      stripeCustomerId: user.studentBilling.stripeCustomerId,
      amount: price,
      description: description || `Subscription for ${user.email}`,
      currency: 'usd',
      status: 'paid',
      paymentType: 'student_to_school',
      stripeCreatedAt: paymentIntent.created,
    });

    // --- emit socket event:
    if (paymentHistory) {
      const io = getIo();
      io.emit('paymentEvent-' + schoolId, {action: 'paymentCreated', data: paymentHistory});
    }

    // Update student activity (student should be marked as active for the month when they make a payment):
    await trackStudentActivity(user.schoolId, user._id);

    // --- return:

    res.json({
      success: true,
      subscriptionId: subscription.id,
      clientSecret: subscription.latest_invoice.payment_intent?.client_secret,
      status: subscription.status,
    });
  } catch (err) {
    console.error('Subscription Error:', err);
    next(err);
  }
});

/**
 * ===========================================
 * CANCEL Subscription Payments:
 * ===========================================
 */

router.post('/cancel-subscription-payment', async (req, res, next) => {
  try {
    const { studentId, cancelAtPeriodEnd = false } = req.body;
    
    const result = await cancelStudentSubscription(studentId, cancelAtPeriodEnd);
    
    if (!result.success) {
      return res.status(404).json({ message: result.message });
    }

    res.json({
      success: true,
      message: cancelAtPeriodEnd 
        ? 'Subscription will cancel at the end of current period' 
        : 'Subscription canceled immediately',
    });
  } catch (err) {
    next(err);
  }
});

async function cancelStudentSubscription (studentId, cancelAtPeriodEnd = false) {
  const user = await userModel.findById(studentId);
  const subscriptionId = user?.studentBilling?.subscriptionId;

  if (!subscriptionId) {
    return { success: false, message: 'No active subscription found' };
  }

  if (cancelAtPeriodEnd) {
    await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });
  } else {
    await stripe.subscriptions.cancel(subscriptionId);
  }

  // Update DB status
  if (user.studentBilling) {
    user.studentBilling.subscriptionStatus = 'canceled';
    await user.save();
  }

  // update current use value for student:
  if (user) {
    const io = getIo();
    io.emit('authStoreEvent-' + studentId, { action: 'currentUserUpdated', data: user });
  }

  return { success: true };
};

/**
 * ===========================================
 * Connect school's stripe account to CM stripe account:
 * ===========================================
 */

router.post("/connect-stripe-account", async (req, res) => {
  try {
    const { schoolId, redirectRoute } = req.body;

    // 1. Check database first
    const school = await schoolModel.findById(schoolId);
    let stripeAccountId = school?.stripe?.stripeAccountId;

    // 2. ONLY call .create() if we don't have an ID yet
    if (!stripeAccountId) {
      console.error("No ID found. Creating NEW Stripe account...");
      const newAccount = await stripe.accounts.create({
        type: "express",
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
      });

      stripeAccountId = newAccount.id;

      // FIX: Use dot notation for nested updates
      await schoolModel.findByIdAndUpdate(schoolId, {
        "stripe.stripeAccountId": stripeAccountId,
        "stripe.setupComplete": newAccount.details_submitted
      });
    } else {
      console.log("ID found. Reusing existing account:", stripeAccountId);
    }

    // 3. This part ALWAYS runs, using the ID from step 2
    // Stripe is smart enough to know if this is a "New" or "Resume" session
    const accountLink = await stripe.accountLinks.create({
      account: stripeAccountId,
      refresh_url: `http://${redirectRoute}?stripe-connect=fail`,
      return_url: `http://${redirectRoute}?stripe-connect=success`,
      type: "account_onboarding",
    });

    res.json({ url: accountLink.url });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/school-stripe-account-status/:schoolId", async (req, res) => {
  try {
    const { schoolId } = req.params;
    const school = await schoolModel.findById(schoolId);
  
    if (!school?.stripe.stripeAccountId) {
      return res.json({ connected: false });
    }

    const stripeAccountId = school?.stripe?.stripeAccountId;

    if (!stripeAccountId) {
      return res.json({ connected: false });
    }

    const account = await stripe.accounts.retrieve(stripeAccountId);

    await schoolModel.findByIdAndUpdate(schoolId, {
      "stripe.setupComplete": account.details_submitted,
      "stripe.chargesEnabled": account.charges_enabled
    });

    res.json({
      connected: true,
      details_submitted: account.details_submitted,
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
      requirements: account.requirements,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * ===========================================
 * Get school's stripe account details:
 * ===========================================
 */

router.get("/stripe-account-details-school/:schoolId", async (req, res) => {
  try {
    const { schoolId } = req.params;
    const school = await schoolModel.findById(schoolId);

    if (!school?.stripe?.stripeAccountId) {
      return res.status(404).json({ error: "No Stripe account linked." });
    }

    // Pull LIVE data from Stripe
    const account = await stripe.accounts.retrieve(school.stripe.stripeAccountId);

    // Only send what the UI actually needs to show
    res.json({
      businessName: account.business_profile.name || "Not set",
      email: account.email,
      // Stripe lists banks in 'external_accounts'
      bankName: account.external_accounts?.data[0]?.bank_name || "No bank linked",
      last4: account.external_accounts?.data[0]?.last4 || "****",
      payoutInterval: account.settings.payouts.schedule.interval, // 'manual', 'daily', etc.
      currentlyDue: account.requirements.currently_due
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * ===========================================
 * Add new customer to stripe:
 * ===========================================
 */

async function getOrCreateStripeCustomer(user) {
  if (user.studentBilling?.stripeCustomerId) {
    return user.studentBilling.stripeCustomerId;
  }

  const customer = await stripe.customers.create({
    email: user.email,
    name: user.name,
    metadata: {
      userId: user._id.toString(),
      userType: user.userType
    }
  });

  user.studentBilling = {
    stripeCustomerId: customer.id
  };

  await user.save();
  return customer.id;
}

module.exports = {
  router,
  cancelStudentSubscription,
};
