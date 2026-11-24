// Every knob of Jasmine Cloud, read once from the environment.

const env = (k, d) => process.env[k] ?? d;
const num = (k, d) => (process.env[k] === undefined ? d : Number(process.env[k]));

export const config = {
  port: num("PORT", 8080),
  // Daemon hosts: "id=http://10.0.0.2:7171,id2=http://10.0.0.3:7171". Each runs jasmined
  // with JASMINE_API_KEY set to hostKey and listens only on the private network.
  hosts: env("JASMINE_HOSTS", "local=http://127.0.0.1:7171")
    .split(",")
    .filter(Boolean)
    .map((s) => {
      const [id, url] = s.includes("=") ? s.split("=") : [s, s];
      return { id, url: url.replace(/\/$/, "") };
    }),
  hostKey: env("JASMINE_HOST_KEY", ""),

  // "firestore" in production; "memory" for tests (accounts come from devKeys).
  store: env("JASMINE_STORE", "firestore"),
  // "jsm_key:uid[:plan[:monthlySpendUsd]],..." — only read by the memory store.
  devKeys: env("JASMINE_DEV_KEYS", ""),

  // Prices in USD. Change here and on site/src/app/pricing/parts.tsx together.
  rates: {
    vcpuHour: num("RATE_VCPU_HOUR", 0.0045),
    gibHour: num("RATE_GIB_HOUR", 0.0015),
    storageGibMonth: num("RATE_STORAGE_GIB_MONTH", 0.05),
    monthlyFreeUsd: num("FREE_USD_PER_MONTH", 5),
  },

  // Per-account defaults; a user document can override any of these.
  limits: {
    running: num("LIMIT_RUNNING", 20), // sandboxes running at once
    total: num("LIMIT_TOTAL", 100), // running + paused
    maxVcpus: num("LIMIT_MAX_VCPUS", 8),
    maxMemMib: num("LIMIT_MAX_MEM_MIB", 16384),
    monthlySpendUsd: num("LIMIT_MONTHLY_SPEND_USD", 100),
    createsPerMinute: num("LIMIT_CREATES_PER_MINUTE", 120),
    snapshots: num("LIMIT_SNAPSHOTS", 50),
  },
  // Sandboxes stop by themselves so a forgotten loop can't run up a bill.
  timeoutDefaultS: num("TIMEOUT_DEFAULT_S", 3600),
  timeoutMinS: num("TIMEOUT_MIN_S", 10),
  timeoutMaxS: num("TIMEOUT_MAX_S", 86400),
  pausedMaxDays: num("PAUSED_MAX_DAYS", 30),

  meterIntervalMs: num("METER_INTERVAL_MS", 10_000),
  flushIntervalMs: num("FLUSH_INTERVAL_MS", 60_000),

  stripe: {
    secretKey: env("STRIPE_SECRET_KEY", ""),
    webhookSecret: env("STRIPE_WEBHOOK_SECRET", ""),
    // Meter event name; its price is $0.000001 per unit (one unit = one micro-dollar).
    meterEvent: env("STRIPE_METER_EVENT", "jasmine_usage_microusd"),
    priceId: env("STRIPE_PRICE_ID", ""),
    siteUrl: env("SITE_URL", "https://tryjasmine.dev"),
  },
};

export const RESERVED = "jasmine."; // label prefix only the gateway may set
export const OWNER = "jasmine.owner";
export const EXPIRES = "jasmine.expires";
export const ON_TIMEOUT = "jasmine.on_timeout";
