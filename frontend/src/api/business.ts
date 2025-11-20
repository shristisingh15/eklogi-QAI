// frontend/src/api/business.ts
const API = import.meta.env.VITE_API_BASE || "https://exacoda-qai-q8up.onrender.com";

export async function fetchBusinessTiles(opts?: { type?: "all" | "business" | "loan"; q?: string; limit?: number }) {
  const params = new URLSearchParams();
  if (opts?.type) params.set("type", opts.type);
  if (opts?.q) params.set("q", opts.q);
  params.set("limit", String(opts?.limit ?? 10));
  const r = await fetch(`${API}/api/business?${params.toString()}`);
  if (!r.ok) throw new Error("Failed to fetch business processes");
  return r.json(); // { items, total, source }
}
