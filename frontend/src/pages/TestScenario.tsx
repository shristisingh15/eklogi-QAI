// frontend/src/pages/TestScenarios.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import StepButtons from "./StepButton";
import { useProject, Scenario } from "./ProjectContext"; // ✅ use context
import "./testscenario.css";
import { FaSpinner } from "react-icons/fa";


const API_BASE =
  import.meta.env.VITE_API_BASE || "https://exacoda-qai-q8up.onrender.com";

type ProjectDetails = {
  _id?: string;
  name?: string;
  description?: string;
  [k: string]: any;
};

export default function TestScenariosPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const {
    setScenarios: setCtxScenarios,
    selectScenario,
    setTestRunConfig,
    uploadedFiles,
  } = useProject();

  const [projectDetails, setProjectDetails] =
    useState<ProjectDetails | null>(null);
  const [loadingProject, setLoadingProject] = useState(false);
  const [projectErr, setProjectErr] = useState<string | null>(null);

  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loadingScenarios, setLoadingScenarios] = useState(false);
  const [scenariosErr, setScenariosErr] = useState<string | null>(null);

  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [showPrev, setShowPrev] = useState<boolean>(false);
const [generating, setGenerating] = useState<boolean>(false);


  // fetch project meta
  useEffect(() => {
    if (!id) return;
    const ac = new AbortController();
    (async () => {
      setLoadingProject(true);
      setProjectErr(null);
      try {
        const res = await fetch(`${API_BASE}/api/projects/${id}`, {
          signal: ac.signal,
        });
        if (!res.ok) {
          const t = await res.text().catch(() => "");
          throw new Error(`HTTP ${res.status} ${t}`);
        }
        const json = await res.json();
        setProjectDetails(json || null);
      } catch (e: any) {
        if (e?.name !== "AbortError")
          setProjectErr(e.message || "Failed to load project");
      } finally {
        setLoadingProject(false);
      }
    })();
    return () => ac.abort();
  }, [id]);

  // fetch scenarios
  useEffect(() => {
    if (!id) return;
    const ac = new AbortController();
    (async () => {
      setLoadingScenarios(true);
      setScenariosErr(null);
      try {
        const res = await fetch(
          `${API_BASE}/api/projects/${id}/scenarios`,
          { signal: ac.signal }
        );
        if (!res.ok) {
          if (res.status === 404) {
            setScenarios([]);
            setLoadingScenarios(false);
            return;
          }
          const t = await res.text().catch(() => "");
          throw new Error(`HTTP ${res.status} ${t}`);
        }
        const json = await res.json();
        const list: Scenario[] = Array.isArray(json) ? json : json?.items ?? [];
        setScenarios(list);

        // init selected map
        const map: Record<string, boolean> = {};
        list.forEach((s) => (map[s._id!] = false));
        setSelected(map);
      } catch (e: any) {
        if (e?.name !== "AbortError")
          setScenariosErr(e.message || "Failed to load scenarios");
      } finally {
        setLoadingScenarios(false);
      }
    })();
    return () => ac.abort();
  }, [id]);

  // selection helpers
  const toggleSelect = (sid: string) =>
    setSelected((prev) => ({ ...prev, [sid]: !prev[sid] }));
  const allSelected =
    scenarios.length > 0 && scenarios.every((s) => selected[s._id!]);
  const anySelected = Object.values(selected).some(Boolean);
  const toggleSelectAll = () => {
    if (allSelected) {
      const cleared: Record<string, boolean> = {};
      scenarios.forEach((s) => (cleared[s._id!] = false));
      setSelected(cleared);
    } else {
      const all: Record<string, boolean> = {};
      scenarios.forEach((s) => (all[s._id!] = true));
      setSelected(all);
    }
  };

  // Next button → send selected scenarios to backend & navigate
  const handleNext = async () => {
  if (!id) return;
  if (generating) return; // prevent double-clicks

  const chosen = scenarios.filter((s) => selected[s._id!]);

  if (chosen.length === 0) {
    alert("Please select at least one test scenario.");
    return;
  }

  setGenerating(true);
    try {
      const res = await fetch(`${API_BASE}/api/projects/${id}/generate-tests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          framework: "JUnit", // default
          language: "Java",
          scenarios: chosen,
          uploadedFiles,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        console.error("Generate-tests failed:", data);
        alert(data?.message || data?.error || "Failed to generate tests");
        setGenerating(false);
        return;
      }

      // save config into context
      const configObj: any = {
        framework: "JUnit",
        language: "Java",
        scenarios: chosen,
        uploadedFiles: uploadedFiles || [],
        // preserve any code fields you already used
        ...(data.codes ? { codes: data.codes } : {}),
        ...(data.code ? { code: data.code } : {}),
        // --- NEW, minimal additions to keep test cases returned by the backend ---
        ...(data.testCases ? { testCases: data.testCases } : {}),
        ...(data.raw ? { raw: data.raw } : {}),
      };

      if (typeof setTestRunConfig === "function") {
        setTestRunConfig(configObj);
      }

      // also keep them in context for later pages
      setCtxScenarios(chosen);
      selectScenario(chosen[0]);

      navigate(`/project/${id}/testcases`);
    } catch (err: any) {
      console.error("handleNext error:", err);
      alert("Unexpected error generating test cases.");
       setGenerating(false);
    }
  };

  // ------------- Partition into recent vs previous -------------
  function scenarioTimestamp(s: Scenario): number {
    const candidates = [(s as any).createdAt, (s as any).uploadedAt];
    for (const c of candidates) {
      if (typeof c === "string") {
        const t = Date.parse(c);
        if (!isNaN(t)) return t;
      }
    }
    if (s._id && typeof s._id === "string" && s._id.length >= 8) {
      const ts = parseInt(s._id.slice(0, 8), 16) * 1000;
      if (!isNaN(ts)) return ts;
    }
    return 0;
  }

  const { recentScenarios, previousScenarios } = useMemo(() => {
    if (!scenarios || scenarios.length === 0) {
      return { recentScenarios: [], previousScenarios: [] };
    }
    const sorted = [...scenarios].sort(
      (a, b) => scenarioTimestamp(b) - scenarioTimestamp(a)
    );
    const newestTs = scenarioTimestamp(sorted[0]);
    if (!newestTs) return { recentScenarios: sorted, previousScenarios: [] };

    const BATCH_WINDOW_MS = 5 * 60 * 1000; // 5 min window
    const recent: Scenario[] = [];
    const prev: Scenario[] = [];
    sorted.forEach((s) => {
      const ts = scenarioTimestamp(s);
      if (Math.abs(ts - newestTs) <= BATCH_WINDOW_MS) {
        recent.push(s);
      } else {
        prev.push(s);
      }
    });
    return { recentScenarios: recent, previousScenarios: prev };
  }, [scenarios]);

  // 🔹 Group scenarios by business process
const groupedByBP = useMemo(() => {
  // map: bpKey -> { name, scenarios: Map<scenarioId, scenario> }
  const bpMap = new Map<string, { name: string; scenarios: Map<string, any> }>();

  for (const s of scenarios) {
    // derive a stable bp key (use id if available, else fallback to name)
    const bpId = (s as any).businessProcessId ? String((s as any).businessProcessId) : null;
    const bpName = (s as any).businessProcessName || "Unassigned";
    const bpKey = bpId || bpName;

    if (!bpMap.has(bpKey)) {
      bpMap.set(bpKey, { name: bpName, scenarios: new Map() });
    }

    const bucket = bpMap.get(bpKey)!;
    const sid = String(s._id || `${bpKey}-${Math.random()}`); // fallback unique key if _id missing

    // deduplicate by scenario id: only add if not present
    if (!bucket.scenarios.has(sid)) {
      bucket.scenarios.set(sid, s);
    }
  }

  // convert map -> plain object { bpName: scenarioArray }
  const result: Record<string, any[]> = {};
  for (const [bpKey, { name, scenarios: scenMap }] of bpMap.entries()) {
    result[name] = Array.from(scenMap.values());
  }
  return result;
}, [scenarios]);




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
      <div className="project-header">
        <h2>
          {projectDetails?.name ||
            (loadingProject ? "Loading…" : "Test Scenarios")}
        </h2>
        <p className="muted">
          {projectDetails?.description ||
            "Test scenarios for the selected project."}
        </p>
        {projectErr && <p style={{ color: "crimson" }}>{projectErr}</p>}
      </div>

      {/* Stepper */}
      <StepButtons />
      
         <div style={{ height: "40px" }} />

      {/* Controls */}
      <div className="controls-row">
        <button className="scenario-btn disabled-btn" disabled>
          ＋ New Scenario
        </button>
        <button className="scenario-btn disabled-btn" disabled>
          Bulk Actions
        </button>

        <div className="controls-right">
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />
            <span>Select all</span>
          </label>

          <div className="selected-counter">
            {anySelected
              ? `${Object.values(selected).filter(Boolean).length} selected`
              : "0 selected"}
          </div>

          <div style={{ marginLeft: 12 }}>
  
  <button
  className={`btn btn-primary ${generating ? "btn-generating" : ""}`}
  disabled={!anySelected || generating}
  onClick={() => {
    if (!anySelected) {
      alert("Please select at least one test scenario.");
      return;
    }
    handleNext();
  }}
  style={{
    display: "flex",
    alignItems: "center",
    gap: "8px",
    justifyContent: "center",
    fontWeight: "600",
  }}
>
  {generating ? (
    <>
      <FaSpinner className="spin-icon" />
      Generating…
    </>
  ) : (
    "Next →"
  )}
</button>


</div>

        </div>
      </div>

      {/* Scenarios grouped by Business Process */}
<div className="tiles-section">
  <h3 className="tiles-section-title">Generated Test Scenarios</h3>

  {Object.entries(groupedByBP).map(([bpName, bpScenarios]) => (
    <div key={bpName} style={{ marginBottom: 32 }}>
      <h3 style={{ marginBottom: 12, color: "#0b74ff" }}>
        Business Process: {bpName}
      </h3>

      <div className="tiles-grid">
        {bpScenarios.map((s, idx) => (
          <article key={s._id} className="tile-card">
            <div className="tile-header">
              <label className="tile-select">
                <input
                  type="checkbox"
                  checked={!!selected[s._id!]}
                  onChange={() => toggleSelect(s._id!)}
                />
              </label>
              <h3 className="tile-title">{idx + 1}. {s.title}</h3>
            </div>
            {s.description && <p className="tile-desc">{s.description}</p>}
            {s.steps && (
  <ol className="tile-steps">
    {s.steps.map((st: string, i: number) => (
      <li key={i}>{st}</li>
    ))}
  </ol>
)}

            {s.expected_result && (
              <div className="tile-expected">
                <strong>Expected:</strong> {s.expected_result}
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  ))}
</div>


      {/* Previous Scenarios */}
      {previousScenarios.length > 0 && (
        <div className="tiles-section" style={{ marginTop: 20 }}>
          <h3
            className="tiles-section-title expandable"
            onClick={() => setShowPrev((p) => !p)}
          >
            {showPrev
              ? `Hide Previous Scenarios ▲ (${previousScenarios.length})`
              : `Show Previous Scenarios ▼ (${previousScenarios.length})`}
          </h3>
          {showPrev && (
            <div className="tiles-grid">
              {previousScenarios.map((s, idx) => (
                <article key={s._id} className="tile-card">
                  <div className="tile-header">
                    <label className="tile-select">
                      <input
                        type="checkbox"
                        checked={!!selected[s._id!]}
                        onChange={() => toggleSelect(s._id!)}
                      />
                    </label>
                    <h3 className="tile-title">{idx + 1}. {s.title}</h3>
                  </div>
                  {s.description && <p className="tile-desc">{s.description}</p>}
                  {s.steps && (
                    <ol className="tile-steps">
                      {s.steps.map((st, i) => <li key={i}>{st}</li>)}
                    </ol>
                  )}
                  {s.expected_result && (
                    <div className="tile-expected">
                      <strong>Expected:</strong> {s.expected_result}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ height: 40 }} />
    </div>
  );
}
