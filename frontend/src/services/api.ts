const API_BASE = "https://exacoda-qai-q8up.onrender.com/api/businessprocess";

export async function getBusinessProcesses() {
  const res = await fetch(API_BASE);
  if (!res.ok) throw new Error("Failed to fetch");
  return res.json();
}

export async function getBusinessProcess(id: string) {
  const res = await fetch(`${API_BASE}/${id}`);
  if (!res.ok) throw new Error("Failed to fetch process");
  return res.json();
}

export async function createBusinessProcess(newProcess: { name: string; description: string }) {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(newProcess),
  });
  if (!res.ok) throw new Error("Failed to create");
  return res.json();
}

export async function updateBusinessProcess(id: string, updated: { name: string; description: string }) {
  const res = await fetch(`${API_BASE}/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updated),
  });
  if (!res.ok) throw new Error("Failed to update");
  return res.json();
}

export async function deleteBusinessProcess(id: string) {
  const res = await fetch(`${API_BASE}/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete");
  return res.json();
}
