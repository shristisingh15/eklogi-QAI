// src/pages/Flow.tsx
import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import UploadDocument from "./UploadDocument"; // note singular filename

const API_BASE = (import.meta.env.VITE_API_BASE as string) || "http://localhost:5000";

type ProjectDetails = {
  _id?: string;
  name?: string;
  description?: string;
  [k: string]: any;
};

function Flow() {
  const { id } = useParams<{ id: string }>();
  const [step, setStep] = useState<number>(1);
  const [processes, setProcesses] = useState<any[]>([]);
  const [project, setProject] = useState<ProjectDetails | null>(null);
  const [loadingProject, setLoadingProject] = useState(false);
  const [projectErr, setProjectErr] = useState<string | null>(null);

  // Load project details when id changes
  useEffect(() => {
    if (!id) {
      setProject(null);
      return;
    }

    const ac = new AbortController();
    (async () => {
      setLoadingProject(true);
      setProjectErr(null);
      try {
        const res = await fetch(`${API_BASE}/api/projects/${id}`, { signal: ac.signal });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`HTTP ${res.status} ${text}`);
        }
        const json = await res.json();
        setProject(json || null);
      } catch (err: any) {
        if (err?.name !== "AbortError") {
          setProjectErr(err.message || "Failed to load project");
          setProject(null);
        }
      } finally {
        setLoadingProject(false);
      }
    })();

    return () => ac.abort();
  }, [id]);

  // Fetch business processes when step === 2
  useEffect(() => {
    if (step !== 2) {
      setProcesses([]);
      return;
    }

    const ac = new AbortController();
    (async () => {
      try {
        // If your API accepts project filter, include it
        const url = `${API_BASE}/api/business${id ? `?project=${id}` : ""}`;
        const res = await fetch(url, { signal: ac.signal });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`HTTP ${res.status} ${text}`);
        }
        const json = await res.json();
        const list = Array.isArray(json) ? json : json?.items ?? [];
        setProcesses(list);
      } catch (err) {
        console.error("Failed to load business processes", err);
        setProcesses([]);
      }
    })();

    return () => ac.abort();
  }, [step, id]);

  return (
    <div style={{ padding: 20 }}>
      <div style={{ marginBottom: 12 }}>
        <Link to="/dashboard">← Back to Projects</Link>
      </div>

      <h2 style={{ marginBottom: 6 }}>Project: {id ?? "—"}</h2>
      <p style={{ marginTop: 0, color: "#6b7280" }}>
        This is the flow view for <strong>{id}</strong>.
      </p>

      {/* Project name & description */}
      <div style={{ marginTop: 8, marginBottom: 16 }}>
        {loadingProject ? (
          <p>Loading project details…</p>
        ) : projectErr ? (
          <p style={{ color: "crimson" }}>{projectErr}</p>
        ) : project ? (
          <>
            <h3 style={{ margin: "6px 0 4px", fontSize: 20, color: "#111827" }}>
              {project.name ?? "Untitled Project"}
            </h3>
            <p style={{ margin: 0, color: "#6b7280" }}>
              {project.description ?? "No description provided."}
            </p>
          </>
        ) : (
          <p style={{ color: "#6b7280" }}>No project information available.</p>
        )}
      </div>

      {/* Steps */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <button onClick={() => setStep(1)} style={{ padding: "8px 12px", borderRadius: 8, background: step === 1 ? "#3b82f6" : "#f1f5f9", color: step === 1 ? "#fff" : "#111827", border: "1px solid #cbd5e1" }}>1. Upload Documents</button>
        <button onClick={() => setStep(2)} style={{ padding: "8px 12px", borderRadius: 8, background: step === 2 ? "#3b82f6" : "#f1f5f9", color: step === 2 ? "#fff" : "#111827", border: "1px solid #cbd5e1" }}>2. Flow Analysis</button>
        <button onClick={() => setStep(3)} style={{ padding: "8px 12px", borderRadius: 8, background: step === 3 ? "#3b82f6" : "#f1f5f9", color: step === 3 ? "#fff" : "#111827", border: "1px solid #cbd5e1" }}>3. Test Scenarios</button>
        <button onClick={() => setStep(4)} style={{ padding: "8px 12px", borderRadius: 8, background: step === 4 ? "#3b82f6" : "#f1f5f9", color: step === 4 ? "#fff" : "#111827", border: "1px solid #cbd5e1" }}>4. Test Cases</button>
        <button onClick={() => setStep(5)} style={{ padding: "8px 12px", borderRadius: 8, background: step === 5 ? "#3b82f6" : "#f1f5f9", color: step === 5 ? "#fff" : "#111827", border: "1px solid #cbd5e1" }}>5. Test</button>
      </div>

      <div className="steps">
        {step === 1 && <UploadDocument setStep={setStep} projectId={id} />}

        {step === 2 && (
          <div>
            <h3>Flow Analysis</h3>
            {processes.length > 0 ? (
              <ul>
                {processes.map((p: any, idx: number) => (
                  <li key={p._id ?? idx} style={{ marginBottom: 8 }}>
                    <strong>{p.name}</strong> - {p.description}
                  </li>
                ))}
              </ul>
            ) : (
              <p>No business processes found.</p>
            )}
          </div>
        )}

        {step === 3 && <div>Test Scenarios</div>}
        {step === 4 && <div>Test Cases</div>}
        {step === 5 && <div>Test</div>}
      </div>
    </div>
  );
}

export default Flow;
