// src/pages/UploadDocument.tsx
import React, { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import "./UploadDocument.css";
import StepButtons from "./StepButton";

const API_BASE = import.meta.env.VITE_API_BASE || "https://eklogi-qai.onrender.com";

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
        navigate(`/project/${id}/analysis`, {
          state: {
            generationStatus: {
              title: "Business Processes Generated",
              count: Number(json?.count || 0),
              label: "Business Processes",
              subtitle: `File: ${file.name}`,
            },
          },
        });
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
    <div className="project-page upload-document-page">
      <div className="upload-page-content">
        <div className="upload-page-back-row">
          <button
            type="button"
            className="upload-back-link"
            onClick={() => id && navigate(`/project/${id}`)}
          >
            ← Back to Overview
          </button>
        </div>

        <div className="upload-page-stepper">
          <StepButtons />
        </div>

        <section className="upload-container">
          <div className="upload-card-grid">
            <h2>Upload Documents</h2>
            <div className="upload-copy">
              <p>Upload your functional requirements, specifications, or user stories</p>
              <p>Drop your files here</p>
              <p>Supports PDF, DOC, DOCX, TXT files up to 10MB</p>
            </div>

            <div className="upload-btn-wrap">
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
              >
                {uploading ? "Processing…" : "Choose File"}
              </button>
            </div>
          </div>
        </section>

        {error && <p className="upload-error">{error}</p>}

        <section className="history-section">
          <h3>Uploaded Files (This Project)</h3>
          {loading ? (
            <p className="upload-table-message">Loading…</p>
          ) : files.length === 0 ? (
            <p className="upload-table-message">No documents uploaded yet.</p>
          ) : (
            <table className="upload-table">
              <thead>
                <tr>
                  <th>File Name</th>
                  <th>Uploaded At</th>
                  <th>Size</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {files.map((f) => (
                  <tr key={f._id}>
                    <td>{f.filename}</td>
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
        </section>
      </div>
    </div>
  );
}
