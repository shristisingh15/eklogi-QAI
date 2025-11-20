// frontend/src/App.tsx
import React from "react";
import { HashRouter as Router, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";

import Dashboard from "./pages/Dashboard";
import ProjectFlow from "./pages/ProjectFlow";
import LeftPanel from "./pages/LeftPanel";
import LoginPage from "./pages/Login";
import { auth } from "./auth";
import UploadDocument from "./pages/UploadDocument";
import FlowAnalysis from "./pages/FlowAnalysis";


// Optional pages — create these files or leave as placeholders below
import TestScenarios from "./pages/TestScenario";
import TestCases from "./pages/TestCase";
import TestRun from "./pages/TestRun";

// Pull API base from .env (VITE_API_BASE=https://exacoda-qai-q8up.onrender.com)
const API_BASE = import.meta.env.VITE_API_BASE || "https://exacoda-qai-q8up.onrender.com";

/** Demo page: lists business processes from Mongo */
function BusinessList() {
  const [processes, setProcesses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`${API_BASE}/api/business?limit=50`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json(); // { items, total }
        if (!ignore) setProcesses(Array.isArray(data?.items) ? data.items : []);
      } catch (e: any) {
        if (!ignore) setError(e?.message || "Failed to fetch data");
      } finally {
        if (!ignore) setLoading(false);
      }
    })();
    return () => { ignore = true; };
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h2>Business Processes</h2>
      {loading && <p>Loading…</p>}
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      {!loading && !error && (processes.length === 0 ? (
        <p>No processes found.</p>
      ) : (
        <ul>
          {processes.map((p: any) => (
            <li key={p._id}>
              <strong>{p.name}</strong> – {p.description}
            </li>
          ))}
        </ul>
      ))}
    </div>
  );
}

/** PrivateRoute wrapper */
function PrivateRoute({ children }: { children: JSX.Element }) {
  return auth.isLoggedIn() ? children : <Navigate to="/login" replace />;
}

function AppLayout() {
  const location = useLocation();
  const isLoginPage = location.pathname === "/login" || location.hash === "#/login";

  return (
    <div style={{ display: "flex" }}>
      {/* Show LeftPanel on every page except login */}
      {!isLoginPage && <LeftPanel />}

      <div style={{ flex: 1 }}>
        <Routes>
          {/* Default route → Dashboard if logged in, otherwise login */}
          <Route path="/" element={auth.isLoggedIn() ? <Navigate to="/dashboard" /> : <Navigate to="/login" />} />

          {/* Public */}
          <Route path="/login" element={<LoginPage />} />

          {/* Protected */}
          <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />

          {/* Project flow (Upload) */}
          <Route path="/project/:id" element={<PrivateRoute><ProjectFlow /></PrivateRoute>} />

<Route path="/debug-upload" element={<UploadDocument />} />
<Route path="/project/:id/upload" element={<PrivateRoute><UploadDocument /></PrivateRoute>} />

{/* fallback route so you can open page without a projectId */}
<Route
  path="/upload-document"
  element={
    <PrivateRoute>
      <UploadDocument />
    </PrivateRoute>
  }
/>


          {/* Flow Analysis */}
          <Route path="/project/:id/analysis" element={<PrivateRoute><FlowAnalysis /></PrivateRoute>} />

          {/* Test Scenarios */}
          <Route path="/project/:id/scenarios" element={<PrivateRoute><TestScenarios /></PrivateRoute>} />

          {/* Test Cases */}
<Route
  path="/project/:id/testcases"
  element={
    <PrivateRoute>
      <TestCases />
    </PrivateRoute>
  }
/>

          {/* Test / run */}
          <Route path="/project/:id/test" element={<PrivateRoute><TestRun /></PrivateRoute>} />

          {/* Demo list from businessProcesses */}
          <Route path="/business" element={<PrivateRoute><BusinessList /></PrivateRoute>} />

          {/* Catch-all */}
          <Route path="*" element={<Navigate to={auth.isLoggedIn() ? "/dashboard" : "/login"} />} />
        </Routes>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <AppLayout />
    </Router>
  );
}
