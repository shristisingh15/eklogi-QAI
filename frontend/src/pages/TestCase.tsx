// frontend/src/pages/TestCases.tsx
import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useProject } from "./ProjectContext";
import StepButtons from "./StepButton";
import "./testscenario.css";

type TestCase = {
  title?: string;
  preconditions?: string[];
  steps?: string[];
  expected_result?: string;
  type?: string;
  scenarioIndex?: number;
  scenarioId?: string | null;       // 👈 add this
  scenarioTitle?: string;           // 👈 add this
  _id?: string;
  [k: string]: any;
};


type GeneratedCode = {
  scenarioId: string | null;
  title?: string;
  code?: string | null;
  error?: string | null;
};

const API_BASE =
  import.meta.env.VITE_API_BASE || "https://exacoda-qai-q8up.onrender.com";

const FRAMEWORK_OPTIONS = ["JUnit", "Selenium", "Mocha", "Jest", "PyTest"];
const LANGUAGE_OPTIONS = ["Java", "TypeScript", "JavaScript", "Python", "C#"];

export default function TestCasesPage(): JSX.Element {
  const [filterType, setFilterType] = useState<string>("All");
  const location = useLocation() as any;
  const navigate = useNavigate();
  const params = useParams<{ id?: string }>();
  const routeProjectId = params?.id ?? null;

  const projectCtx = (useProject() as any) || {};
  const { setTestRunConfig } = projectCtx || {};

  const ctxConfig =
    projectCtx.testRunConfig ||
    projectCtx.test_run_config ||
    projectCtx.testRun ||
    projectCtx.runConfig ||
    projectCtx.testConfig ||
    null;

  const state = location.state || {};
  const stateTestCases: TestCase[] | undefined = state.testCases;
  const stateRaw: string | undefined = state.raw;
  const stateScenario: any = state.scenario;

  const testCasesFromCtx: TestCase[] | undefined =
    (ctxConfig && ctxConfig.testCases) || (ctxConfig && ctxConfig.testcases) || undefined;

  const rawFromCtx: string | undefined =
    (ctxConfig && ctxConfig.raw) || (ctxConfig && ctxConfig.rawOutput) || undefined;

  const testCases: TestCase[] = testCasesFromCtx ?? stateTestCases ?? [];
  const raw: string = (testCases.length === 0 ? (stateRaw ?? rawFromCtx ?? "") : (stateRaw ?? rawFromCtx ?? ""));

  const projectDisplayName =
    (projectCtx && (projectCtx.currentProjectName || projectCtx.projectName || projectCtx.name)) ||
    (ctxConfig && (ctxConfig.projectName || ctxConfig.name)) ||
    "";

  const projectSubtitle = (projectCtx && projectCtx.project?.description) || "";

  const initialFramework = (ctxConfig && (ctxConfig.framework || ctxConfig.frameworkName)) || "JUnit";
  const initialLanguage = (ctxConfig && (ctxConfig.language || ctxConfig.lang)) || "Java";

  const [framework, setFramework] = useState<string>(initialFramework);
  const [language, setLanguage] = useState<string>(initialLanguage);

  const initialSelection = useMemo(() => {
    const m: Record<number, boolean> = {};
    for (let i = 0; i < testCases.length; i++) m[i] = true;
    return m;
  }, [testCases.length]);

  const [selectedMap, setSelectedMap] = useState<Record<number, boolean>>(initialSelection);
  const [selectAllChecked, setSelectAllChecked] = useState<boolean>(
    Object.values(initialSelection).length > 0 && Object.values(initialSelection).every(Boolean)
  );

  const [generating, setGenerating] = useState<boolean>(false);
  const [genError, setGenError] = useState<string | null>(null);

  // prefer route param, fallback to context/config/state
  const projectId: string | null =
    routeProjectId ||
    projectCtx?.currentProjectId ||
    projectCtx?.projectId ||
    (ctxConfig && (ctxConfig.projectId || ctxConfig._id)) ||
    (state && state.projectId) ||
    null;

    // Safe sync of framework/language into context:
  // Only call setTestRunConfig when framework or language have actually changed
  // compared to the last values we pushed — prevents infinite update loops.
  const lastPushedRef = React.useRef<{ framework?: string; language?: string }>({
    framework: initialFramework,
    language: initialLanguage,
  });

  useEffect(() => {
    if (typeof setTestRunConfig !== "function") return;

    const last = lastPushedRef.current;
    if (last.framework === framework && last.language === language) {
      // nothing changed since last push, avoid calling setter
      return;
    }

    // update last pushed values first to avoid races
    lastPushedRef.current = { framework, language };

    try {
      // merge with existing ctxConfig if present — but avoid passing an always-new object
      // when ctxConfig already matches values (small guard)
      const shouldPatch =
        !(ctxConfig && ctxConfig.framework === framework && ctxConfig.language === language);

      if (shouldPatch) {
        const newCfg = {
          ...(ctxConfig || {}),
          framework,
          language,
        };
        setTestRunConfig(newCfg);
      }
    } catch (err) {
      // swallow to avoid breaking rendering
      // eslint-disable-next-line no-console
      console.warn("setTestRunConfig failed:", err);
    }
    // we intentionally include ctxConfig and setTestRunConfig in deps to be safe
  }, [framework, language, ctxConfig, setTestRunConfig, initialFramework, initialLanguage]);


  useEffect(() => {
    const m: Record<number, boolean> = {};
    for (let i = 0; i < testCases.length; i++) m[i] = true;
    setSelectedMap(m);
    setSelectAllChecked(Object.values(m).every(Boolean) && Object.values(m).length > 0);
  }, [testCases]);

  function toggleSelect(idx: number) {
    setSelectedMap((prev) => {
      const next = { ...prev, [idx]: !prev[idx] };
      setSelectAllChecked(Object.values(next).every(Boolean) && Object.values(next).length > 0);
      return next;
    });
  }

  function handleToggleSelectAllCheckbox(checked: boolean) {
    const next: Record<number, boolean> = {};
    for (let i = 0; i < testCases.length; i++) next[i] = checked;
    setSelectedMap(next);
    setSelectAllChecked(checked);
  }

  function handleSelectAllButton() {
    const allSelected = Object.values(selectedMap).length > 0 && Object.values(selectedMap).every(Boolean);
    handleToggleSelectAllCheckbox(!allSelected);
  }

  const selectedCount = Object.values(selectedMap).filter(Boolean).length;
  const isNextEnabled = Boolean(framework && language && selectedCount > 0);

  function stripFencedCode(s: string | undefined | null) {
    if (!s) return "";
    return s.replace(/^\s*```[a-zA-Z0-9-]*\n?/, "").replace(/\n?```\s*$/, "");
  }

  // generate tests on backend and navigate to run page with codes in state & context
  const handleGenerateAndGo = async () => {
    setGenError(null);
    if (!isNextEnabled) return;
    if (!projectId) {
      setGenError("Project ID not found. Cannot generate tests.");
      return;
    }

    setGenerating(true);

    const selectedCases = testCases.filter((_, idx) => selectedMap[idx]);

    try {
      const payload = {
        framework,
        language,
        scenarios: selectedCases,
        uploadedFiles: projectCtx.uploadedFiles || ctxConfig?.uploadedFiles || [],
      };

      const res = await fetch(`${API_BASE}/api/projects/${projectId}/generate-tests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setGenError(data?.message || data?.error || "Failed to generate tests");
        setGenerating(false);
        return;
      }

      const codesArr: GeneratedCode[] = Array.isArray(data?.codes) ? data.codes : [];

      const normalized = codesArr.map((c) => ({
        scenarioId: c?.scenarioId ?? null,
        title: c?.title ?? "",
        code: c?.code ? stripFencedCode(String(c.code)) : null,
        error: c?.error ?? null,
      }));

      // persist into context
      if (typeof setTestRunConfig === "function") {
        try {
          setTestRunConfig({
            ...(ctxConfig || {}),
            framework,
            language,
            testCases: selectedCases,
            codes: normalized,
          });
        } catch {}
      }

      // navigate to run page with generated codes in state
      navigate(`/project/${projectId}/test`, {
        state: { framework, language, testCases: selectedCases, codes: normalized },
      });
    } catch (err: any) {
      setGenError(String(err?.message || err) || "Unexpected error generating tests");
    } finally {
      setGenerating(false);
    }
  };

  // handleNext simply triggers generation + navigation
  const handleNext = () => {
    handleGenerateAndGo();
  };

  const handleBack = () => navigate(-1);

  const groupedByScenario = useMemo(() => {
  const map: Record<string, TestCase[]> = {};
  testCases.forEach((tc) => {
    const key = tc.scenarioTitle || "Unassigned";
    if (!map[key]) map[key] = [];
    map[key].push(tc);
  });
  return map;
}, [testCases]);

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
        <Link to="/dashboard" style={{ textDecoration: "none", color: "#2b6cb0" }}>
          ← Back to Projects
        </Link>

        <h2 style={{ marginTop: 8 }}>{projectDisplayName || "demo v0.1"}</h2>
        <p className="muted" style={{ marginTop: 4 }}>{projectSubtitle || "testing after deploying"}</p>

        <div style={{ marginTop: 14, display: "flex", justifyContent: "center" }}>
          <StepButtons />
        </div>
      </div>

         <div style={{ height: "40px" }} />

      {/* Controls */}
      <div className="controls-row" style={{ alignItems: "center" }}>
        <button className="scenario-btn disabled-btn" disabled>
          ＋ New Scenario
        </button>
        <button className="scenario-btn disabled-btn" disabled>
          Bulk Actions
        </button>

        <div style={{ marginLeft: "auto", display: "flex", gap: 12, alignItems: "center" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, marginRight: 8 }}>Framework</span>
            <select
              value={framework}
              onChange={(e) => setFramework(e.target.value)}
              style={{ padding: "10px 12px", minWidth: 180, borderRadius: 8, fontSize: 14 }}
            >
              {FRAMEWORK_OPTIONS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, marginRight: 8 }}>Language</span>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              style={{ padding: "10px 12px", minWidth: 160, borderRadius: 8, fontSize: 14 }}
            >
              {LANGUAGE_OPTIONS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={selectAllChecked}
              onChange={(e) => handleToggleSelectAllCheckbox(e.target.checked)}
            />
            <span style={{ fontSize: 13 }}>Select all</span>
          </label>

          <button className="btn" onClick={handleSelectAllButton} style={{ padding: "8px 12px", borderRadius: 8 }}>
            {selectedCount === testCases.length && testCases.length > 0 ? "Clear all" : "Select all"}
          </button>

          <div style={{ minWidth: 140 }}>
            <button
              className="btn btn-primary"
              onClick={handleNext}
              disabled={!isNextEnabled || generating}
              style={{
                padding: "10px 16px",
                borderRadius: 8,
                fontSize: 15,
                cursor: !isNextEnabled || generating ? "not-allowed" : "pointer",
                opacity: !isNextEnabled || generating ? 0.6 : 1,
              }}
            >
              {generating ? "Generating…" : "Next →"}
            </button>
          </div>

          <div style={{ color: "#666", fontSize: 13 }}>{selectedCount} selected</div>
        </div>
      </div>

      {/* Tiles Section */}
      <div className="tiles-section" style={{ marginTop: 18 }}>
        <h3 className="tiles-section-title">Test Cases</h3>
        <div className="tiles-grid" style={{ marginTop: 8 }}>
          {testCases.length === 0 ? (
            <div style={{ padding: 18 }}>
              <p>No parsed test cases found in the response.</p>
              {raw ? (
                <details>
                  <summary>Show raw AI output</summary>
                  <pre style={{ whiteSpace: "pre-wrap", padding: 12, background: "#f7f7f7" }}>{raw}</pre>
                </details>
              ) : (
                <p style={{ color: "#666" }}>
                  The backend did not return structured test cases. Try regenerating or check server logs.
                </p>
              )}
              <div style={{ marginTop: 12 }}>
                <button className="btn" onClick={handleBack}>
                  Back and retry
                </button>
              </div>
            </div>
          ) : (
            Object.entries(groupedByScenario).map(([scenarioName, cases]) => (
  <div key={scenarioName} style={{ marginBottom: 32 }}>
    <h3 style={{ color: "#0b74ff", marginBottom: 12 }}>
      Scenario: {scenarioName}
    </h3>
    <div className="tiles-grid">
      {cases.map((tc, idx) => (
        <article key={tc._id || idx} className="tile-card" style={{ position: "relative" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <label style={{ marginTop: 4 }}>
              <input
                type="checkbox"
                checked={!!selectedMap[idx]}
                onChange={() => toggleSelect(idx)}
                style={{ width: 16, height: 16 }}
              />
            </label>

            <div style={{ flex: 1 }}>
              <h3 className="tile-title" style={{ marginTop: 0, marginBottom: 6 }}>
                {tc.title || `Test Case`}
              </h3>

              {tc.type && <div style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>{tc.type}</div>}

              {tc.preconditions && tc.preconditions.length > 0 && (
                <div style={{ marginBottom: 6 }}>
                  <strong>Preconditions:</strong>
                  <ul style={{ marginTop: 6 }}>
                    {tc.preconditions.map((p: string, i: number) => (
                      <li key={i} style={{ fontSize: 13 }}>{p}</li>
                    ))}
                  </ul>
                </div>
              )}

              {tc.steps && tc.steps.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <ol className="tile-steps">
                    {tc.steps.map((s: string, i: number) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ol>
                </div>
              )}

              {tc.expected_result && (
                <div style={{ marginTop: 6 }}>
                  <strong>Expected:</strong> <span>{tc.expected_result}</span>
                </div>
              )}
            </div>
          </div>
        </article>
      ))}
    </div>
  </div>
)))}

        </div>
      </div>

      {/* generation error */}
      {genError && (
        <div style={{ marginTop: 12, padding: 12 }}>
          <div style={{ color: "crimson" }}>{genError}</div>
        </div>
      )}

      <div style={{ height: 40 }} />
    </div>
  );
}
