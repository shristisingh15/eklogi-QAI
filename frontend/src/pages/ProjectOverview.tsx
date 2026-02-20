import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import "./ProjectOverview.css";

const API_BASE = import.meta.env.VITE_API_BASE || "https://eklogi-qai.onrender.com";

type ProjectData = {
  _id?: string;
  name?: string;
  description?: string;
  type?: string;
  date?: string;
};

type ProjectFile = {
  _id: string;
  filename: string;
  uploadedAt?: string;
};

type ProjectMetrics = {
  businessProcessCount: number;
  scenarioCount: number;
  testCaseCount: number;
  testCodeCount: number;
};

export default function ProjectOverview(): JSX.Element {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [pagesOpen, setPagesOpen] = useState<boolean>(false);
  const [project, setProject] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<ProjectMetrics>({
    businessProcessCount: 0,
    scenarioCount: 0,
    testCaseCount: 0,
    testCodeCount: 0,
  });
  const [files, setFiles] = useState<ProjectFile[]>([]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const loadOverview = async () => {
      try {
        setLoading(true);
        setError(null);
        const [projectResult, overviewResult, filesResult] = await Promise.allSettled([
          fetch(`${API_BASE}/api/projects/${id}`),
          fetch(`${API_BASE}/api/projects/${id}/overview`),
          fetch(`${API_BASE}/api/projects/${id}/files`),
        ]);
        const projectRes = projectResult.status === "fulfilled" ? projectResult.value : null;
        const overviewRes = overviewResult.status === "fulfilled" ? overviewResult.value : null;
        const filesRes = filesResult.status === "fulfilled" ? filesResult.value : null;

        const projectJson = projectRes?.ok ? await projectRes.json() : null;
        if (!cancelled) setProject(projectJson || null);

        const overviewJson = overviewRes?.ok ? await overviewRes.json() : {};
        const metricJson = overviewJson?.metrics || {};
        const overviewFiles = Array.isArray(overviewJson?.files) ? overviewJson.files : [];
        const directFiles = filesRes?.ok ? await filesRes.json() : [];
        const filesRaw = [
          ...overviewFiles,
          ...(Array.isArray(directFiles) ? directFiles : []),
        ];
        const uniqueMap = new Map<string, any>();
        filesRaw.forEach((f: any) => {
          const key = String(f?._id || `${f?.filename || ""}-${f?.uploadedAt || ""}`);
          if (!key) return;
          uniqueMap.set(key, f);
        });
        const fileItems = Array.from(uniqueMap.values());

        if (!cancelled) {
          setMetrics({
            businessProcessCount: Number(metricJson?.businessProcessCount || 0),
            scenarioCount: Number(metricJson?.scenarioCount || 0),
            testCaseCount: Number(metricJson?.testCaseCount || 0),
            testCodeCount: Number(metricJson?.testCodeCount || 0),
          });
          setFiles(
            [...fileItems].sort((a: any, b: any) => {
              const at = new Date(a?.uploadedAt || 0).getTime();
              const bt = new Date(b?.uploadedAt || 0).getTime();
              return bt - at;
            })
          );
        }

        if (!projectRes && !overviewRes && !filesRes) {
          throw new Error("Failed to reach backend");
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load project");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadOverview();
    const interval = window.setInterval(loadOverview, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [id]);

  return (
    <div className="project-overview-page">
      <div className="project-overview-topbar">
        <Link to="/projects" className="project-overview-back">← Back to Projects</Link>
      </div>

      <div className="project-overview-card">
        <h2>Project Overview</h2>

        {loading ? (
          <p>Loading project...</p>
        ) : error ? (
          <p className="project-overview-error">{error}</p>
        ) : (
          <>
            <h3>{project?.name || "Untitled Project"}</h3>
            <p>{project?.description || "No description provided."}</p>
          </>
        )}
      </div>

      <div className="project-overview-upload-row">
        <div className="project-overview-pages-dropdown">
          <button
            type="button"
            className="project-overview-pages-btn"
            onClick={() => setPagesOpen((prev) => !prev)}
          >
            Pages +
          </button>
          {pagesOpen && (
            <div className="project-overview-pages-menu">
              <button type="button" onClick={() => id && navigate(`/project/${id}/upload`)}>
                Upload Document
              </button>
              <button type="button" onClick={() => id && navigate(`/project/${id}/analysis`)}>
                Business Process
              </button>
              <button type="button" onClick={() => id && navigate(`/project/${id}/scenarios`)}>
                Test Scenario
              </button>
              <button type="button" onClick={() => id && navigate(`/project/${id}/testcases`)}>
                Test Case
              </button>
              <button type="button" onClick={() => id && navigate(`/project/${id}/test`)}>
                Test Codes
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="project-overview-metrics-card">
        <div className="project-overview-metrics-head">
          <h3>Overview</h3>
        </div>
        <div className="project-overview-metrics-grid">
          <div className="project-overview-metric-item">
            <div className="project-overview-metric-label">Business Processes</div>
            <div className="project-overview-metric-value">{metrics.businessProcessCount}</div>
          </div>
          <div className="project-overview-metric-item">
            <div className="project-overview-metric-label">Test Scenarios</div>
            <div className="project-overview-metric-value">{metrics.scenarioCount}</div>
          </div>
          <div className="project-overview-metric-item">
            <div className="project-overview-metric-label">Test Cases</div>
            <div className="project-overview-metric-value">{metrics.testCaseCount}</div>
          </div>
          <div className="project-overview-metric-item">
            <div className="project-overview-metric-label">Test Codes Generated</div>
            <div className="project-overview-metric-value">{metrics.testCodeCount}</div>
          </div>
        </div>
      </div>

      <div className="project-overview-files-card">
        <h3>Document Repository</h3>
        {loading ? (
          <p>Loading documents...</p>
        ) : files.length === 0 ? (
          <p>No documents uploaded for this project yet.</p>
        ) : (
          <table className="project-overview-files-table">
            <thead>
              <tr>
                <th>Sr.No</th>
                <th>Document Name</th>
                <th>Uploaded At</th>
              </tr>
            </thead>
            <tbody>
              {files.map((f, i) => (
                <tr key={f._id}>
                  <td>{i + 1}</td>
                  <td>{f.filename}</td>
                  <td>{f.uploadedAt ? new Date(f.uploadedAt).toLocaleString() : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
