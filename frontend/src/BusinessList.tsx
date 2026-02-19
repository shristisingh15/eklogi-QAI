// frontend/src/BusinessList.tsx
import { useEffect, useState } from "react";
import { fetchBusinessTiles } from "./api/business"; // 👈 changed here

export default function BusinessList() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetchBusinessTiles({ type: "all", limit: 50 }) // 👈 call existing helper
      .then((res) => {
        // normalize response: API may return { items, total, source }
        const result = Array.isArray(res) ? res : res.items ?? [];
        setItems(result);
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        setErr(msg);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p>Loading…</p>;
  if (err) return <p style={{ color: "crimson" }}>{err}</p>;

  return (
    <div style={{ padding: 20 }}>
      <h2>Business Processes</h2>
      {items.length === 0 ? (
        <p>No processes found.</p>
      ) : (
        <ul>
          {items.map((p) => (
            <li key={p._id}>
              <b>{p.name}</b> – {p.description}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
