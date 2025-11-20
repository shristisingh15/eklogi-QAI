// frontend/src/pages/LeftPanel.tsx
import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { auth } from "../auth";
import "./LeftPanel.css";
import logoSrc from "../assets/logoo.png.jpeg"; // adjust path/name

const API_BASE = import.meta.env.VITE_API_BASE || "https://eklogi-qai.onrender.com";

type Project = { _id: string; name: string; description?: string; type?: string };
type ProjectFile = { _id: string; filename: string; version?: string };

const LeftPanel: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsExpanded, setProjectsExpanded] = useState<boolean>(false);
  const [expandedProject, setExpandedProject] = useState<string | null>(null);
  const [files, setFiles] = useState<Record<string, ProjectFile[]>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [err, setErr] = useState<string | null>(null);

  const isActive = (path: string) => location.pathname.startsWith(path);
  const isProjectActive = (id: string) => location.pathname.startsWith(`/project/${id}`);

  // fetch projects from backend (reads from Mongo via backend)
  const loadProjects = async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`${API_BASE}/api/projects?limit=100`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      // backend returns { items: [...] } or an array — handle both
      const items = Array.isArray(json.items) ? json.items : Array.isArray(json) ? json : [];
      // Normalize to our Project shape (some backends use different field names)
      const normalized = items.map((it: any) => ({
        _id: it._id || it.id,
        name: it.name || it.projectName || it.title || "Untitled",
        description: it.description || "",
        type: it.type || it.projectType || "Web",
      }));
      setProjects(normalized);
    } catch (e: any) {
      console.error("Failed loading projects", e);
      setErr(e.message || "Failed to load projects");
    } finally {
      setLoading(false);
    }
  };

  // load files for a project (keeps previous cached files)
  async function loadFiles(projectId: string) {
    try {
      const res = await fetch(`${API_BASE}/api/projects/${projectId}/files`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const list = Array.isArray(json) ? json : Array.isArray(json.items) ? json.items : [];
      setFiles((prev) => ({ ...prev, [projectId]: list }));
    } catch (e) {
      console.warn("Failed to fetch files", e);
    }
  }

  // toggle file list
  const toggleProjectFiles = (projectId: string) => {
    if (expandedProject === projectId) {
      setExpandedProject(null);
    } else {
      setExpandedProject(projectId);
      if (!files[projectId]) loadFiles(projectId);
    }
  };

  const handleDownload = async (projectId: string, file: ProjectFile) => {
    try {
      const res = await fetch(`${API_BASE}/api/projects/${projectId}/files/${file._id}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.filename;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      alert("Error downloading file");
      console.error(e);
    }
  };

  useEffect(() => {
    loadProjects();
    const onChanged = () => loadProjects();
    window.addEventListener("projects:changed", onChanged);
    return () => window.removeEventListener("projects:changed", onChanged);
  }, []);

  return (
    <div className="sidebar">
      <div className="sidebar-logo" onClick={() => navigate("/dashboard")} role="button" aria-label="Go to dashboard">
        <div className="logo-wrapper">
          <img src={logoSrc} alt="Exacoda logo" />
          <div className="logo-text">Agentic Software Testing Demo</div>
        </div>
      </div>

      <div className="sidebar-nav">
        <ul>
          <li className={isActive("/dashboard") ? "active" : ""} onClick={() => navigate("/dashboard")}>
            <span className="nav-left">Dashboard</span>
          </li>
          <li className="disabled">
            <span className="nav-left">Upload File</span>
          </li>
          <li className="disabled">
            <span className="nav-left">Results</span>
          </li>
          <li className="disabled">
            <span className="nav-left">Settings</span>
          </li>
        </ul>
      </div>

      <div
        className={`projects-toggle-row ${projectsExpanded ? "open" : ""}`}
        onClick={() => {
          if (projectsExpanded) setExpandedProject(null);
          setProjectsExpanded((v) => !v);
        }}
        role="button"
        aria-expanded={projectsExpanded}
      >
        <span className="projects-label">Projects</span>
        <span className={`projects-chev ${projectsExpanded ? "open" : ""}`} aria-hidden>
          ▶
        </span>
      </div>

      {projectsExpanded && (
        <div className="sidebar-projects">
          <ul className="project-list">
            {loading && <li className="muted">Loading…</li>}
            {err && <li className="error">{err}</li>}
            {!loading && !err && projects.length === 0 && <li className="muted">No projects yet</li>}

            {!loading &&
              !err &&
              projects.map((p) => (
                <li key={p._id} className="project-row">
                  <button
                    className={`project-name ${isProjectActive(p._id) ? "active" : ""}`}
                    onClick={() => navigate(`/project/${p._id}`)}
                    title="Open project"
                  >
                    {p.name}
                  </button>

                  <button
                    className={`project-expand ${expandedProject === p._id ? "open" : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleProjectFiles(p._id);
                    }}
                    aria-expanded={expandedProject === p._id}
                    title="Show versions/files"
                  >
                    ▸
                  </button>

                  {expandedProject === p._id && files[p._id] && (
                    <ul className="file-list">
                      {files[p._id].map((f) => (
                        <li
                          key={f._id}
                          className="file-item"
                          onClick={() => handleDownload(p._id, f)}
                          title={`Download ${f.filename}`}
                        >
                          <span className="file-version">{f.version}</span>
                          <span className="file-name"> {f.filename}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
          </ul>
        </div>
      )}

      <div className="sidebar-footer">
        <button
          className="logout-btn"
          onClick={() => {
            auth.logout();
            navigate("/login", { replace: true });
            window.location.reload();
          }}
        >
          Logout
        </button>
      </div>
    </div>
  );
};

export default LeftPanel;
