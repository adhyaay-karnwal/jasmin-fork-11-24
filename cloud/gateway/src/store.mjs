// Accounts, balances, snapshot ownership and usage totals.
//
// Firestore layout (shared with the dashboard on tryjasmine.dev):
//   users/{uid}                    balanceUsd, paid, trialGranted, stripeCustomer, limits{}
//   users/{uid}/keys/{id}          hash = sha256(key) hex, written by the dashboard
//   payments/{id}                  one per credited Checkout session (makes webhooks idempotent)
//   snapshots/{name}               uid, host, memMib, createdAt
//   usage/{uid}/months/{yyyy-mm}   cpuS, gibS, storageGibS, usd
//   usage/{uid}/days/{yyyy-mm-dd}  cpuS, gibS, storageGibS, usd
//
// Sandboxes themselves are not stored: their owner and expiry live in daemon
// labels, so the daemons are the source of truth and the gateway is stateless.

import { config } from "./config.mjs";
import { sha256 } from "./util.mjs";

export async function openStore() {
  return config.store === "memory" ? memoryStore() : firestoreStore();
}

const emptyUsage = () => ({ cpuS: 0, gibS: 0, storageGibS: 0, usd: 0 });

function memoryStore() {
  const keys = new Map(); // hash -> uid
  const users = new Map(); // uid -> user doc
  for (const entry of config.devKeys.split(",").filter(Boolean)) {
    const [key, uid, balance, paid] = entry.split(":");
    keys.set(sha256(key), uid);
    users.set(uid, balance === undefined ? {} : { balanceUsd: Number(balance), trialGranted: true, paid: paid === "paid" });
  }
  const snaps = new Map();
  const months = new Map(); // `${uid}/${month}` -> usage
  const payments = new Set();
  const user = (uid) => users.get(uid) ?? users.set(uid, {}).get(uid);
  return {
    // Tests sign in with "dev:<uid>:<email>" instead of a Firebase ID token.
    async verifyIdToken(token) {
      const [tag, uid, email] = String(token).split(":");
      if (tag !== "dev" || !uid) throw new Error("bad token");
      return { uid, email };
    },
    async accountByKey(hash) {
      const uid = keys.get(hash);
      return uid ? { uid, ...user(uid) } : null;
    },
    async accountByUid(uid) {
      return users.has(uid) ? { uid, ...users.get(uid) } : null;
    },
    async updateUser(uid, fields) {
      Object.assign(user(uid), fields);
    },
    async grantTrial(uid) {
      const u = user(uid);
      if (u.trialGranted) return false;
      u.trialGranted = true;
      u.balanceUsd = (u.balanceUsd ?? 0) + config.trialUsd;
      return true;
    },
    async credit(uid, usd, id, fields = {}) {
      if (payments.has(id)) return false;
      payments.add(id);
      const u = user(uid);
      Object.assign(u, fields);
      u.balanceUsd = (u.balanceUsd ?? 0) + usd;
      return true;
    },
    async putSnapshot(s) {
      snaps.set(s.name, s);
    },
    async snapshot(name) {
      return snaps.get(name) ?? null;
    },
    async deleteSnapshot(name) {
      snaps.delete(name);
    },
    async allSnapshots() {
      return [...snaps.values()];
    },
    async monthUsage(uid, month) {
      return { ...emptyUsage(), ...(months.get(`${uid}/${month}`) ?? {}) };
    },
    /** Record usage and take its cost off the balance. */
    async addUsage(uid, month, _day, d) {
      const k = `${uid}/${month}`;
      const u = { ...emptyUsage(), ...(months.get(k) ?? {}) };
      for (const f of Object.keys(d)) u[f] += d[f];
      months.set(k, u);
      const acc = user(uid);
      acc.balanceUsd = (acc.balanceUsd ?? 0) - d.usd;
    },
  };
}

async function firestoreStore() {
  const { initializeApp, applicationDefault } = await import("firebase-admin/app");
  const { getFirestore, FieldValue } = await import("firebase-admin/firestore");
  const { getAuth } = await import("firebase-admin/auth");
  initializeApp({ credential: applicationDefault() });
  const db = getFirestore();
  return {
    async verifyIdToken(token) {
      return getAuth().verifyIdToken(token);
    },
    async accountByKey(hash) {
      const q = await db.collectionGroup("keys").where("hash", "==", hash).limit(1).get();
      if (q.empty) return null;
      const uid = q.docs[0].ref.parent.parent.id;
      const u = await db.doc(`users/${uid}`).get();
      return { uid, ...(u.data() ?? {}) };
    },
    async accountByUid(uid) {
      const u = await db.doc(`users/${uid}`).get();
      return u.exists ? { uid, ...u.data() } : null;
    },
    async updateUser(uid, fields) {
      await db.doc(`users/${uid}`).set(fields, { merge: true });
    },
    async grantTrial(uid) {
      const ref = db.doc(`users/${uid}`);
      return db.runTransaction(async (t) => {
        const u = await t.get(ref);
        if (u.data()?.trialGranted) return false;
        t.set(ref, { trialGranted: true, balanceUsd: FieldValue.increment(config.trialUsd) }, { merge: true });
        return true;
      });
    },
    async credit(uid, usd, id, fields = {}) {
      const pay = db.doc(`payments/${id.replace(/[/:]/g, "_")}`);
      return db.runTransaction(async (t) => {
        if ((await t.get(pay)).exists) return false;
        t.set(pay, { uid, usd, at: FieldValue.serverTimestamp() });
        t.set(db.doc(`users/${uid}`), { ...fields, balanceUsd: FieldValue.increment(usd) }, { merge: true });
        return true;
      });
    },
    async putSnapshot(s) {
      await db.doc(`snapshots/${s.name}`).set(s);
    },
    async snapshot(name) {
      const d = await db.doc(`snapshots/${name}`).get();
      return d.exists ? d.data() : null;
    },
    async deleteSnapshot(name) {
      await db.doc(`snapshots/${name}`).delete();
    },
    async allSnapshots() {
      return (await db.collection("snapshots").get()).docs.map((d) => d.data());
    },
    async monthUsage(uid, month) {
      const d = await db.doc(`usage/${uid}/months/${month}`).get();
      return { ...emptyUsage(), ...(d.data() ?? {}) };
    },
    async addUsage(uid, month, day, d) {
      const inc = Object.fromEntries(Object.entries(d).map(([k, v]) => [k, FieldValue.increment(v)]));
      const b = db.batch();
      b.set(db.doc(`usage/${uid}/months/${month}`), inc, { merge: true });
      b.set(db.doc(`usage/${uid}/days/${day}`), inc, { merge: true });
      b.set(db.doc(`users/${uid}`), { balanceUsd: FieldValue.increment(-d.usd) }, { merge: true });
      await b.commit();
    },
  };
}
