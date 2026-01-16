import express from "express";
import Stripe from "stripe";

const app = express();
const port = 4242;

// Use your TEST secret key for local dev
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2024-06-20",
});

// IMPORTANT: Stripe requires the raw body to verify signatures
app.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  (req, res) => {
    const sig = req.headers["stripe-signature"];
    const whsec = process.env.STRIPE_WEBHOOK_SECRET;

    if (!sig || !whsec) {
      console.error("Missing stripe-signature header or STRIPE_WEBHOOK_SECRET");
      return res.status(400).send("Missing signature or secret");
    }

    try {
      const event = stripe.webhooks.constructEvent(req.body, sig as string, whsec);
      console.log("✅ Stripe event received:", event.type);
      return res.json({ received: true });
    } catch (err: any) {
      console.error("❌ Webhook signature verification failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
  }
);

app.get("/", (_req, res) => res.send("ok"));

app.listen(port, () => {
  console.log(`Listening on http://127.0.0.1:${port}`);
});
