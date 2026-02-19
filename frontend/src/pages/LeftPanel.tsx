// frontend/src/pages/LeftPanel.tsx
import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { auth } from "../auth";
import "./LeftPanel.css";
import logoSrc from "../assets/logoo.png.jpeg"; // adjust path/name

const API_BASE = (import.meta.env.VITE_API_BASE || "https://eklogi-qai.onrender.com")
  .split(",")[0]
  .trim()
  .replace(/\/+$/, "");

type Project = { _id: string; name: string; description?: string; type?: string };

const LeftPanel: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const [projects, setProjects] = useState<Project[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const isActive = (path: string) => location.pathname.startsWith(path);

  // fetch projects from backend (reads from Mongo via backend)
  const loadProjects = async () => {
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
          <li className={isActive("/projects") || isActive("/project/") ? "active" : ""} onClick={() => navigate("/projects")}>
            <span className="nav-left">Projects</span>
          </li>
        </ul>
      </div>

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
