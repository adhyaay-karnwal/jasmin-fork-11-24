// Accounts, snapshot ownership and usage totals.
//
// Firestore layout (shared with the dashboard on tryjasmine.dev):
//   users/{uid}                    plan ("open-source" | "cloud"), stripeCustomer, suspended, limits{}
//   users/{uid}/keys/{id}          hash = sha256(key) hex, written by the dashboard
//   snapshots/{name}               uid, host, memMib, createdAt
//   usage/{uid}/months/{yyyy-mm}   cpuS, gibS, storageGibS, usd, billedUsd
//   usage/{uid}/days/{yyyy-mm-dd}  cpuS, gibS, storageGibS, usd
//
// Sandboxes themselves are not stored: their owner and expiry live in daemon
// labels, so the daemons are the source of truth and the gateway is stateless.

import { config } from "./config.mjs";
import { sha256 } from "./util.mjs";

export async function openStore() {
  return config.store === "memory" ? memoryStore() : firestoreStore();
}

function emptyUsage() {
  return { cpuS: 0, gibS: 0, storageGibS: 0, usd: 0, billedUsd: 0 };
}

function memoryStore() {
  const keys = new Map(); // hash -> uid
  const users = new Map(); // uid -> user doc
  for (const entry of config.devKeys.split(",").filter(Boolean)) {
    const [key, uid, plan = "cloud", cap] = entry.split(":");
    keys.set(sha256(key), uid);
    users.set(uid, { plan, ...(cap === undefined ? {} : { limits: { monthlySpendUsd: Number(cap) } }) });
  }
  const snaps = new Map();
  const months = new Map(); // `${uid}/${month}` -> usage
  return {
    // Tests sign in with "dev:<uid>:<email>" instead of a Firebase ID token.
    async verifyIdToken(token) {
      const [tag, uid, email] = String(token).split(":");
      if (tag !== "dev" || !uid) throw new Error("bad token");
      return { uid, email };
    },
    async accountByKey(hash) {
      const uid = keys.get(hash);
      return uid ? { uid, ...users.get(uid) } : null;
    },
    async accountByUid(uid) {
      return users.has(uid) ? { uid, ...users.get(uid) } : null;
    },
    async updateUser(uid, fields) {
      users.set(uid, { ...(users.get(uid) ?? {}), ...fields });
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
    async addUsage(uid, month, _day, d) {
      const k = `${uid}/${month}`;
      const u = { ...emptyUsage(), ...(months.get(k) ?? {}) };
      for (const f of Object.keys(d)) u[f] += d[f];
      months.set(k, u);
    },
  };
}

async function firestoreStore() {
  const { initializeApp, applicationDefault } = await import("firebase-admin/app");
  const { getFirestore, FieldValue } = await import("firebase-admin/firestore");
  initializeApp({ credential: applicationDefault() });
  const { getAuth } = await import("firebase-admin/auth");
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
      const { billedUsd, ...daily } = inc;
      b.set(db.doc(`usage/${uid}/days/${day}`), daily, { merge: true });
      await b.commit();
    },
  };
}
