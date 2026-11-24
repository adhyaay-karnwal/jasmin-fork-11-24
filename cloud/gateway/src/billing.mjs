// Prepaid credits through Stripe Checkout, over plain HTTPS (no SDK).
//
// Customers buy credit before they use compute, so Jasmine never fronts the cost
// of usage and an unpaid bill can't happen. Flow:
//   dashboard -> POST /billing/checkout {amount} -> Stripe Checkout (one-time payment)
//   -> webhook checkout.session.completed -> users/{uid}.balanceUsd += amount
// The meter deducts usage from the balance; at $0 running sandboxes are paused.

import { config } from "./config.mjs";
import { HttpError, verifyStripeSignature } from "./util.mjs";

const API = "https://api.stripe.com/v1";

function form(obj, prefix = "", out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v && typeof v === "object") form(v, key, out);
    else out.append(key, String(v));
  }
  return out;
}

async function stripe(path, params, idempotencyKey) {
  const r = await fetch(API + path, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.stripe.secretKey}`,
      "content-type": "application/x-www-form-urlencoded",
      ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
    },
    body: form(params),
  });
  const body = await r.json();
  if (!r.ok) throw new Error(`stripe ${path}: ${body.error?.message ?? r.status}`);
  return body;
}

export function billing(store) {
  const enabled = Boolean(config.stripe.secretKey);
  return {
    enabled,

    /** Start a Checkout session for one of the fixed top-up amounts. */
    async checkout(uid, email, amountUsd) {
      if (!enabled) throw new HttpError(503, "payments are not configured yet");
      const amount = Number(amountUsd);
      if (!config.topUpsUsd.includes(amount)) throw new HttpError(400, `amount must be one of ${config.topUpsUsd.join(", ")}`);
      const account = (await store.accountByUid(uid)) ?? {};
      let customer = account.stripeCustomer;
      if (!customer) {
        customer = (await stripe("/customers", { email, metadata: { uid } }, `customer-${uid}`)).id;
        await store.updateUser(uid, { stripeCustomer: customer });
      }
      const s = await stripe("/checkout/sessions", {
        mode: "payment",
        customer,
        client_reference_id: uid,
        line_items: {
          0: {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: Math.round(amount * 100),
              product_data: { name: `Jasmine Cloud credit ($${amount})`, description: "Prepaid sandbox usage. Credit doesn't expire." },
            },
          },
        },
        metadata: { uid, credit_usd: amount },
        payment_intent_data: { metadata: { uid, credit_usd: amount } },
        invoice_creation: { enabled: true },
        success_url: `${config.stripe.siteUrl}/dashboard/?cloud=paid`,
        cancel_url: `${config.stripe.siteUrl}/dashboard/?cloud=cancelled`,
      });
      return s.url;
    },

    /** Credit the balance once per paid Checkout session (Stripe retries webhooks). */
    async webhook(raw, signature) {
      if (!config.stripe.webhookSecret || !verifyStripeSignature(raw, signature, config.stripe.webhookSecret)) {
        throw new HttpError(400, "bad signature");
      }
      const ev = JSON.parse(raw);
      const o = ev.data?.object ?? {};
      if (ev.type !== "checkout.session.completed" && ev.type !== "checkout.session.async_payment_succeeded") return;
      if (o.mode !== "payment" || o.payment_status !== "paid") return;
      const uid = o.client_reference_id ?? o.metadata?.uid;
      const credit = Number(o.metadata?.credit_usd ?? (o.amount_total ?? 0) / 100);
      if (!uid || !(credit > 0)) return;
      await store.credit(uid, credit, `checkout:${o.id}`, { stripeCustomer: o.customer, paid: true });
      return uid;
    },
  };
}
