import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./Dashboard.css";

const API_BASE = import.meta.env.VITE_API_BASE || "https://eklogi-qai.onrender.com";

interface Project {
  _id?: string;
  name: string;
  description: string;
  type?: string;
  date?: string;
  step?: string;
}

const Projects: React.FC = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filterType, setFilterType] = useState("All Types");
  const [showModal, setShowModal] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [formProject, setFormProject] = useState<Project>({
    name: "",
    description: "",
    type: "Web",
    date: new Date().toISOString().split("T")[0],
    step: "0%",
  });

  async function fetchProjectsList(query = "") {
    setLoading(true);
    setErr(null);
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 15000);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (filterType !== "All Types") params.set("type", filterType);
      params.set("limit", "60");
      const res = await fetch(`${API_BASE}/dashboard/projects?${params.toString()}`, {
        signal: ac.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      let items: Project[] = Array.isArray(json?.items) ? json.items : [];
      items = items.map((p: any) => ({
        ...p,
        name: p.name || p.projectName || "Untitled Project",
        type: p.type || p.projectType || "Web",
        step: p.step || (typeof p.progress === "number" ? `${p.progress}%` : "0%"),
      }));
      setProjects(items);
    } catch (e: any) {
      if (e?.name !== "AbortError") setErr(e.message || "Failed to fetch projects");
    } finally {
      clearTimeout(t);
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchProjectsList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const id = setTimeout(() => fetchProjectsList(q), 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, filterType]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    setFormProject({ ...formProject, [e.target.name]: e.target.value });
  };

  const handleAddProject = async () => {
    if (!formProject.name || !formProject.description) {
      alert("Name and Description are required.");
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formProject.name,
          description: formProject.description,
          type: formProject.type || "Web",
          date: formProject.date,
          step: formProject.step,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await res.json();
      window.dispatchEvent(new Event("projects:changed"));
      closeModal();
      fetchProjectsList(q);
    } catch (e: any) {
      alert(e?.message || "Error adding project");
    }
  };

  const handleUpdateProject = async () => {
    if (!editingProject?._id) return;
    try {
      const res = await fetch(`${API_BASE}/api/projects/${editingProject._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formProject.name,
          description: formProject.description,
          type: formProject.type || "Web",
          date: formProject.date,
          step: formProject.step,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await res.json();
      window.dispatchEvent(new Event("projects:changed"));
      closeModal();
      fetchProjectsList(q);
    } catch (e: any) {
      alert(e?.message || "Error updating project");
    }
  };

  const handleDeleteProject = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this project?")) return;
    try {
      const res = await fetch(`${API_BASE}/api/projects/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`);
      window.dispatchEvent(new Event("projects:changed"));
      fetchProjectsList(q);
    } catch (e: any) {
      alert(e?.message || "Error deleting project");
    }
  };

  const openAddModal = () => {
    setEditingProject(null);
    setFormProject({
      name: "",
      description: "",
      type: "Web",
      date: new Date().toISOString().split("T")[0],
      step: "0%",
    });
    setShowModal(true);
  };

  const openEditModal = (project: Project) => {
    setEditingProject(project);
    setFormProject({
      ...project,
      type: project.type || "Web",
      date: project.date || new Date().toISOString().split("T")[0],
      step: project.step || "0%",
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingProject(null);
  };

  return (
    <div className="dashboard">
      <div className="main-content">
        <div className="page-header">
          <h2>Test Projects</h2>
          <p>Manage your automated testing projects and workflows</p>
        </div>

        <div className="controls">
          <input
            type="text"
            placeholder="Search projects..."
            className="search-bar"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select
            className="filter-dropdown"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
          >
            <option>All Types</option>
            <option>Web</option>
            <option>Mobile</option>
            <option>UI-Testing</option>
            <option>API</option>
            <option>AI</option>
          </select>
          <button className="new-project-btn" onClick={openAddModal}>
            + New Project
          </button>
        </div>

        {loading ? (
          <p>Loading projects...</p>
        ) : err ? (
          <p style={{ color: "crimson" }}>{err}</p>
        ) : (
          <div className="projects-grid">
            {projects.map((project) => (
              <div key={project._id} className="project-card">
                <div
                  className="project-header"
                  onClick={() => project._id && navigate(`/project/${project._id}`)}
                >
                  <h4>{project.name}</h4>
                  <p>{project.type || "Web"}</p>
                </div>
                <p className="description">{project.description}</p>
                <div className="project-footer">
                  <div className="date">{project.date || "—"}</div>
                </div>
                <div className="actions">
                  <button onClick={() => openEditModal(project)}>Edit</button>
                  <button onClick={() => project._id && handleDeleteProject(project._id)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {showModal && (
          <div className="modal-overlay">
            <div className="modal">
              <h3>{editingProject ? "Edit Project" : "Create New Project"}</h3>
              <input
                type="text"
                name="name"
                placeholder="Project Name"
                value={formProject.name}
                onChange={handleChange}
              />
              <textarea
                name="description"
                placeholder="Project Description"
                value={formProject.description}
                onChange={handleChange}
              />
              <select name="type" value={formProject.type} onChange={handleChange}>
                <option>Web</option>
                <option>Mobile</option>
                <option>UI-Testing</option>
                <option>API</option>
                <option>AI</option>
              </select>
              <input type="date" name="date" value={formProject.date} onChange={handleChange} />
              {editingProject ? (
                <button type="button" className="save-btn" onClick={handleUpdateProject}>
                  Update
                </button>
              ) : (
                <button type="button" className="save-btn" onClick={handleAddProject}>
                  Save
                </button>
              )}
              <button type="button" className="cancel-btn" onClick={closeModal}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Projects;
