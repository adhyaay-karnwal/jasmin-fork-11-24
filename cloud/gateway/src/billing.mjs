// Stripe, over plain HTTPS (no SDK). One metered price: each unit is one
// micro-dollar of usage, so every resource rate lives in config.rates, not Stripe.
//
// Flow: dashboard -> POST /billing/checkout -> Stripe Checkout (card + subscription)
// -> webhook checkout.session.completed -> users/{uid}.plan = "cloud".

import { config } from "./config.mjs";
import { day, HttpError, month, verifyStripeSignature } from "./util.mjs";

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

    async checkout(uid, email) {
      if (!enabled || !config.stripe.priceId) throw new HttpError(503, "billing is not configured");
      const account = (await store.accountByUid(uid)) ?? {};
      let customer = account.stripeCustomer;
      if (!customer) {
        customer = (await stripe("/customers", { email, metadata: { uid } }, `customer-${uid}`)).id;
        await store.updateUser(uid, { stripeCustomer: customer });
      }
      const s = await stripe("/checkout/sessions", {
        mode: "subscription",
        customer,
        client_reference_id: uid,
        line_items: { 0: { price: config.stripe.priceId } },
        success_url: `${config.stripe.siteUrl}/dashboard/?cloud=welcome`,
        cancel_url: `${config.stripe.siteUrl}/dashboard/?cloud=cancelled`,
        subscription_data: { metadata: { uid } },
      });
      return s.url;
    },

    async portal(uid) {
      if (!enabled) throw new HttpError(503, "billing is not configured");
      const account = (await store.accountByUid(uid)) ?? {};
      if (!account.stripeCustomer) throw new HttpError(404, "no billing account yet");
      const s = await stripe("/billing_portal/sessions", { customer: account.stripeCustomer, return_url: `${config.stripe.siteUrl}/dashboard/` });
      return s.url;
    },

    async webhook(raw, signature) {
      if (!verifyStripeSignature(raw, signature, config.stripe.webhookSecret)) throw new HttpError(400, "bad signature");
      const ev = JSON.parse(raw);
      const o = ev.data.object;
      const uid = o.client_reference_id ?? o.metadata?.uid ?? o.subscription_details?.metadata?.uid;
      if (!uid) return;
      switch (ev.type) {
        case "checkout.session.completed":
          await store.updateUser(uid, { plan: "cloud", stripeCustomer: o.customer, stripeSubscription: o.subscription, suspended: false });
          break;
        case "customer.subscription.deleted":
          await store.updateUser(uid, { plan: "open-source" });
          break;
        case "invoice.payment_failed":
          await store.updateUser(uid, { suspended: true });
          break;
        case "invoice.paid":
          await store.updateUser(uid, { suspended: false });
          break;
      }
    },

    /** Send usage above the monthly free allowance that Stripe hasn't seen yet. */
    async report(meter) {
      const m = month();
      for (const [k, u] of meter.months) {
        const [uid, km] = k.split("/");
        if (km !== m) continue;
        const due = Math.max(0, u.usd - config.rates.monthlyFreeUsd) - (u.billedUsd ?? 0);
        if (due < 0.01) continue;
        const account = await store.accountByUid(uid);
        if (!account?.stripeCustomer) continue;
        const micro = Math.floor(due * 1e6);
        await stripe("/billing/meter_events", {
          event_name: config.stripe.meterEvent,
          identifier: `${uid}-${m}-${Math.round((u.billedUsd ?? 0) * 1e6)}`,
          payload: { stripe_customer_id: account.stripeCustomer, value: micro },
        });
        const billed = micro / 1e6;
        u.billedUsd = (u.billedUsd ?? 0) + billed;
        await store.addUsage(uid, m, day(), { billedUsd: billed });
      }
    },
  };
}
