// src/pages/UploadDocument.tsx
import React, { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import "./UploadDocument.css";

const API_BASE = import.meta.env.VITE_API_BASE || "https://exacoda-qai-q8up.onrender.com";

type ProjectFile = {
  _id: string;
  filename: string;
  version: string;
  uploadedAt: string;
};

type UploadDocumentProps = {
  setStep?: React.Dispatch<React.SetStateAction<number>>;
  projectId?: string;
};
type DocRow = {
  _id: string;
  name: string;
  scenariosCount?: number;
  testCasesCount?: number;
  uploadedAt?: string;
};

export default function UploadDocument({ setStep, projectId }: UploadDocumentProps) {
  const params = useParams<{ id: string }>();
  const id = projectId || params.id; // prefer prop, fallback to route param
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [documents, setDocuments] = useState<DocRow[]>([]);
const [docsLoading, setDocsLoading] = useState(true);
const [docsErr, setDocsErr] = useState<string | null>(null);

useEffect(() => {
  let mounted = true;
  (async () => {
    setDocsLoading(true);
    setDocsErr(null);
    try {
      const res = await fetch(`${API_BASE}/api/documents`); // adjust endpoint if needed
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!mounted) return;
      // expect json.items or json.data — try both
      const rows = json?.items || json?.data || json || [];
      setDocuments(rows.map((r: any) => ({
        _id: r._id || r.id,
        name: r.name || r.filename || "Untitled",
        scenariosCount: typeof r.scenariosCount === "number" ? r.scenariosCount : (r.scenarios?.length || 0),
        testCasesCount: typeof r.testCasesCount === "number" ? r.testCasesCount : (r.testCases?.length || 0),
        uploadedAt: r.createdAt || r.uploadedAt || "",
      })));
    } catch (e: any) {
      setDocsErr(e?.message || "Failed to load documents");
    } finally {
      if (mounted) setDocsLoading(false);
    }
  })();
  return () => { mounted = false; };
}, []);

  // fetch uploaded file history
  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch(`${API_BASE}/api/projects/${id}/files`);
        if (!res.ok) throw new Error(`Failed to load files: ${res.status}`);
        const data = await res.json();
        setFiles(data);
      } catch (err: any) {
        console.error("❌ Load files failed:", err);
        setError(err?.message || "Failed to load history");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  // handle Choose File -> call OpenAI + store results in Mongo
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = e.target.files?.[0];
    if (!file || !id) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`${API_BASE}/api/projects/${id}/generate-bp`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Upload failed: ${txt || res.status}`);
      }
      const json = await res.json();
      console.log("✅ generate-bp returned:", json);

      // if being used inside Flow.tsx, go to next step
      if (setStep) {
        setStep(2);
      } else {
        // if used standalone, redirect to analysis page
        navigate(`/project/${id}/analysis`);
      }
    } catch (err: any) {
      console.error("❌ generate-bp failed:", err);
      setError(err?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };
  return (
    <div className="project-page">
      {/* push content down so stepper doesn't overlap */}
      <div style={{ marginTop: 80 }} />
      {/* ===== Hardcoded table (forced visible for testing) ===== */}
<div style={{ 
  maxWidth: 900, 
  margin: "20px auto", 
  padding: "16px", 
  background: "#fffbe6",  // pale yellow background so it's obvious
  border: "2px solid #f59e0b", 
  borderRadius: "8px" 
}}>
  <h3 style={{ marginBottom: "12px", color: "#92400e" }}>Uploaded Documents (Hardcoded)</h3>
  <table style={{ width: "100%", borderCollapse: "collapse" }}>
    <thead>
      <tr style={{ background: "#fde68a" }}>
        <th style={{ border: "1px solid #fbbf24", padding: "8px", textAlign: "left" }}>Document</th>
        <th style={{ border: "1px solid #fbbf24", padding: "8px", textAlign: "center" }}>Test Scenarios</th>
        <th style={{ border: "1px solid #fbbf24", padding: "8px", textAlign: "center" }}>Test Cases</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td style={{ border: "1px solid #fcd34d", padding: "8px" }}>requirements.docx</td>
        <td style={{ border: "1px solid #fcd34d", padding: "8px", textAlign: "center" }}>-</td>
        <td style={{ border: "1px solid #fcd34d", padding: "8px", textAlign: "center" }}>-</td>
      </tr>
      <tr>
        <td style={{ border: "1px solid #fcd34d", padding: "8px" }}>demo-specs.pdf</td>
        <td style={{ border: "1px solid #fcd34d", padding: "8px", textAlign: "center" }}>-</td>
        <td style={{ border: "1px solid #fcd34d", padding: "8px", textAlign: "center" }}>-</td>
      </tr>
      <tr>
        <td style={{ border: "1px solid #fcd34d", padding: "8px" }}>api-guidelines.txt</td>
        <td style={{ border: "1px solid #fcd34d", padding: "8px", textAlign: "center" }}>-</td>
        <td style={{ border: "1px solid #fcd34d", padding: "8px", textAlign: "center" }}>-</td>
      </tr>
    </tbody>
  </table>
</div>

{/* ===== Spacer ===== */}
<div style={{ height: 50 }} />


      {/* Project header (keeps your existing header) */}
      <div className="project-header" style={{ maxWidth: 900, margin: "0 auto 16px" }}>
        <h2>Upload Document</h2>
        <p className="muted">Upload a document to analyze against business processes.</p>
      </div>



      {/* ===== Upload card (centered, matches .upload-container style) ===== */}
      <div style={{ maxWidth: 900, margin: "0 auto 0" }}>
        <div className="upload-container" style={{ textAlign: "center" }}>
          <h2 style={{ margin: "0 0 8px 0" }}>Upload Documents</h2>
          <p style={{ marginTop: 0, color: "#6b7280" }}>
            Upload your functional requirements, specifications, or user stories
            <br />
            Drop your files here
            <br />
            Supports PDF, DOC, DOCX, TXT files up to 10MB
          </p>

          <input
            type="file"
            ref={fileInputRef}
            style={{ display: "none" }}
            accept=".pdf,.doc,.docx,.txt"
            onChange={handleFileChange}
          />

          <button
            className="upload-btn"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            style={{ marginTop: 12 }}
          >
            {uploading ? "Processing…" : "Choose File"}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && <p style={{ color: "crimson", maxWidth: 900, margin: "12px auto 0" }}>{error}</p>}

      {/* History section */}
      <div className="history-section" style={{ maxWidth: 900, margin: "20px auto 80px" }}>
        <h3>History</h3>
        {loading ? (
          <p>Loading…</p>
        ) : files.length === 0 ? (
          <p>No documents uploaded yet.</p>
        ) : (
          <ul>
            {files.map((f) => (
              <li key={f._id}>
                <strong>{f.filename}</strong> ({f.version}) –{" "}
                {new Date(f.uploadedAt).toLocaleString()}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
