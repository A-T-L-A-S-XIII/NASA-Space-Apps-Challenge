import type { Layer } from "@/lib/types";

export default function Legend({ layers }: { layers: Layer[] }) {
  if (layers.length === 0) return <p className="muted">No layer shown.</p>;
  return (
    <div className="legend">
      {layers.map((l) => (
        <div key={l.kind}>
          <h3 className="legend-title">{l.kind === "water" ? "Candidate water" : "Change since previous same-sensor date"}</h3>
          <ul>
            {l.legend.map((it) => (
              <li key={it.value}>
                <span
                  className="swatch"
                  style={
                    it.pattern === "hatch"
                      ? { background: `repeating-linear-gradient(45deg, ${it.color} 0 2px, transparent 2px 6px)` }
                      : { background: it.color }
                  }
                  aria-hidden
                />
                {it.label}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
