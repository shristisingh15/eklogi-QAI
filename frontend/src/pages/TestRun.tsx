// frontend/src/pages/TestRun.tsx
import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useProject } from "./ProjectContext";
import StepButtons from "./StepButton";
import "./testscenario.css";

type GeneratedCode = {
  scenarioId: string | null;
  title?: string;
  code?: string | null;
  error?: string | null;
};

const API_BASE =
  import.meta.env.VITE_API_BASE || "https://exacoda-qai-q8up.onrender.com";

export default function TestRunPage(): JSX.Element {
  const location = useLocation() as any;
const state = location.state || {};
  const navigate = useNavigate();
  const params = useParams<{ id?: string }>();
  const routeProjectId = params?.id ?? null;

  const projectCtx = (useProject() as any) || {};
  const ctxConfig = projectCtx.testRunConfig || projectCtx.test_run_config || projectCtx.testRun || null;

  const [results, setResults] = useState<any[] | null>(null);
  const [running, setRunning] = useState<boolean>(false);
  const [runError, setRunError] = useState<string | null>(null);

  // codes can come via navigation state or context
  const codesFromState: GeneratedCode[] | undefined = location.state?.codes;
  const frameworkFromState: string | undefined = location.state?.framework;
  const languageFromState: string | undefined = location.state?.language;
  const testCasesFromState = location.state?.testCases;
  
  // get codes from context if present
  const ctxCodes: GeneratedCode[] | undefined =
    ctxConfig && Array.isArray((ctxConfig as any).codes) ? (ctxConfig as any).codes : undefined;

  // Prefer navigation state codes, then context codes, else empty array
  
const codes: GeneratedCode[] = state.codes ?? ctxCodes ?? [];

const hasCodes = codes.length > 0 && codes.some(c => c.code);

  // Prefer framework/lang from state, then from context, then fallback defaults
  const framework =
    frameworkFromState ?? (ctxConfig && (ctxConfig.framework || ctxConfig.frameworkName)) ?? "JUnit";
  const language =
    languageFromState ?? (ctxConfig && (ctxConfig.language || ctxConfig.lang)) ?? "Java";

  // project id resolution (route param preferred)
  const projectId: string | null =
    routeProjectId ||
    projectCtx?.currentProjectId ||
    projectCtx?.projectId ||
    (ctxConfig && (ctxConfig.projectId || ctxConfig._id)) ||
    null;

  // COPY / DOWNLOAD helpers
  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      alert("Copied to clipboard");
    } catch {
      alert("Copy failed");
    }
  }

  function downloadCode(filename: string, content: string) {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // optional: run tests by posting to backend run endpoint (it returns mock results in backend)
  async function runTests() {
    setRunError(null);
    setResults(null);
    if (!projectId) {
      setRunError("Project ID not found. Cannot run tests.");
      return;
    }

    setRunning(true);
    try {
      const payload: any = {
        framework,
        language,
        scenarios: testCasesFromState ?? (ctxConfig && ctxConfig.testCases ? ctxConfig.testCases : []),
        code: codes,
      };

      const res = await fetch(`${API_BASE}/api/projects/${projectId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setRunError(data?.message || data?.error || "Run failed");
      } else {
        setResults(data?.results ?? data);
      }
    } catch (err: any) {
      setRunError(String(err?.message || err) || "Unexpected error running tests");
    } finally {
      setRunning(false);
    }
  }

  // If there are no codes, we do NOT auto-redirect. We show a friendly message and a button
  // so the user can go back to Test Cases and regenerate/generate the code.
  const noCodes = !codes || codes.length === 0;

  return (
    <div className="project-page test-scenarios-root" style={{ minHeight: "100vh" }}>
      {/* Topbar */}
      <div className="topbar">
        <Link to="/dashboard">← Back to Projects</Link>
        <div className="topbar-actions">
          <button type="button">Settings</button>
          <button type="button" onClick={() => (window.location.href = "/login")}>
            Logout
          </button>
        </div>
      </div>

      {/* Header */}
      <div className="project-header" style={{ paddingTop: 12 }}>
        <h2 style={{ marginTop: 8 }}>
          {projectCtx?.currentProjectName || (ctxConfig && ctxConfig.projectName) || "Project"}
        </h2>
        <p className="muted" style={{ marginTop: 4 }}>
          {ctxConfig?.description || "Run generated tests"}
        </p>

        <div style={{ marginTop: 14, display: "flex", justifyContent: "center" }}>
          <StepButtons />
        </div>
      </div>

         <div style={{ height: "40px" }} />

      <div style={{ padding: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: 14 }}>
            <strong>Framework:</strong> {framework} &nbsp; • &nbsp;
            <strong>Language:</strong> {language} &nbsp; • &nbsp;
            <strong>Scenarios:</strong> { (testCasesFromState && testCasesFromState.length) || (ctxConfig && ctxConfig.testCases && ctxConfig.testCases.length) || 0 }
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" onClick={() => navigate(projectId ? `/project/${projectId}/testcases` : "/dashboard")}>Back</button>
            <button className="btn btn-primary" onClick={runTests} disabled={running || noCodes}>
              {running ? "Running…" : "Run tests"}
            </button>
          </div>
        </div>

        {/* Codes display */}
        <div style={{ marginTop: 18 }}>
          {noCodes ? (
            <div style={{ padding: 18 }}>
              <p style={{ color: "#666" }}>
                No generated code found. Please go back to Test Cases and click <strong>Next</strong> to generate.
              </p>

              <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                <button
                  className="btn"
                  onClick={() => navigate(projectId ? `/project/${projectId}/testcases` : "/dashboard")}
                >
                  Back to Test Cases
                </button>

                <button
                  className="btn"
                  onClick={() =>
                    // if projectId present, go to testcases page; otherwise go to dashboard
                    navigate(projectId ? `/project/${projectId}/testcases` : "/dashboard")
                  }
                >
                  Upload Docs / Start Flow
                </button>
              </div>
            </div>
          ) : (
            codes.map((g: GeneratedCode, i: number) => (
              <div key={i} style={{ marginBottom: 18, border: "1px solid #e6e6e6", borderRadius: 8, overflow: "hidden" }}>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 12px", background: "#fafafa", borderBottom: "1px solid #eee" }}>
                  <div style={{ fontWeight: 600 }}>{g.title || `Scenario ${i + 1}`}</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn" onClick={() => copyToClipboard(String(g.code ?? ""))}>Copy</button>
                    <button
                      className="btn"
                      disabled={!hasCodes}
                      onClick={() => {
                        const fnameBase = (g.title || `scenario-${i + 1}`).replace(/\s+/g, "-").toLowerCase();
                        const extMap: Record<string,string> = { Java: "java", TypeScript: "ts", JavaScript: "js", Python: "py", "C#": "cs" };
                        const ext = extMap[language] || "txt";
                        downloadCode(`${fnameBase}.${ext}`, String(g.code ?? ""));
                      }}
                    >
                      Download
                    </button>
                  </div>
                </div>

                <pre style={{ whiteSpace: "pre-wrap", padding: 12, margin: 0, background: "#fff" }}>
                  {g.error ? <span style={{ color: "crimson" }}>Error: {g.error}</span> : (g.code || "No code returned")}
                </pre>
              </div>
            ))
          )}
        </div>

        {/* Run results */}
        {runError && <div style={{ color: "crimson", marginTop: 12 }}>{runError}</div>}
        {results && (
          <div style={{ marginTop: 12 }}>
            <h4>Run Results</h4>
            <div>
              {results.map((r: any, i: number) => (
                <div key={i} style={{ padding: 8, borderBottom: "1px solid #eee" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <div style={{ fontWeight: 600 }}>{r.title}</div>
                    <div>{r.passed ? "Passed" : "Failed"} • {r.durationMs}ms</div>
                  </div>
                  <div style={{ color: "#666", marginTop: 6 }}>{r.details}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{ height: 40 }} />
    </div>
  );
}
