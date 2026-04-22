const express = require("express");
const router = express.Router();
const userModel = require('../models/user-models');
const Stripe = require('stripe');
const { PaymentHistory } = require('../models/billing-model');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-08-16' // or latest version
});

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

router.post('/charge', async (req, res, next) => {
  try {
    const { userId, amount, currency = 'usd', description } = req.body;

    if (!userId || !amount) {
      return res.status(400).json({ message: 'Missing parameters' });
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
      metadata: {
        userId: user._id.toString(),
        paymentType: 'student_to_school',
      },
    });

    // Save payment history
    await PaymentHistory.create({
      userId: user._id,
      stripePaymentIntentId: paymentIntent.id,
      stripeCustomerId: user.studentBilling.stripeCustomerId,
      amount,
      description,
      currency,
      status: 'paid',
      paymentType: 'student_to_school',
      stripeCreatedAt: paymentIntent.created,
    });

    res.json({ success: true, paymentIntentId: paymentIntent.id });
  } catch (err) {
    next(err);
  }
});

/** ====================
 * Start subscription:
 * =====================
 */

router.post('/start-subscription-payment', async (req, res, next) => {
  try {
    const { userId, stripePriceId, metadata = {} } = req.body;

    if (!userId || !stripePriceId) {
      return res.status(400).json({ message: 'Missing userId or stripePriceId' });
    }

    const user = await userModel.findById(userId);
    if (!user?.studentBilling?.stripeCustomerId) {
      return res.status(400).json({ message: 'User does not have a Stripe Customer ID' });
    }

    // 3. Create the Subscription
    // Note: Stripe will automatically attempt to charge the default payment method 
    // on the customer object because we aren't passing a specific payment_method ID.
    const subscription = await stripe.subscriptions.create({
      customer: user.studentBilling.stripeCustomerId,
      items: [{ price: stripePriceId }],
      payment_behavior: 'default_incomplete', // Good for handling SCA/3D Secure
      payment_settings: { save_default_payment_method: 'on_subscription' },
      expand: ['latest_invoice.payment_intent'], // Expands info to check status immediately
      metadata: {
        userId: userId.toString(),
        ...metadata
      },
    });

    // 4. Update  local database 
    // todo - add this. Also  want to store the subscriptionId and status on the user model
    // user.studentBilling.subscriptionId = subscription.id;
    // user.studentBilling.subscriptionStatus = subscription.status;
    // await user.save();

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

module.exports = router;