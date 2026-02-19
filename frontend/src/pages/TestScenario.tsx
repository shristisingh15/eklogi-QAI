// frontend/src/pages/TestScenarios.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import StepButtons from "./StepButton";
import SourceFileInfo from "./SourceFileInfo";
import { useProject, Scenario } from "./ProjectContext"; // ✅ use context
import "./testscenario.css";
import { FaSpinner } from "react-icons/fa";


const API_BASE =
  import.meta.env.VITE_API_BASE || "http://localhost:5004";

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
const [generating, setGenerating] = useState<boolean>(false);
  const [expandedBp, setExpandedBp] = useState<Record<string, boolean>>({});
  const [activeDetailsScenario, setActiveDetailsScenario] = useState<any | null>(null);
  const [scenarioDetailsDraft, setScenarioDetailsDraft] = useState<Record<string, string>>({});
  const [savingScenarioDetails, setSavingScenarioDetails] = useState<boolean>(false);
  const [bpSortRank, setBpSortRank] = useState<Record<string, number>>({});

  const priorityRank: Record<string, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };


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

  // fetch business process priorities to keep scenario page ordering aligned
  // with Flow Analysis ordering.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      const endpoints = [
        `${API_BASE}/api/business/selected/${id}`,
        `${API_BASE}/api/business/matched/${id}`,
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

  const handleEditScenarioCard = async (scenario: any) => {
    if (!scenario?._id) return;
    setActiveDetailsScenario(scenario);
  };

  const getScenarioRawValue = (scenario: any, keys: string[]) => {
    for (const key of keys) {
      const value = scenario?.[key];
      if (value !== undefined && value !== null && String(value).trim() !== "") {
        return String(value);
      }
    }
    return "";
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

  const latestScenarios = useMemo(() => {
    if (!scenarios || scenarios.length === 0) {
      return [];
    }
    const sorted = [...scenarios].sort(
      (a, b) => scenarioTimestamp(b) - scenarioTimestamp(a)
    );
    const newestTs = scenarioTimestamp(sorted[0]);
    if (!newestTs) return sorted;

    const BATCH_WINDOW_MS = 5 * 60 * 1000; // 5 min window
    const recent: Scenario[] = sorted.filter((s) => {
      const ts = scenarioTimestamp(s);
      return Math.abs(ts - newestTs) <= BATCH_WINDOW_MS;
    });
    return recent.length > 0 ? recent : [sorted[0]];
  }, [scenarios]);

  // 🔹 Group scenarios by business process
const groupedByBP = useMemo(() => {
  // map: bpKey -> { name, scenarios: Map<scenarioId, scenario> }
  const bpMap = new Map<string, { name: string; scenarios: Map<string, any> }>();

  for (const s of latestScenarios) {
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
}, [latestScenarios]);

  const groupedByBPEntries = useMemo(() => {
    return Object.entries(groupedByBP).sort(([aName, aSc], [bName, bSc]) => {
      const aRank =
        bpSortRank[String((aSc?.[0] as any)?.businessProcessId || "").trim()] ??
        bpSortRank[aName.trim().toLowerCase()] ??
        99;
      const bRank =
        bpSortRank[String((bSc?.[0] as any)?.businessProcessId || "").trim()] ??
        bpSortRank[bName.trim().toLowerCase()] ??
        99;
      if (aRank !== bRank) return aRank - bRank;
      return aName.localeCompare(bName);
    });
  }, [groupedByBP, bpSortRank]);

  useEffect(() => {
    const next: Record<string, boolean> = {};
    groupedByBPEntries.forEach(([name]) => {
      next[name] = expandedBp[name] ?? false;
    });
    setExpandedBp(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupedByBPEntries.map(([name]) => name).join("|")]);

  useEffect(() => {
    if (!activeDetailsScenario) {
      setScenarioDetailsDraft({});
      return;
    }
    setScenarioDetailsDraft({
      scenarioId: getScenarioRawValue(activeDetailsScenario, ["scenarioId"]),
      title: getScenarioRawValue(activeDetailsScenario, ["title"]),
      businessProcessName: getScenarioRawValue(activeDetailsScenario, ["businessProcessName"]),
      persona: getScenarioRawValue(activeDetailsScenario, ["persona"]),
      objective: getScenarioRawValue(activeDetailsScenario, ["objective"]),
      triggerPrecondition: getScenarioRawValue(activeDetailsScenario, ["triggerPrecondition", "trigger_event_pre_condition"]),
      scope: getScenarioRawValue(activeDetailsScenario, ["scope"]),
      outOfScope: getScenarioRawValue(activeDetailsScenario, ["outOfScope", "out_of_scope"]),
      expectedBusinessOutcome: getScenarioRawValue(activeDetailsScenario, ["expectedBusinessOutcome", "expected_business_outcome", "expected_result"]),
      customerImpact: getScenarioRawValue(activeDetailsScenario, ["customerImpact"]),
      regulatorySensitivity: getScenarioRawValue(activeDetailsScenario, ["regulatorySensitivity"]),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDetailsScenario?._id]);

  const handleCancelScenarioDetails = () => {
    setActiveDetailsScenario(null);
  };

  const handleSaveScenarioDetails = async () => {
    if (!id || !activeDetailsScenario?._id) return;
    if (!String(scenarioDetailsDraft.title || "").trim()) {
      alert("Scenario Title is required.");
      return;
    }
    setSavingScenarioDetails(true);
    try {
      const body = {
        scenarioId: String(scenarioDetailsDraft.scenarioId || "").trim(),
        title: String(scenarioDetailsDraft.title || "").trim(),
        businessProcessName: String(scenarioDetailsDraft.businessProcessName || "").trim(),
        persona: String(scenarioDetailsDraft.persona || "").trim(),
        objective: String(scenarioDetailsDraft.objective || "").trim(),
        triggerPrecondition: String(scenarioDetailsDraft.triggerPrecondition || "").trim(),
        scope: String(scenarioDetailsDraft.scope || "").trim(),
        outOfScope: String(scenarioDetailsDraft.outOfScope || "").trim(),
        expectedBusinessOutcome: String(scenarioDetailsDraft.expectedBusinessOutcome || "").trim(),
        customerImpact: String(scenarioDetailsDraft.customerImpact || "").trim(),
        regulatorySensitivity: String(scenarioDetailsDraft.regulatorySensitivity || "").trim(),
      };
      const res = await fetch(`${API_BASE}/api/projects/${id}/scenarios/${activeDetailsScenario._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const updated = json?.item || {};

      setScenarios((prev) =>
        prev.map((s: any) =>
          String(s?._id) === String(activeDetailsScenario?._id) ? { ...s, ...body, ...updated } : s
        )
      );
      setActiveDetailsScenario(null);
    } catch (e: any) {
      alert(e?.message || "Failed to save test scenario details");
    } finally {
      setSavingScenarioDetails(false);
    }
  };




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

      <div className="page-content-wrap">
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

      <div className="scenario-toolbar">
        <SourceFileInfo projectId={id} className="source-file-inline" style={{ margin: 0 }} />
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

  {groupedByBPEntries.length === 0 ? (
    <div className="empty-state">No latest generated test scenarios found.</div>
  ) : (
  groupedByBPEntries.map(([bpName, bpScenarios], bpIndex) => (
    <div key={bpName} style={{ marginBottom: 32 }}>
      <button
        type="button"
        className="bp-dropdown-toggle"
        onClick={() =>
          setExpandedBp((prev) => ({ ...prev, [bpName]: !prev[bpName] }))
        }
      >
        <span className="bp-dropdown-title">{bpIndex + 1}. Business Process: {bpName}</span>
        <span className="bp-dropdown-caret">{expandedBp[bpName] ? "▲" : "▼"}</span>
      </button>

      {expandedBp[bpName] && (
        <div className="tiles-grid" style={{ marginTop: 12 }}>
          {bpScenarios.map((s, idx) => (
            <article
              key={s._id}
              className="tile-card tile-card-clickable"
              onClick={() => setActiveDetailsScenario(s)}
            >
              <div className="tile-header">
                <label className="tile-select">
                  <input
                    type="checkbox"
                    checked={!!selected[s._id!]}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => toggleSelect(s._id!)}
                  />
                </label>
                <h3 className="tile-title">{idx + 1}. {s.title}</h3>
                {s.edited ? <span className="scenario-edited-dot" title="Edited">●</span> : null}
                {s.testRunSuccess ? <span className="scenario-success-dot" title="Test code generated successfully">●</span> : null}
                <button
                  type="button"
                  className="btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEditScenarioCard(s);
                  }}
                >
                  Edit
                </button>
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
      )}
    </div>
  )))}
</div>

      {activeDetailsScenario && (
        <div className="scenario-details-modal-overlay" onClick={() => setActiveDetailsScenario(null)}>
          <div className="scenario-details-modal" onClick={(e) => e.stopPropagation()}>
            <div className="scenario-details-modal-head">
              <h3 className="scenario-details-modal-title">{activeDetailsScenario.title || "Scenario Details"}</h3>
              <div className="scenario-details-modal-actions">
                <button type="button" className="btn" onClick={handleCancelScenarioDetails} disabled={savingScenarioDetails}>
                  Cancel
                </button>
                <button type="button" className="btn btn-primary" onClick={handleSaveScenarioDetails} disabled={savingScenarioDetails}>
                  {savingScenarioDetails ? "Saving..." : "Save"}
                </button>
                <button type="button" className="scenario-details-close-btn" onClick={() => setActiveDetailsScenario(null)} aria-label="Close">
                  ×
                </button>
              </div>
            </div>

            <table className="scenario-details-table">
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Scenario ID</td>
                  <td><input className="bp-details-input" value={scenarioDetailsDraft.scenarioId || ""} onChange={(e) => setScenarioDetailsDraft((p) => ({ ...p, scenarioId: e.target.value }))} /></td>
                </tr>
                <tr>
                  <td>Scenario Title</td>
                  <td><textarea className="bp-details-input" rows={2} value={scenarioDetailsDraft.title || ""} onChange={(e) => setScenarioDetailsDraft((p) => ({ ...p, title: e.target.value }))} /></td>
                </tr>
                <tr>
                  <td>Business Process Ref</td>
                  <td><textarea className="bp-details-input" rows={2} value={scenarioDetailsDraft.businessProcessName || ""} onChange={(e) => setScenarioDetailsDraft((p) => ({ ...p, businessProcessName: e.target.value }))} /></td>
                </tr>
                <tr>
                  <td>Persona</td>
                  <td><textarea className="bp-details-input" rows={2} value={scenarioDetailsDraft.persona || ""} onChange={(e) => setScenarioDetailsDraft((p) => ({ ...p, persona: e.target.value }))} /></td>
                </tr>
                <tr>
                  <td>Objective</td>
                  <td><textarea className="bp-details-input" rows={2} value={scenarioDetailsDraft.objective || ""} onChange={(e) => setScenarioDetailsDraft((p) => ({ ...p, objective: e.target.value }))} /></td>
                </tr>
                <tr>
                  <td>Trigger Event &amp; Pre-Condition</td>
                  <td><textarea className="bp-details-input" rows={2} value={scenarioDetailsDraft.triggerPrecondition || ""} onChange={(e) => setScenarioDetailsDraft((p) => ({ ...p, triggerPrecondition: e.target.value }))} /></td>
                </tr>
                <tr>
                  <td>Scope</td>
                  <td><textarea className="bp-details-input" rows={2} value={scenarioDetailsDraft.scope || ""} onChange={(e) => setScenarioDetailsDraft((p) => ({ ...p, scope: e.target.value }))} /></td>
                </tr>
                <tr>
                  <td>Out of Scope</td>
                  <td><textarea className="bp-details-input" rows={2} value={scenarioDetailsDraft.outOfScope || ""} onChange={(e) => setScenarioDetailsDraft((p) => ({ ...p, outOfScope: e.target.value }))} /></td>
                </tr>
                <tr>
                  <td>Expected Business Outcome</td>
                  <td><textarea className="bp-details-input" rows={2} value={scenarioDetailsDraft.expectedBusinessOutcome || ""} onChange={(e) => setScenarioDetailsDraft((p) => ({ ...p, expectedBusinessOutcome: e.target.value }))} /></td>
                </tr>
                <tr>
                  <td>Customer Impact</td>
                  <td><textarea className="bp-details-input" rows={2} value={scenarioDetailsDraft.customerImpact || ""} onChange={(e) => setScenarioDetailsDraft((p) => ({ ...p, customerImpact: e.target.value }))} /></td>
                </tr>
                <tr>
                  <td>Regulatory Sensitivity</td>
                  <td><textarea className="bp-details-input" rows={2} value={scenarioDetailsDraft.regulatorySensitivity || ""} onChange={(e) => setScenarioDetailsDraft((p) => ({ ...p, regulatorySensitivity: e.target.value }))} /></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={{ height: 40 }} />
      </div>
    </div>
  );
}
