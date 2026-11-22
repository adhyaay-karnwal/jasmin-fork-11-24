"use client";

import { useMemo, useState } from "react";
import { LB, fmt, type Metric } from "@/lib/jasmine-data";

const groups = Array.from(new Set(LB.metrics.map((m) => m.group)));
const locations = Object.fromEntries(LB.providers.map((p) => [p.id, p.ranIn]));

function Chart({ m }: { m: Metric }) {
  const ranked = m.rows.filter((r) => r.ranked && r.median != null);
  const shown = m.rows.filter((r) => !r.ranked && r.median != null);
  const absent = m.rows.filter((r) => r.median == null);
  const max = Math.max(...m.rows.filter((r) => r.median != null).map((r) => Math.max(r.median!, r.p95 ?? 0)));
  const bar = (v: number) => `${Math.max(0.6, (v / max) * 100)}%`;
  return (
    <div className="lb-chart" data-ui>
      <div className="lb-chart-head">
        <span className="lb-chart-title">{m.label}</span>
        <span>
          {m.better === "lower" ? "lower is better" : "higher is better"} · median, with p95 tick · Jasmine{" "}
          {m.jasmineRank ? `${m.jasmineRank} of ${m.of}` : "not measured"}
        </span>
      </div>
      <table className="lb-table">
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Provider</th>
            <th scope="col" className="lb-bar-col">
              <span className="sr-only">Bar</span>
            </th>
            <th scope="col">Median</th>
            <th scope="col">p95</th>
          </tr>
        </thead>
        <tbody>
          {ranked.map((r) => (
            <tr key={r.provider} className={r.provider === "jasmine" ? "is-jasmine" : undefined}>
              <td>{r.rank}</td>
              <td title={locations[r.provider] ? `Ran in ${locations[r.provider]}` : undefined}>
                {r.name}
                {r.failed ? <span className="lb-fail"> · {r.failed} failed</span> : null}
              </td>
              <td className="lb-bar-col">
                <span className="lb-bar" style={{ width: bar(r.median!) }} />
                {r.p95 != null && <span className="lb-p95" style={{ left: bar(r.p95) }} />}
              </td>
              <td>{fmt(r.median, m.unit)}</td>
              <td className="lb-dim">{fmt(r.p95, m.unit)}</td>
            </tr>
          ))}
          {shown.map((r) => (
            <tr key={r.provider} className="is-unranked">
              <td>–</td>
              <td title="Not ranked: a shared or spot tier, or the machine measured inside wasn't 4 vCPU / 8 GB">{r.name}*</td>
              <td className="lb-bar-col">
                <span className="lb-bar" style={{ width: bar(r.median!) }} />
              </td>
              <td>{fmt(r.median, m.unit)}</td>
              <td className="lb-dim">{fmt(r.p95, m.unit)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {absent.length > 0 && (
        <ul className="lb-absent">
          {absent.map((r) => (
            <li key={r.provider}>
              <b>{r.name}</b>: {r.note || r.status}
            </li>
          ))}
        </ul>
      )}
      {shown.length > 0 && <p className="lb-foot">* shown, not ranked: shared/spot tiers or a machine that measured other than 4 vCPU / 8 GB, as aisandboxbench treats them.</p>}
    </div>
  );
}

export function Leaderboard() {
  const [id, setId] = useState("cold");
  const m = useMemo(() => LB.metrics.find((x) => x.id === id)!, [id]);
  const providerCount = LB.providers.filter((p) => p.ranked).length;
  return (
    <section className="lb" id="leaderboard" aria-labelledby="lb-h">
      <div className="lb-intro reveal">
        <h2 id="lb-h">Every metric, every provider</h2>
        <p>
          aisandboxbench.com runs {providerCount - 1} hosted sandbox providers through one open-source harness on a 4 vCPU / 8 GB
          machine, {LB.run.observations.toLocaleString("en-US")} observations. We ran Jasmine through the same harness with the flags
          from its collection plan. Pick a metric; the losses are in the list too.
        </p>
      </div>
      <div className="lb-body">
        <div className="lb-index" role="tablist" aria-label="Metrics" aria-orientation="vertical">
          {groups.map((g) => (
            <div className="lb-group" key={g}>
              <p className="lb-group-name">{g}</p>
              {LB.metrics
                .filter((x) => x.group === g)
                .map((x) => (
                  <button
                    key={x.id}
                    role="tab"
                    aria-selected={x.id === id}
                    className={`lb-item${x.id === id ? " is-on" : ""}${x.jasmineRank === 1 ? " is-first" : ""}`}
                    onClick={() => setId(x.id)}
                    onMouseEnter={() => setId(x.id)}
                  >
                    <span>{x.label}</span>
                    <span className="lb-rank">{x.jasmineRank ? `${x.jasmineRank} of ${x.of}` : "–"}</span>
                  </button>
                ))}
            </div>
          ))}
        </div>
        <div className="lb-pane" role="tabpanel">
          <Chart m={m} />
        </div>
      </div>
      <p className="lb-source">
        Published results: aisandboxbench.com/results.json, same-machine track, fetched {LB.fetched}. Jasmine: self-run on one GitHub
        Actions runner (AMD EPYC, nested virtualization), with the client on the same runner going out and back through a
        Cloudflare tunnel; the hosted providers were measured from a client in Florida, so network paths differ. This is not an aisandboxbench.com listing. Raw
        data and every caveat: <a href="https://github.com/arjunkshah12345-hash/jasmine/blob/master/results/aisandboxbench-2026-11-21.md">results/aisandboxbench-2026-11-21.md</a>.
      </p>
    </section>
  );
}
