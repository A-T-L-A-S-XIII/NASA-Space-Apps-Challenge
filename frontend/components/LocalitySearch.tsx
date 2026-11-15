"use client";

import { useId, useState } from "react";
import type { Locality } from "@/lib/types";

export default function LocalitySearch({ items, onPick }: { items: Locality[]; onPick: (l: Locality) => void }) {
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const listId = useId();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
    const hit = items.find((l) => norm(l.name) === norm(q)) ?? items.find((l) => norm(l.name).startsWith(norm(q)));
    if (hit) {
      setMsg(null);
      setQ(hit.name);
      onPick(hit);
    } else {
      setMsg("No locality with that name in the study area.");
    }
  }

  return (
    <form className="search" onSubmit={submit} role="search">
      <label htmlFor={`${listId}-in`} className="sr-only">Search locality</label>
      <input
        id={`${listId}-in`}
        list={listId}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search a locality"
        autoComplete="off"
      />
      <datalist id={listId}>
        {items.map((l) => (
          <option key={l.locality_id} value={l.name} />
        ))}
      </datalist>
      <button className="btn" type="submit">Go</button>
      {msg && <p className="field-msg" role="status">{msg}</p>}
    </form>
  );
}
