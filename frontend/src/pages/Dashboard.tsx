// src/pages/Dashboard.tsx (Overview only)
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "../auth";
import "./Dashboard.css";

const API_BASE =
  import.meta.env.VITE_API_BASE || "http://localhost:5004" ;//"http://localhost:5004" ;

type OverviewStats = {
  totalProjects: number;
  totalDocuments: number;
  totalBusinessProcesses: number;
};

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [overview, setOverview] = useState<OverviewStats>({
    totalProjects: 0,
    totalDocuments: 0,
    totalBusinessProcesses: 0,
  });
  const [profileOpen, setProfileOpen] = useState(false);
  const userEmail = auth.getUserEmail() || "user@domain.com";
  const avatarText = (userEmail || "U").slice(0, 1).toUpperCase();

  async function fetchOverview() {
    try {
      const res = await fetch(`${API_BASE}/dashboard/overview`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setOverview({
        totalProjects: Number(json?.totalProjects || 0),
        totalDocuments: Number(json?.totalDocuments || 0),
        totalBusinessProcesses: Number(json?.totalBusinessProcesses || 0),
      });
    } catch (e) {
      console.warn("Failed to load dashboard overview:", e);
    }
  }

  // initial load
  useEffect(() => {
    fetchOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="dashboard">
      <div className="main-content">
        <div className="dashboard-topbar">
          <div className="dashboard-topbar-left">Dashboard</div>
          <div className="dashboard-topbar-right">
            <div className="dashboard-search-wrap">
              <span className="dashboard-search-icon">⌕</span>
              <input type="text" placeholder="Search for anything..." className="dashboard-search-input" />
            </div>
            
            <div className="dashboard-user-menu-wrap">
              <button
                type="button"
                className="dashboard-user-chip"
                onClick={() => setProfileOpen((v) => !v)}
              >
                <span className="dashboard-user-avatar">{avatarText}</span>
                <span className="dashboard-user-text">
                  <strong>{userEmail}</strong>
                  <small>Signed in</small>
                </span>
                <span className="dashboard-user-caret">⌄</span>
              </button>
              {profileOpen && (
                <div className="dashboard-user-dropdown">
                  <button
                    type="button"
                    className="dashboard-user-dropdown-item"
                    onClick={() => {
                      auth.logout();
                      navigate("/login", { replace: true });
                      window.location.reload();
                    }}
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="overview-panel">
          <div className="overview-head">
            <h3>Overview</h3>
            <button type="button" className="overview-range-btn">Last 30 days</button>
          </div>
          <div className="overview-grid">
            <div className="overview-card">
              <div className="overview-icon overview-icon-projects">📁</div>
              <div className="overview-label">Total Projects</div>
              <div className="overview-value">{overview.totalProjects}</div>
            </div>
            <div className="overview-card">
              <div className="overview-icon overview-icon-docs">📄</div>
              <div className="overview-label">Documents Uploaded</div>
              <div className="overview-value">{overview.totalDocuments}</div>
            </div>
            <div className="overview-card">
              <div className="overview-icon overview-icon-bp">⚙️</div>
              <div className="overview-label">Business Processes Generated</div>
              <div className="overview-value">{overview.totalBusinessProcesses}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
