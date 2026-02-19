// src/pages/UploadDocument.tsx
import React, { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import "./UploadDocument.css";
import StepButtons from "./StepButton";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5004";

type ProjectFile = {
  _id: string;
  filename: string;
  uploadedAt: string;
  size?: number;
};

type UploadDocumentProps = {
  setStep?: React.Dispatch<React.SetStateAction<number>>;
  projectId?: string;
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

  // fetch uploaded file history
  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch(`${API_BASE}/api/projects/${id}/files`);
        if (!res.ok) throw new Error(`Failed to load files: ${res.status}`);
        const data = await res.json();
        const sorted = [...(Array.isArray(data) ? data : [])].sort((a: ProjectFile, b: ProjectFile) => {
          const at = new Date(a?.uploadedAt || 0).getTime();
          const bt = new Date(b?.uploadedAt || 0).getTime();
          return bt - at;
        });
        setFiles(sorted);
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

  const deleteFile = async (fileId: string) => {
    if (!id) return;
    try {
      setError(null);
      const res = await fetch(`${API_BASE}/api/projects/${id}/files/${fileId}`, { method: "DELETE" });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `Failed to delete file: ${res.status}`);
      }
      setFiles((prev) => prev.filter((f) => f._id !== fileId));
    } catch (err: any) {
      setError(err?.message || "Failed to delete file");
    }
  };
  return (
    <div className="project-page">
      {/* push content down so stepper doesn't overlap */}
      <div style={{ marginTop: 80 }} />
      <div style={{ margin: "0 auto 14px", display: "flex", justifyContent: "center" }}>
        <StepButtons />
      </div>



      {/* ===== Upload card (centered, matches .upload-container style) ===== */}
      <div style={{ width: "min(1200px, 95%)", margin: "0 auto 0" }}>
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

      {/* Uploaded files table */}
      <div className="history-section" style={{ width: "min(1200px, 95%)", margin: "20px auto 80px" }}>
        <h3>Uploaded Files (This Project)</h3>
        {loading ? (
          <p>Loading…</p>
        ) : files.length === 0 ? (
          <p>No documents uploaded yet.</p>
        ) : (
          <table className="upload-table">
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>File Name</th>
                <th>Uploaded At</th>
                <th>Size</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {files.map((f) => (
                <tr key={f._id}>
                  <td style={{ textAlign: "left" }}>{f.filename}</td>
                  <td>{f.uploadedAt ? new Date(f.uploadedAt).toLocaleString() : "-"}</td>
                  <td>{typeof f.size === "number" ? `${Math.ceil(f.size / 1024)} KB` : "-"}</td>
                  <td>
                    <button
                      type="button"
                      className="upload-file-btn upload-file-btn-delete"
                      onClick={() => deleteFile(f._id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
