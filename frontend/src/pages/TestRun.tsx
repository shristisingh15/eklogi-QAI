// frontend/src/pages/TestRun.tsx
import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useProject } from "./ProjectContext";
import StepButtons from "./StepButton";
import SourceFileInfo from "./SourceFileInfo";
import "./testscenario.css";

type GeneratedCode = {
  scenarioId: string | null;
  testCaseId?: string | null;
  testCaseTitle?: string;
  scenarioTitle?: string;
  title?: string;
  code?: string | null;
  error?: string | null;
};

const API_BASE =
  import.meta.env.VITE_API_BASE || "http://localhost:5004";

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
  const [expandedBp, setExpandedBp] = useState<Record<string, boolean>>({});
  const [expandedScenario, setExpandedScenario] = useState<Record<string, boolean>>({});
  const [expandedCase, setExpandedCase] = useState<Record<string, boolean>>({});
  const [bpSortRank, setBpSortRank] = useState<Record<string, number>>({});

  const priorityRank: Record<string, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };

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
  const selectedCases = testCasesFromState ?? (ctxConfig && ctxConfig.testCases ? ctxConfig.testCases : []) ?? [];

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

  const hierarchy = React.useMemo(() => {
    const byId = new Map<string, any>();
    const byTitle = new Map<string, any>();
    for (const tc of selectedCases || []) {
      const id = String(tc?._id || "").trim();
      const title = String(tc?.title || "").trim().toLowerCase();
      if (id) byId.set(id, tc);
      if (title) byTitle.set(title, tc);
    }

    const grouped: Record<string, Record<string, Record<string, GeneratedCode[]>>> = {};
    for (let i = 0; i < codes.length; i++) {
      const g = codes[i];
      const codeCaseId = String(g?.testCaseId || g?.scenarioId || "").trim();
      const codeTitle = String(g?.testCaseTitle || g?.title || "").trim();
      const meta = (codeCaseId && byId.get(codeCaseId)) || byTitle.get(codeTitle.toLowerCase()) || null;

      const bpName =
        String(meta?.businessProcessName || "Unassigned Business Process");
      const scenarioName =
        String(meta?.scenarioTitle || g?.scenarioTitle || "Unassigned Scenario");
      const testCaseName =
        codeTitle || String(meta?.title || `Test Case ${i + 1}`);

      if (!grouped[bpName]) grouped[bpName] = {};
      if (!grouped[bpName][scenarioName]) grouped[bpName][scenarioName] = {};
      if (!grouped[bpName][scenarioName][testCaseName]) grouped[bpName][scenarioName][testCaseName] = [];
      grouped[bpName][scenarioName][testCaseName].push(g);
    }

    return grouped;
  }, [codes, selectedCases]);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    (async () => {
      const endpoints = [
        `${API_BASE}/api/business/selected/${projectId}`,
        `${API_BASE}/api/business/matched/${projectId}`,
      ];
      for (const ep of endpoints) {
        try {
          const res = await fetch(ep);
          if (!res.ok) continue;
          const json = await res.json();
          const arr = Array.isArray(json?.items) ? json.items : Array.isArray(json) ? json : [];
          if (!Array.isArray(arr) || arr.length === 0) continue;

          const rankMap: Record<string, number> = {};
          arr.forEach((bp: any) => {
            const rank = priorityRank[String(bp?.priority || "medium").toLowerCase()] ?? 99;
            const idKey = String(bp?._id || "").trim();
            const nameKey = String(bp?.name || "").trim().toLowerCase();
            if (idKey) rankMap[idKey] = rank;
            if (nameKey) rankMap[nameKey] = rank;
          });
          if (!cancelled) setBpSortRank(rankMap);
          return;
        } catch {
          continue;
        }
      }
      if (!cancelled) setBpSortRank({});
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const hierarchyEntries = React.useMemo(() => {
    return Object.entries(hierarchy).sort(([aName, aScenarios], [bName, bScenarios]) => {
      const aFirstCode = Object.values(aScenarios || {})[0];
      const bFirstCode = Object.values(bScenarios || {})[0];
      const aFirstCase = (aFirstCode && Object.values(aFirstCode)[0]?.[0]) as any;
      const bFirstCase = (bFirstCode && Object.values(bFirstCode)[0]?.[0]) as any;

      const aRank =
        bpSortRank[String(aFirstCase?.businessProcessId || "").trim()] ??
        bpSortRank[aName.trim().toLowerCase()] ??
        99;
      const bRank =
        bpSortRank[String(bFirstCase?.businessProcessId || "").trim()] ??
        bpSortRank[bName.trim().toLowerCase()] ??
        99;
      if (aRank !== bRank) return aRank - bRank;
      return aName.localeCompare(bName);
    });
  }, [hierarchy, bpSortRank]);

  useEffect(() => {
    const nextBp: Record<string, boolean> = {};
    const nextScenario: Record<string, boolean> = {};
    const nextCase: Record<string, boolean> = {};
    hierarchyEntries.forEach(([bpName, scenarios]) => {
      nextBp[bpName] = expandedBp[bpName] ?? true;
      Object.entries(scenarios).forEach(([scenarioName, cases]) => {
        const scenarioKey = `${bpName}__${scenarioName}`;
        nextScenario[scenarioKey] = expandedScenario[scenarioKey] ?? true;
        Object.keys(cases).forEach((testCaseName) => {
          const caseKey = `${scenarioKey}__${testCaseName}`;
          nextCase[caseKey] = expandedCase[caseKey] ?? true;
        });
      });
    });
    setExpandedBp(nextBp);
    setExpandedScenario(nextScenario);
    setExpandedCase(nextCase);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hierarchyEntries.map(([name]) => name).join("|")]);

  return (
    <div className="project-page test-scenarios-root" style={{ minHeight: "100vh" }}>
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

        <SourceFileInfo projectId={projectId} />
      </div>

         <div style={{ height: "40px" }} />

      <div style={{ padding: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: 14 }}>
            <strong>Framework:</strong> {framework} &nbsp; • &nbsp;
            <strong>Language:</strong> {language} &nbsp; • &nbsp;
            <strong>Selected Cases:</strong> { (testCasesFromState && testCasesFromState.length) || (ctxConfig && ctxConfig.testCases && ctxConfig.testCases.length) || 0 }
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" onClick={() => navigate(projectId ? `/project/${projectId}/testcases` : "/dashboard")}>Back</button>
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
            hierarchyEntries.map(([bpName, scenarios], bpIndex) => (
              <div key={bpName} style={{ marginBottom: 20 }}>
                <button
                  type="button"
                  className="bp-dropdown-toggle"
                  onClick={() => setExpandedBp((p) => ({ ...p, [bpName]: !p[bpName] }))}
                >
                  <span className="bp-dropdown-title">{bpIndex + 1}. Business Process: {bpName}</span>
                  <span className="bp-dropdown-caret">{expandedBp[bpName] ? "▲" : "▼"}</span>
                </button>

                {expandedBp[bpName] && (
                  <div style={{ marginTop: 10, paddingLeft: 8 }}>
                    {Object.entries(scenarios).map(([scenarioName, testCases], scenarioIndex) => {
                      const scenarioKey = `${bpName}__${scenarioName}`;
                      return (
                        <div key={scenarioKey} style={{ marginBottom: 10 }}>
                          <button
                            type="button"
                            className="scenario-dropdown-toggle"
                            onClick={() =>
                              setExpandedScenario((p) => ({ ...p, [scenarioKey]: !p[scenarioKey] }))
                            }
                          >
                            <span>Test Scenario {scenarioIndex + 1}: {scenarioName}</span>
                            <span>{expandedScenario[scenarioKey] ? "▲" : "▼"}</span>
                          </button>

                          {expandedScenario[scenarioKey] && (
                            <div style={{ marginTop: 8, paddingLeft: 8 }}>
                              {Object.entries(testCases).map(([testCaseName, entries]) => {
                                const caseKey = `${scenarioKey}__${testCaseName}`;
                                return (
                                  <div key={caseKey} className="testcase-item">
                                    <button
                                      type="button"
                                      className="testcase-list-row"
                                      onClick={() =>
                                        setExpandedCase((p) => ({ ...p, [caseKey]: !p[caseKey] }))
                                      }
                                    >
                                      <span>Test Case: {testCaseName}</span>
                                      <span className="testcase-row-caret">{expandedCase[caseKey] ? "▲" : "▼"}</span>
                                    </button>

                                    {expandedCase[caseKey] && (
                                      <div className="testcase-code-panel">
                                        {entries.map((g, i) => (
                                          <div key={`${caseKey}-${i}`} className="testcase-code-entry">
                                            <div className="testcase-code-head">
                                              <div style={{ fontWeight: 600 }}>Generated Code Entry {i + 1}</div>
                                              <div style={{ display: "flex", gap: 8 }}>
                                                <button className="btn" onClick={() => copyToClipboard(String(g.code ?? ""))}>
                                                  Copy
                                                </button>
                                                <button
                                                  className="btn"
                                                  disabled={!hasCodes}
                                                  onClick={() => {
                                                    const fnameBase = (g.testCaseTitle || g.title || `test-case-${i + 1}`)
                                                      .replace(/\s+/g, "-")
                                                      .toLowerCase();
                                                    const extMap: Record<string, string> = {
                                                      Java: "java",
                                                      TypeScript: "ts",
                                                      JavaScript: "js",
                                                      Python: "py",
                                                      "C#": "cs",
                                                    };
                                                    const ext = extMap[language] || "txt";
                                                    downloadCode(`${fnameBase}.${ext}`, String(g.code ?? ""));
                                                  }}
                                                >
                                                  Download
                                                </button>
                                              </div>
                                            </div>
                                            <pre className="testcase-code-body">
                                              {g.error ? (
                                                <span style={{ color: "crimson" }}>Error: {g.error}</span>
                                              ) : (
                                                g.code || "No code returned"
                                              )}
                                            </pre>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
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
