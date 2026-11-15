"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import Legend from "./Legend";
import LocalitySearch from "./LocalitySearch";
import { Disclaimers, FixtureBanner, Limits } from "./Notices";
import Timeline from "./Timeline";
import { api } from "@/lib/api";
import { formatDate, km2 } from "@/lib/format";
import type { LayerSet, Locality, Sensor, Stats, Timeline as TL } from "@/lib/types";

const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => <div className="map-wrap state">Loading map…</div>,
});

type Load =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; timeline: TL; layerSets: LayerSet[]; stats: Stats; localities: Locality[]; fixture: boolean };

export default function MapScreen() {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [sensors, setSensors] = useState<Record<Sensor, boolean>>({ NISAR: true, "Sentinel-1": true });
  const [showWater, setShowWater] = useState(true);
  const [showChange, setShowChange] = useState(false);
  const [index, setIndex] = useState(0);
  const [flyTo, setFlyTo] = useState<{ lat: number; lon: number; key: number } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [timeline, stats, locs] = await Promise.all([api.timeline(), api.stats(), api.localities()]);
        const layerSets = await Promise.all(timeline.entries.map((e) => api.layers(e.date_id)));
        // Warm the browser cache so date changes are instant.
        layerSets.flatMap((ls) => ls.layers).forEach((l) => { new Image().src = api.fileUrl(l.url); });
        setLoad({
          status: "ready", timeline, layerSets, stats, localities: locs.items,
          fixture: timeline.fixture || stats.fixture || locs.fixture,
        });
        setIndex(timeline.entries.length - 1);
      } catch (err) {
        setLoad({ status: "error", message: err instanceof Error ? err.message : String(err) });
      }
    })();
  }, []);

  const entries = useMemo(
    () => (load.status === "ready" ? load.timeline.entries.filter((e) => sensors[e.sensor]) : []),
    [load, sensors],
  );
  const safeIndex = Math.min(index, Math.max(0, entries.length - 1));
  const cur = entries[safeIndex] ?? null;
  const curLayers = load.status === "ready" && cur ? load.layerSets.find((l) => l.date_id === cur.date_id) : undefined;
  const curStats = load.status === "ready" && cur ? load.stats.per_date.find((s) => s.date_id === cur.date_id) : undefined;
  const shownLayers = (curLayers?.layers ?? []).filter((l) => (l.kind === "water" ? showWater : showChange));
  const pick = useCallback((l: Locality) => setFlyTo({ lat: l.lat, lon: l.lon, key: Date.now() }), []);

  if (load.status === "loading") return <main className="screen state">Loading radar observations…</main>;
  if (load.status === "error")
    return (
      <main className="screen state error" role="alert">
        <p>Could not load the data.</p>
        <code>{load.message}</code>
      </main>
    );
  if (load.timeline.entries.length === 0)
    return <main className="screen state">No radar acquisitions are available for this area yet.</main>;

  return (
    <main className="screen">
      {load.fixture && <FixtureBanner />}
      <section className="map-col">
        <MapView
          bbox={load.timeline.aoi_bbox}
          layerSets={load.layerSets}
          currentDateId={cur?.date_id ?? null}
          showWater={showWater}
          showChange={showChange}
          localities={load.localities}
          flyTo={flyTo}
        />
        <Timeline entries={entries} index={safeIndex} onChange={setIndex} />
      </section>

      <aside className="panel">
        <LocalitySearch items={load.localities} onPick={pick} />

        <section className="card">
          <h2>Layers</h2>
          <fieldset className="toggles">
            <legend className="sr-only">Sensors</legend>
            {(["NISAR", "Sentinel-1"] as Sensor[]).map((s) => (
              <label key={s} className="toggle">
                <input type="checkbox" checked={sensors[s]} onChange={(e) => setSensors({ ...sensors, [s]: e.target.checked })} />
                <span className={`badge ${s === "NISAR" ? "nisar" : "s1"}`}>{s}</span>
                {s === "Sentinel-1" && <span className="muted small">complement</span>}
              </label>
            ))}
          </fieldset>
          <fieldset className="toggles">
            <legend className="sr-only">Layer type</legend>
            <label className="toggle">
              <input type="checkbox" checked={showWater} onChange={(e) => setShowWater(e.target.checked)} /> Candidate water
            </label>
            <label className="toggle">
              <input type="checkbox" checked={showChange} onChange={(e) => setShowChange(e.target.checked)} /> Change
            </label>
          </fieldset>
          <Legend layers={shownLayers} />
          {showChange && cur && !cur.reference_date_id && (
            <p className="muted small">No change layer: this is the first {cur.sensor} acquisition.</p>
          )}
        </section>

        {cur && (
          <section className="card">
            <h2>Selected acquisition</h2>
            <dl className="facts">
              <dt>Sensor</dt><dd>{cur.sensor}</dd>
              <dt>Acquired</dt><dd>{formatDate(cur.acquisition_time)}</dd>
              <dt>Product</dt><dd>{cur.product}</dd>
              <dt>Granule</dt><dd className="mono">{cur.granule_id}</dd>
              <dt>Valid coverage</dt><dd>{Math.round(cur.valid_fraction * 100)}% of the study area</dd>
              <dt>Threshold</dt><dd>{curLayers?.threshold_db != null ? `${curLayers.threshold_db} dB` : "—"}</dd>
              <dt>Candidate water</dt><dd>{km2(curStats?.candidate_water_km2)}</dd>
              <dt>Candidate expansion</dt><dd>{km2(curStats?.expansion_km2)}</dd>
              <dt>Candidate retraction</dt><dd>{km2(curStats?.retraction_km2)}</dd>
            </dl>
            <p className="muted small">Change compares with the previous {cur.sensor} date only; sensors are never mixed.</p>
          </section>
        )}

        <Limits />
      </aside>

      <footer className="footer">
        <Disclaimers />
      </footer>
    </main>
  );
}
