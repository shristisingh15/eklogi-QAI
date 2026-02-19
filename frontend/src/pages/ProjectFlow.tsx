// frontend/src/pages/ProjectFlow.tsx
import React, { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import "./ProjectFlow.css";
import StepButtons from "./StepButton"; // ⬅️ shared stepper buttons
import SourceFileInfo from "./SourceFileInfo";

// Use your API base (already set in your file). Keep as-is.
const API_BASE = import.meta.env.VITE_API_BASE || "https://eklogi-qai.onrender.com";
const MAX_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
];

type ProjectDetails = {
  _id?: string;
  name?: string;
  description?: string;
  [k: string]: any;
};

import { useProject } from "./ProjectContext"; // <-- new import

const ProjectFlow: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");

  // NEW: project details state
  const [projectDetails, setProjectDetails] = useState<ProjectDetails | null>(null);
  const [loadingProject, setLoadingProject] = useState<boolean>(false);
  const [projectErr, setProjectErr] = useState<string | null>(null);

  // Project context setters
  const { uploadedFiles, setProject, setUploadedFiles, setScenarios } = useProject();

  async function refreshProjectFiles(projectId: string) {
    try {
      const fRes = await fetch(`${API_BASE}/api/projects/${projectId}/files`);
      if (!fRes.ok) throw new Error(`HTTP ${fRes.status}`);
      const filesJson = await fRes.json();
      const filesConverted = (filesJson || [])
        .map((f: any) => ({
          _id: f._id,
          filename: f.filename,
          url: `${API_BASE}/api/projects/${projectId}/files/${f._id}`,
          mimeType: f.mimetype,
          version: f.version,
          processCount: typeof f.processCount === "number" ? f.processCount : 0,
          uploadedAt: f.uploadedAt,
        }))
        .sort((a: any, b: any) => {
          const ta = Date.parse(String(a?.uploadedAt || "")) || 0;
          const tb = Date.parse(String(b?.uploadedAt || "")) || 0;
          return tb - ta; // latest first
        });
      setUploadedFiles(filesConverted);
    } catch (fErr) {
      console.warn("Failed to load project files:", fErr);
      setUploadedFiles([]);
    }
  }

  useEffect(() => {
    // fetch project details when id available
    if (!id) return;
    const ac = new AbortController();
    (async () => {
      setLoadingProject(true);
      setProjectErr(null);
      try {
        // fetch project UI object
        const res = await fetch(`${API_BASE}/api/projects/${id}`, { signal: ac.signal });
        if (!res.ok) {
          const t = await res.text().catch(() => "");
          throw new Error(`HTTP ${res.status} ${t}`);
        }
        const json = await res.json();
        setProjectDetails(json || null);

        // Populate ProjectContext with project id/name
        if (json && json._id) {
          try {
            setProject(String(json._id), String(json.name || json.projectName || ""));
          } catch (ctxErr) {
            // ignore if context not ready
            console.warn("setProject failed:", ctxErr);
          }
        }

        // fetch files metadata (if any) and set in context
        await refreshProjectFiles(id);

        // fetch scenarios (if any) and set in context
        try {
          const sRes = await fetch(`${API_BASE}/api/projects/${id}/scenarios`);
          if (sRes.ok) {
            const sJson = await sRes.json();
            const items = Array.isArray(sJson.items) ? sJson.items : [];
            setScenarios(items);
          } else {
            setScenarios([]);
          }
        } catch (sErr) {
          console.warn("Failed to load project scenarios:", sErr);
          setScenarios([]);
        }
      } catch (e: any) {
        if (e?.name !== "AbortError") setProjectErr(e.message || "Failed to load project");
      } finally {
        setLoadingProject(false);
      }
    })();
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleFile(file: File) {
    if (!id) return;
    setErr(null);

    // basic validation
    if (file.size > MAX_BYTES) {
      setErr("File too large. Max 10MB.");
      return;
    }
    if (ALLOWED.length && !ALLOWED.includes(file.type)) {
      const nameOk = /\.(pdf|docx?|txt)$/i.test(file.name);
      if (!nameOk) {
        setErr("Unsupported file type. Use PDF, DOC, DOCX, or TXT.");
        return;
      }
    }

    const fd = new FormData();
    fd.append("file", file);

    try {
      setUploading(true);
      const res = await fetch(`${API_BASE}/api/projects/${id}/upload`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${text}`);
      }
      await res.json().catch(() => null);

      // After successful upload, refresh files & scenarios in context so Test page has the latest data
      await refreshProjectFiles(id);

      try {
        // fetch scenarios (if generation happens server-side automatically)
        const sRes = await fetch(`${API_BASE}/api/projects/${id}/scenarios`);
        if (sRes.ok) {
          const sJson = await sRes.json();
          const items = Array.isArray(sJson.items) ? sJson.items : [];
          setScenarios(items);
        }
      } catch (sErr) {
        console.warn("Failed to refresh scenarios after upload:", sErr);
      }

      // success → go to Flow Analysis
      navigate(`/project/${id}/analysis`, { replace: true });
    } catch (e: any) {
      setErr(e?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const onPick: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    void handleFile(file);
  };

  async function handleEditFile(fileId?: string, currentName?: string) {
    if (!id || !fileId) return;
    const nextName = window.prompt("Enter new file name", currentName || "");
    if (!nextName || nextName.trim() === currentName) return;
    try {
      const res = await fetch(`${API_BASE}/api/projects/${id}/files/${fileId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: nextName.trim() }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await refreshProjectFiles(id);
    } catch (e: any) {
      setErr(e?.message || "Failed to rename file");
    }
  }

  async function handleDeleteFile(fileId?: string, name?: string) {
    if (!id || !fileId) return;
    if (!window.confirm(`Delete file "${name || "this file"}"?`)) return;
    try {
      const res = await fetch(`${API_BASE}/api/projects/${id}/files/${fileId}`, {
        method: "DELETE",
      });
      if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`);
      await refreshProjectFiles(id);
    } catch (e: any) {
      setErr(e?.message || "Failed to delete file");
    }
  }

  return (
    <div className="project-page" style={{ minHeight: "100vh" }}>
      {/* Topbar */}
      <div className="topbar">
        <Link to="/projects">← Back to Projects</Link>
        <div className="topbar-actions">
          <button type="button">Settings</button>
          <button type="button" onClick={() => navigate("/login", { replace: true })}>
            Logout
          </button>
        </div>
      </div>

      {/* Project Header — SHOW PROJECT NAME instead of ID */}
      <h2>{projectDetails?.name || (loadingProject ? "Loading…" : "Untitled Project")}</h2>
      {projectDetails?.description ? (
        <p className="muted">{projectDetails.description}</p>
      ) : (
        <p className="muted">This is the flow view for the selected project.</p>
      )}

      {/* NEW: show error if project fetch failed */}
      {projectErr && <p style={{ color: "crimson" }}>{projectErr}</p>}

      {/* 🔹 Stepper Buttons (constant across pages) */}
      <StepButtons />

      <SourceFileInfo projectId={id} />

      {/* Upload Section */}
      <div className="upload-container">
        <div className="upload-box">
          <h3>Upload Documents</h3>
          <p>Upload your functional requirements, specifications, or user stories</p>

          {fileName && (
            <p style={{ marginTop: 6 }}>
              Selected: <b>{fileName}</b>
            </p>
          )}
          {uploading && <p>Uploading…</p>}
          {err && <p style={{ color: "crimson" }}>{err}</p>}

          <p>Drop your files here</p>
          <p>Supports PDF, DOC, DOCX, TXT files up to 10MB</p>

          {/* styled choose file button + hidden input */}
          <label htmlFor="projectFile" className="file-upload-btn">📂 Choose File</label>
          <input
            id="projectFile"
            type="file"
            accept=".pdf,.doc,.docx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
            onChange={onPick}
            disabled={uploading}
            style={{ display: "none" }}
          />
        </div>
      </div>

      <div className="upload-table-divider" />

      <div className="project-files-table-wrap">
        <h3 className="project-files-title">Uploaded Files</h3>
        <table className="project-files-table">
          <thead>
            <tr>
              <th>Sr.No</th>
              <th>Uploaded Files</th>
              <th>Business Process Generated</th>
              <th>Date Uploaded</th>
              <th>Edit</th>
              <th>Delete</th>
            </tr>
          </thead>
          <tbody>
            {uploadedFiles.length === 0 ? (
              <tr>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
              </tr>
            ) : (
              uploadedFiles.map((f, idx) => (
                <tr key={f._id || `${f.filename}-${idx}`}>
                  <td>{idx + 1}</td>
                  <td>{f.filename}</td>
                  <td>{typeof f.processCount === "number" ? f.processCount : 0}</td>
                  <td>{f.uploadedAt ? new Date(f.uploadedAt).toLocaleString() : "-"}</td>
                  <td>
                    <button
                      type="button"
                      className="file-action-btn"
                      onClick={() => handleEditFile(f._id, f.filename)}
                    >
                      Edit
                    </button>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="file-action-btn file-action-btn-danger"
                      onClick={() => handleDeleteFile(f._id, f.filename)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ProjectFlow;
