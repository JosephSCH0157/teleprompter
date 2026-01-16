const express = require("express");
const Stripe = require("stripe");

const app = express();
const port = 4242;

const stripeKey = process.env.STRIPE_SECRET_KEY;
const whsec = process.env.STRIPE_WEBHOOK_SECRET;

if (!stripeKey) {
  console.error("Missing STRIPE_SECRET_KEY");
  process.exit(1);
}
if (!whsec) {
  console.error("Missing STRIPE_WEBHOOK_SECRET");
  process.exit(1);
}

const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });

// Stripe signature verification needs the RAW body
app.post("/webhook", express.raw({ type: "application/json" }), (req, res) => {
  const sig = req.headers["stripe-signature"];
  if (!sig) return res.status(400).send("Missing stripe-signature header");

  try {
    const event = stripe.webhooks.constructEvent(req.body, sig, whsec);
    console.log("✅ Stripe event:", event.type);
    res.json({ received: true });
  } catch (err) {
    console.error("❌ Webhook signature verify failed:", err.message || err);
    res.status(400).send("Webhook Error");
  }
});

app.get("/", (_req, res) => res.send("ok"));

app.listen(port, "127.0.0.1", () => {
  console.log(`Listening on http://127.0.0.1:${port}/webhook`);
});
