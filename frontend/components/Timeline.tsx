"use client";

import { useEffect, useState } from "react";
import type { TimelineEntry } from "@/lib/types";
import { formatDate } from "@/lib/format";

export default function Timeline({ entries, index, onChange }: {
  entries: TimelineEntry[];
  index: number;
  onChange: (i: number) => void;
}) {
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing || entries.length < 2) return;
    const t = setInterval(() => onChange((index + 1) % entries.length), 1200);
    return () => clearInterval(t);
  }, [playing, index, entries.length, onChange]);

  if (entries.length === 0) {
    return <div className="timeline empty">No acquisitions for the selected sensors.</div>;
  }
  const cur = entries[Math.min(index, entries.length - 1)];
  return (
    <div className="timeline">
      <button
        className="btn icon"
        onClick={() => setPlaying((v) => !v)}
        aria-label={playing ? "Pause timeline" : "Play timeline"}
        disabled={entries.length < 2}
      >
        {playing ? "❚❚" : "▶"}
      </button>
      <div className="timeline-track">
        <input
          type="range"
          min={0}
          max={entries.length - 1}
          step={1}
          value={index}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label="Acquisition date"
          aria-valuetext={`${formatDate(cur.acquisition_time)}, ${cur.sensor}`}
        />
        <div className="ticks" aria-hidden>
          {entries.map((e, i) => (
            <button
              key={e.date_id}
              className={`tick ${e.sensor === "NISAR" ? "nisar" : "s1"} ${i === index ? "on" : ""}`}
              style={{ left: `${entries.length > 1 ? (i / (entries.length - 1)) * 100 : 50}%` }}
              onClick={() => onChange(i)}
              tabIndex={-1}
              title={`${formatDate(e.acquisition_time)} · ${e.sensor}`}
            />
          ))}
        </div>
      </div>
      <div className="timeline-label">
        <span className={`badge ${cur.sensor === "NISAR" ? "nisar" : "s1"}`}>{cur.sensor}</span>
        <time dateTime={cur.acquisition_time}>{formatDate(cur.acquisition_time)}</time>
      </div>
    </div>
  );
}
