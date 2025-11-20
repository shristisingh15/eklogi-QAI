const API = import.meta.env.VITE_API_BASE || "https://exacoda-qai-q8up.onrender.com";

export type Project = { _id: string; name: string; description?: string; type?: string; createdAt?: string };
export type ProjectList = { items: Project[]; total: number };

export async function fetchProjects(opts?: { q?: string; limit?: number }) {
  const p = new URLSearchParams();
  if (opts?.q) p.set("q", opts.q);
  p.set("limit", String(opts?.limit ?? 12));
  const res = await fetch(`${API}/api/projects?${p.toString()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<ProjectList>;
}
