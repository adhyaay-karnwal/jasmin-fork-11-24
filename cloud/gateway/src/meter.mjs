// The meter: polls every host, keeps the sandbox registry (id -> owner, host,
// state, size), bills elapsed time, and enforces timeouts and spend caps.
//
// Billing rule: a running sandbox is charged for its vCPUs and memory; a paused
// sandbox and a saved snapshot are charged storage for their memory image. Time
// the gateway was down is not billed (rounding goes in the customer's favour).

import { config, EXPIRES, ON_TIMEOUT, OWNER } from "./config.mjs";
import { call, hosts } from "./hosts.mjs";
import { day, month, nowS } from "./util.mjs";

const GIB = 1024;
const MONTH_S = 30 * 86400;

export function costUsd({ cpuS = 0, gibS = 0, storageGibS = 0 }) {
  const r = config.rates;
  return (cpuS / 3600) * r.vcpuHour + (gibS / 3600) * r.gibHour + (storageGibS / MONTH_S) * r.storageGibMonth;
}

export class Meter {
  constructor(store, billing) {
    this.store = store;
    this.billing = billing;
    this.sandboxes = new Map(); // id -> { id, host, uid, state, vcpus, memMib, expires, onTimeout, pausedSince }
    this.hostLoad = new Map(); // host id -> running vCPUs
    this.hostUp = new Map(); // host id -> last poll ok
    this.pending = new Map(); // uid -> unflushed usage delta
    this.months = new Map(); // `${uid}/${month}` -> month usage (flushed + pending)
    this.snapshots = [];
    this.last = Date.now();
  }

  async start() {
    this.snapshots = await this.store.allSnapshots();
    await this.tick(true);
    this.timers = [
      setInterval(() => this.tick().catch((e) => console.error("meter:", e)), config.meterIntervalMs),
      setInterval(() => this.flush().catch((e) => console.error("flush:", e)), config.flushIntervalMs),
    ];
  }

  stop() {
    for (const t of this.timers ?? []) clearInterval(t);
  }

  /** Record a sandbox the moment it is created, before the next poll. */
  track(info, hostId) {
    const l = info.labels ?? {};
    if (!l[OWNER]) return;
    this.sandboxes.set(info.id, {
      id: info.id,
      host: hostId,
      uid: l[OWNER],
      state: info.state ?? "running",
      vcpus: info.vcpus ?? 0,
      memMib: info.mem_mib ?? 0,
      expires: Number(l[EXPIRES] ?? 0),
      onTimeout: l[ON_TIMEOUT] ?? "delete",
      pausedSince: null,
    });
  }

  forget(id) {
    this.sandboxes.delete(id);
  }

  owned(uid) {
    return [...this.sandboxes.values()].filter((s) => s.uid === uid);
  }

  /** Host with the fewest running vCPUs among those that answered the last poll. */
  pickHost() {
    const up = hosts().filter((h) => this.hostUp.get(h.id));
    if (!up.length) return null;
    return up.reduce((a, b) => ((this.hostLoad.get(a.id) ?? 0) <= (this.hostLoad.get(b.id) ?? 0) ? a : b));
  }

  async monthUsd(uid) {
    return (await this.monthUsage(uid)).usd;
  }

  async monthUsage(uid) {
    const k = `${uid}/${month()}`;
    if (!this.months.has(k)) this.months.set(k, await this.store.monthUsage(uid, month()));
    return this.months.get(k);
  }

  charge(uid, d) {
    d.usd = costUsd(d);
    const p = this.pending.get(uid) ?? { cpuS: 0, gibS: 0, storageGibS: 0, usd: 0 };
    for (const f of Object.keys(p)) p[f] += d[f] ?? 0;
    this.pending.set(uid, p);
    const m = this.months.get(`${uid}/${month()}`);
    if (m) for (const f of Object.keys(p)) m[f] += d[f] ?? 0;
  }

  async tick(first = false) {
    const now = Date.now();
    // Cap a single interval so a stalled event loop or downtime isn't billed.
    const dt = first ? 0 : Math.min((now - this.last) / 1000, (3 * config.meterIntervalMs) / 1000);
    this.last = now;
    const seen = new Set();
    await Promise.all(
      hosts().map(async (h) => {
        try {
          const r = await call(h, "GET", "/v1/sandboxes", undefined, 5_000);
          if (r.status !== 200 || !Array.isArray(r.body)) throw new Error(`status ${r.status}`);
          this.hostUp.set(h.id, true);
          let load = 0;
          for (const info of r.body) {
            if (!info.labels?.[OWNER]) continue; // not a Cloud sandbox
            seen.add(info.id);
            const prev = this.sandboxes.get(info.id);
            this.track(info, h.id);
            const s = this.sandboxes.get(info.id);
            s.pausedSince = s.state === "paused" ? (prev?.pausedSince ?? nowS()) : null;
            if (s.state === "running") load += s.vcpus;
          }
          this.hostLoad.set(h.id, load);
        } catch (e) {
          if (this.hostUp.get(h.id) !== false) console.error(`host ${h.id} poll failed: ${e.message}`);
          this.hostUp.set(h.id, false);
          // Keep its sandboxes in the registry (unbilled) until the host answers again.
          for (const s of this.sandboxes.values()) if (s.host === h.id) seen.add(s.id);
        }
      }),
    );
    for (const id of this.sandboxes.keys()) if (!seen.has(id)) this.sandboxes.delete(id);

    for (const s of this.sandboxes.values()) {
      if (!this.hostUp.get(s.host) || dt === 0) continue;
      await this.monthUsage(s.uid);
      if (s.state === "running") this.charge(s.uid, { cpuS: s.vcpus * dt, gibS: (s.memMib / GIB) * dt });
      else this.charge(s.uid, { storageGibS: (s.memMib / GIB) * dt });
    }
    if (dt > 0)
      for (const snap of this.snapshots) {
        await this.monthUsage(snap.uid);
        this.charge(snap.uid, { storageGibS: ((snap.memMib ?? 0) / GIB) * dt });
      }
    await this.enforce();
  }

  async enforce() {
    const t = nowS();
    for (const s of [...this.sandboxes.values()]) {
      if (!this.hostUp.get(s.host)) continue;
      const h = hosts().find((x) => x.id === s.host);
      try {
        if (s.state === "running" && s.expires && t >= s.expires) {
          if (s.onTimeout === "pause") {
            await call(h, "POST", `/v1/sandboxes/${s.id}/pause`);
            s.state = "paused";
            s.pausedSince = t;
          } else {
            await call(h, "DELETE", `/v1/sandboxes/${s.id}`);
            this.forget(s.id);
          }
        } else if (s.state === "paused" && s.pausedSince && t - s.pausedSince > config.pausedMaxDays * 86400) {
          await call(h, "DELETE", `/v1/sandboxes/${s.id}`);
          this.forget(s.id);
        }
      } catch (e) {
        console.error(`enforce ${s.id}: ${e.message}`);
      }
    }
    // Spend cap: stop compute (pause, never delete) once an account hits its limit.
    const byUid = new Set([...this.sandboxes.values()].filter((s) => s.state === "running").map((s) => s.uid));
    for (const uid of byUid) {
      if (!(await this.overCap(uid))) continue;
      for (const s of this.owned(uid).filter((x) => x.state === "running")) {
        const h = hosts().find((x) => x.id === s.host);
        await call(h, "POST", `/v1/sandboxes/${s.id}/pause`).catch(() => {});
        s.state = "paused";
        s.pausedSince = nowS();
      }
      console.log(`spend cap reached for ${uid}; running sandboxes paused`);
    }
  }

  async overCap(uid, account) {
    account ??= (await this.store.accountByUid(uid)) ?? {};
    const cap = account.limits?.monthlySpendUsd ?? config.limits.monthlySpendUsd;
    return (await this.monthUsd(uid)) >= cap + config.rates.monthlyFreeUsd;
  }

  async flush() {
    const batch = [...this.pending.entries()];
    this.pending.clear();
    for (const [uid, d] of batch) {
      try {
        await this.store.addUsage(uid, month(), day(), d);
      } catch (e) {
        // Put it back; it will go out with the next flush.
        console.error(`usage flush for ${uid} failed: ${e.message}`);
        const p = this.pending.get(uid) ?? { cpuS: 0, gibS: 0, storageGibS: 0, usd: 0 };
        for (const f of Object.keys(p)) p[f] += d[f];
        this.pending.set(uid, p);
      }
    }
    if (this.billing.enabled) await this.billing.report(this).catch((e) => console.error("billing report:", e.message));
  }
}
