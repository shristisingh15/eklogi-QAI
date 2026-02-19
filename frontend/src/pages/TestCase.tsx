import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useProject } from "./ProjectContext";
import StepButtons from "./StepButton";
import SourceFileInfo from "./SourceFileInfo";
import "./testscenario.css";

type TestCase = {
  title?: string;
  description?: string;
  preconditions?: string[];
  steps?: string[];
  expected_result?: string;
  type?: string;
  businessProcessId?: string | null;
  businessProcessName?: string;
  scenarioIndex?: number;
  scenarioId?: string | null;
  scenarioTitle?: string;
  _id?: string;
  [k: string]: any;
};

type GeneratedCode = {
  scenarioId: string | null;
  testCaseId?: string | null;
  testCaseTitle?: string;
  scenarioTitle?: string;
  title?: string;
  code?: string | null;
  error?: string | null;
};

const API_BASE = import.meta.env.VITE_API_BASE || "https://eklogi-qai.onrender.com";
const FRAMEWORK_OPTIONS = ["JUnit", "Selenium", "Mocha", "Jest", "PyTest"];
const LANGUAGE_OPTIONS = ["Java", "TypeScript", "JavaScript", "Python", "C#"];

export default function TestCasesPage(): JSX.Element {
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
  const testCasesFromCtx: TestCase[] | undefined =
    (ctxConfig && ctxConfig.testCases) || (ctxConfig && ctxConfig.testcases) || undefined;
  const stateTestCases: TestCase[] | undefined = state.testCases;
  const [remoteTestCases, setRemoteTestCases] = useState<TestCase[]>([]);
  const sourceTestCases: TestCase[] = testCasesFromCtx ?? stateTestCases ?? remoteTestCases ?? [];
  const [testCases, setTestCases] = useState<TestCase[]>(sourceTestCases);

  const stateRaw: string | undefined = state.raw;
  const rawFromCtx: string | undefined = (ctxConfig && (ctxConfig.raw || ctxConfig.rawOutput)) || undefined;
  const raw: string = testCases.length === 0 ? stateRaw ?? rawFromCtx ?? "" : stateRaw ?? rawFromCtx ?? "";

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
  const [expandedBp, setExpandedBp] = useState<Record<string, boolean>>({});
  const [expandedScenario, setExpandedScenario] = useState<Record<string, boolean>>({});
  const [activeDetailsTestCase, setActiveDetailsTestCase] = useState<TestCase | null>(null);
  const [testCaseDetailsDraft, setTestCaseDetailsDraft] = useState<Record<string, string>>({});
  const [savingTestCaseDetails, setSavingTestCaseDetails] = useState<boolean>(false);
  const [bpSortRank, setBpSortRank] = useState<Record<string, number>>({});

  useEffect(() => {
    setTestCases(sourceTestCases);
  }, [sourceTestCases]);

  const priorityRank: Record<string, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };

  const projectId: string | null =
    routeProjectId ||
    projectCtx?.currentProjectId ||
    projectCtx?.projectId ||
    (ctxConfig && (ctxConfig.projectId || ctxConfig._id)) ||
    (state && state.projectId) ||
    null;

  const lastPushedRef = React.useRef<{ framework?: string; language?: string }>({
    framework: initialFramework,
    language: initialLanguage,
  });

  useEffect(() => {
    if (typeof setTestRunConfig !== "function") return;
    const last = lastPushedRef.current;
    if (last.framework === framework && last.language === language) return;
    lastPushedRef.current = { framework, language };

    try {
      if (!(ctxConfig && ctxConfig.framework === framework && ctxConfig.language === language)) {
        setTestRunConfig({ ...(ctxConfig || {}), framework, language });
      }
    } catch (err) {
      console.warn("setTestRunConfig failed:", err);
    }
  }, [framework, language, ctxConfig, setTestRunConfig, initialFramework, initialLanguage]);

  useEffect(() => {
    const m: Record<number, boolean> = {};
    for (let i = 0; i < testCases.length; i++) m[i] = true;
    setSelectedMap(m);
    setSelectAllChecked(Object.values(m).every(Boolean) && Object.values(m).length > 0);
  }, [testCases]);

  useEffect(() => {
    if (!projectId) return;
    if ((testCasesFromCtx && testCasesFromCtx.length > 0) || (stateTestCases && stateTestCases.length > 0)) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/projects/${projectId}/test-cases`);
        if (!res.ok) return;
        const json = await res.json();
        const items = Array.isArray(json?.items) ? json.items : [];
        if (!cancelled) setRemoteTestCases(items);
      } catch {
        if (!cancelled) setRemoteTestCases([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, testCasesFromCtx, stateTestCases]);

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

  const groupedHierarchy = useMemo(() => {
    const map: Record<string, Record<string, Array<{ tc: TestCase; idx: number }>>> = {};
    testCases.forEach((tc, idx) => {
      const bpName = tc.businessProcessName || "Unassigned Business Process";
      const scenarioName = tc.scenarioTitle || "Unassigned Scenario";
      if (!map[bpName]) map[bpName] = {};
      if (!map[bpName][scenarioName]) map[bpName][scenarioName] = [];
      map[bpName][scenarioName].push({ tc, idx });
    });
    return map;
  }, [testCases]);

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

  const groupedHierarchyEntries = useMemo(() => {
    return Object.entries(groupedHierarchy).sort(([aName, aScenarios], [bName, bScenarios]) => {
      const aFirstScenario = Object.values(aScenarios || {})[0]?.[0]?.tc as any;
      const bFirstScenario = Object.values(bScenarios || {})[0]?.[0]?.tc as any;

      const aRank =
        bpSortRank[String(aFirstScenario?.businessProcessId || "").trim()] ??
        bpSortRank[aName.trim().toLowerCase()] ??
        99;
      const bRank =
        bpSortRank[String(bFirstScenario?.businessProcessId || "").trim()] ??
        bpSortRank[bName.trim().toLowerCase()] ??
        99;

      if (aRank !== bRank) return aRank - bRank;
      return aName.localeCompare(bName);
    });
  }, [groupedHierarchy, bpSortRank]);

  useEffect(() => {
    const nextBp: Record<string, boolean> = {};
    const nextSc: Record<string, boolean> = {};
    groupedHierarchyEntries.forEach(([bpName, scenarios]) => {
      nextBp[bpName] = expandedBp[bpName] ?? true;
      Object.keys(scenarios).forEach((scenarioName) => {
        const key = `${bpName}__${scenarioName}`;
        nextSc[key] = expandedScenario[key] ?? true;
      });
    });
    setExpandedBp(nextBp);
    setExpandedScenario(nextSc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupedHierarchyEntries.map(([name]) => name).join("|")]);

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
        mode: "test-cases",
        framework,
        language,
        scenarios: selectedCases,
        uploadedFiles: projectCtx.uploadedFiles || ctxConfig?.uploadedFiles || [],
        prompt: "Generate runnable code only for each selected test case using the selected framework and language.",
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
      if (codesArr.length === 0) {
        setGenError("No code was generated for selected test cases.");
        setGenerating(false);
        return;
      }

      const normalized = codesArr.map((c) => ({
        scenarioId: c?.scenarioId ?? null,
        testCaseId: c?.testCaseId ?? null,
        testCaseTitle: c?.testCaseTitle ?? "",
        scenarioTitle: c?.scenarioTitle ?? "",
        title: c?.title ?? "",
        code: c?.code ? stripFencedCode(String(c.code)) : null,
        error: c?.error ?? null,
      }));

      const successfulIds = new Set(
        normalized
          .filter((c) => !!c.testCaseId && !!c.code && !c.error)
          .map((c) => String(c.testCaseId))
      );
      const selectedCaseIds = new Set(selectedCases.map((c) => String(c?._id || "")).filter(Boolean));
      const updatedSelectedCases = selectedCases.map((tc) => {
        const id = String(tc?._id || "");
        if (!id) return tc;
        const isSelected = selectedCaseIds.has(id);
        const isSuccess = successfulIds.has(id);
        if (!isSelected) return tc;
        return {
          ...tc,
          ...(isSuccess ? { edited: false } : {}),
          testRunSuccess: isSuccess,
        };
      });

      setTestCases((prev) =>
        (prev || []).map((tc) => {
          const id = String(tc?._id || "");
          if (!id || !selectedCaseIds.has(id)) return tc;
          const isSuccess = successfulIds.has(id);
          return {
            ...tc,
            ...(isSuccess ? { edited: false } : {}),
            testRunSuccess: isSuccess,
          };
        })
      );
      setRemoteTestCases((prev) =>
        (prev || []).map((tc) => {
          const id = String(tc?._id || "");
          if (!id || !selectedCaseIds.has(id)) return tc;
          const isSuccess = successfulIds.has(id);
          return {
            ...tc,
            ...(isSuccess ? { edited: false } : {}),
            testRunSuccess: isSuccess,
          };
        })
      );

      if (typeof setTestRunConfig === "function") {
        try {
          setTestRunConfig({
            ...(ctxConfig || {}),
            framework,
            language,
            testCases: updatedSelectedCases,
            codes: normalized,
          });
        } catch {}
      }

      navigate(`/project/${projectId}/test`, {
        state: {
          framework,
          language,
          testCases: updatedSelectedCases,
          codes: normalized,
          generatedFrom: "selected-test-cases",
        },
      });
    } catch (err: any) {
      setGenError(String(err?.message || err) || "Unexpected error generating tests");
    } finally {
      setGenerating(false);
    }
  };

  const handleEditTestCase = async (tc: TestCase) => {
    if (!tc?._id) return;
    setActiveDetailsTestCase(tc);
  };

  const getTcRawValue = (tc: TestCase, keys: string[]) => {
    for (const key of keys) {
      const value = (tc as any)?.[key];
      if (value !== undefined && value !== null && String(value).trim() !== "") return String(value);
    }
    return "";
  };

  useEffect(() => {
    if (!activeDetailsTestCase) {
      setTestCaseDetailsDraft({});
      return;
    }
    setTestCaseDetailsDraft({
      testCaseId: getTcRawValue(activeDetailsTestCase, ["testCaseId"]),
      title: getTcRawValue(activeDetailsTestCase, ["title"]),
      businessProcessName: getTcRawValue(activeDetailsTestCase, ["businessProcessName"]),
      persona: getTcRawValue(activeDetailsTestCase, ["persona"]),
      description: getTcRawValue(activeDetailsTestCase, ["description"]),
      preRequisites: getTcRawValue(activeDetailsTestCase, ["preRequisites", "preconditions"]),
      steps: Array.isArray(activeDetailsTestCase.steps) ? activeDetailsTestCase.steps.join("\n") : getTcRawValue(activeDetailsTestCase, ["steps"]),
      expected_result: getTcRawValue(activeDetailsTestCase, ["expected_result"]),
      criticality: getTcRawValue(activeDetailsTestCase, ["criticality", "type"]),
      blockingType: getTcRawValue(activeDetailsTestCase, ["blockingType"]),
      customerImpact: getTcRawValue(activeDetailsTestCase, ["customerImpact"]),
      regulatorySensitivity: getTcRawValue(activeDetailsTestCase, ["regulatorySensitivity"]),
    });
  }, [activeDetailsTestCase?._id]);

  const handleCancelTestCaseDetails = () => {
    setActiveDetailsTestCase(null);
  };

  const handleSaveTestCaseDetails = async () => {
    if (!projectId || !activeDetailsTestCase?._id) return;
    if (!String(testCaseDetailsDraft.title || "").trim()) {
      alert("Title is required.");
      return;
    }

    setSavingTestCaseDetails(true);
    try {
      const parsedSteps = String(testCaseDetailsDraft.steps || "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);

      const body: any = {
        testCaseId: String(testCaseDetailsDraft.testCaseId || "").trim(),
        title: String(testCaseDetailsDraft.title || "").trim(),
        businessProcessName: String(testCaseDetailsDraft.businessProcessName || "").trim(),
        persona: String(testCaseDetailsDraft.persona || "").trim(),
        description: String(testCaseDetailsDraft.description || "").trim(),
        preRequisites: String(testCaseDetailsDraft.preRequisites || "").trim(),
        steps: parsedSteps,
        expected_result: String(testCaseDetailsDraft.expected_result || "").trim(),
        criticality: String(testCaseDetailsDraft.criticality || "").trim(),
        blockingType: String(testCaseDetailsDraft.blockingType || "").trim(),
        customerImpact: String(testCaseDetailsDraft.customerImpact || "").trim(),
        regulatorySensitivity: String(testCaseDetailsDraft.regulatorySensitivity || "").trim(),
      };

      const res = await fetch(`${API_BASE}/api/projects/${projectId}/test-cases/${activeDetailsTestCase._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const updated = json?.item || {};
      const updatedId = String(updated?._id || activeDetailsTestCase._id);
      setTestCases((prev) =>
        (prev || []).map((tc) => (String(tc?._id || "") === updatedId ? { ...tc, ...updated } : tc))
      );
      setRemoteTestCases((prev) =>
        (prev || []).map((tc) => (String(tc?._id || "") === updatedId ? { ...tc, ...updated } : tc))
      );
      if (typeof setTestRunConfig === "function") {
        setTestRunConfig((prev: any) => {
          const current = prev || {};
          const prevCases = Array.isArray(current.testCases) ? current.testCases : [];
          if (!Array.isArray(prevCases) || prevCases.length === 0) return current;
          return {
            ...current,
            testCases: prevCases.map((tc: any) =>
              String(tc?._id || "") === updatedId ? { ...tc, ...updated } : tc
            ),
          };
        });
      }
      setActiveDetailsTestCase(null);
    } catch (e: any) {
      setGenError(e?.message || "Failed to update test case");
    } finally {
      setSavingTestCaseDetails(false);
    }
  };

  return (
    <div className="project-page test-scenarios-root" style={{ minHeight: "100vh" }}>
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
        <div className="project-header" style={{ paddingTop: 12 }}>
          <h2 style={{ marginTop: 8 }}>{projectDisplayName || "Project"}</h2>
          <p className="muted" style={{ marginTop: 4 }}>
            {projectSubtitle || "Generated test cases"}
          </p>
          <div style={{ marginTop: 14, display: "flex", justifyContent: "center" }}>
            <StepButtons />
          </div>
          <SourceFileInfo projectId={projectId} />
        </div>

        <div style={{ height: 20 }} />

        <div className="controls-row" style={{ alignItems: "center" }}>
          <div className="controls-left">
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
          </div>

          <div className="controls-right">
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
                onClick={handleGenerateAndGo}
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

        <div className="tiles-section" style={{ marginTop: 18 }}>
          <h3 className="tiles-section-title">Test Cases</h3>
          <div style={{ marginTop: 8 }}>
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
                    The backend did not return structured test cases. Try regenerating from test scenarios.
                  </p>
                )}
              </div>
            ) : (
              groupedHierarchyEntries.map(([bpName, scenariosMap], bpIndex) => (
                <div key={bpName} style={{ marginBottom: 22 }}>
                  <button
                    type="button"
                    className="bp-dropdown-toggle"
                    onClick={() => setExpandedBp((prev) => ({ ...prev, [bpName]: !prev[bpName] }))}
                  >
                    <span className="bp-dropdown-title">{bpIndex + 1}. Business Process: {bpName}</span>
                    <span className="bp-dropdown-caret">{expandedBp[bpName] ? "▲" : "▼"}</span>
                  </button>

                  {expandedBp[bpName] && (
                    <div style={{ marginTop: 10, paddingLeft: 8 }}>
                      {Object.entries(scenariosMap).map(([scenarioName, rows], scenarioIndex) => {
                        const scenarioKey = `${bpName}__${scenarioName}`;
                        return (
                          <div key={scenarioKey} style={{ marginBottom: 12 }}>
                            <button
                              type="button"
                              className="scenario-dropdown-toggle"
                              onClick={() =>
                                setExpandedScenario((prev) => ({ ...prev, [scenarioKey]: !prev[scenarioKey] }))
                              }
                            >
                              <span>Test Scenario {scenarioIndex + 1}: {scenarioName}</span>
                              <span>{expandedScenario[scenarioKey] ? "▲" : "▼"}</span>
                            </button>
                            {expandedScenario[scenarioKey] && (
                              <div className="testcase-list">
                                <table className="testcase-table">
                                  <thead>
                                    <tr>
                                      <th>Sr.No</th>
                                      <th>Test Case</th>
                                      <th>Action</th>
                                      <th>Expected Result</th>
                                      <th>Edit</th>
                                      <th>Select</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {rows.map(({ tc, idx }, rowIndex) => (
                                      <tr key={tc._id || `${scenarioKey}-${idx}`}>
                                        <td>{rowIndex + 1}</td>
                                        <td>
                                          {tc.title || `Test Case ${idx + 1}`}
                                          {tc.edited && !tc.testRunSuccess ? <span className="scenario-edited-dot" title="Edited">●</span> : null}
                                          {tc.testRunSuccess ? <span className="scenario-success-dot" title="Test code generated successfully">●</span> : null}
                                        </td>
                                        <td>{tc.steps?.[0] || tc.description || "Action not provided"}</td>
                                        <td>{tc.expected_result || "Expected result not provided"}</td>
                                        <td>
                                          <button
                                            type="button"
                                            className="btn"
                                            onClick={() => handleEditTestCase(tc)}
                                          >
                                            Edit
                                          </button>
                                        </td>
                                        <td className="testcase-check-cell">
                                          <input
                                            type="checkbox"
                                            checked={!!selectedMap[idx]}
                                            onChange={() => toggleSelect(idx)}
                                          />
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
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
        </div>

        {genError && (
          <div style={{ marginTop: 12, padding: 12 }}>
            <div style={{ color: "crimson" }}>{genError}</div>
          </div>
        )}

        {activeDetailsTestCase && (
          <div className="scenario-details-modal-overlay" onClick={() => setActiveDetailsTestCase(null)}>
            <div className="scenario-details-modal" onClick={(e) => e.stopPropagation()}>
              <div className="scenario-details-modal-head">
                <h3 className="scenario-details-modal-title">{activeDetailsTestCase.title || "Test Case Details"}</h3>
                <div className="scenario-details-modal-actions">
                  <button type="button" className="btn" onClick={handleCancelTestCaseDetails} disabled={savingTestCaseDetails}>
                    Cancel
                  </button>
                  <button type="button" className="btn btn-primary" onClick={handleSaveTestCaseDetails} disabled={savingTestCaseDetails}>
                    {savingTestCaseDetails ? "Saving..." : "Save"}
                  </button>
                  <button type="button" className="scenario-details-close-btn" onClick={() => setActiveDetailsTestCase(null)} aria-label="Close">
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
                    <td>Test Case ID</td>
                    <td><input className="bp-details-input" value={testCaseDetailsDraft.testCaseId || ""} onChange={(e) => setTestCaseDetailsDraft((p) => ({ ...p, testCaseId: e.target.value }))} /></td>
                  </tr>
                  <tr>
                    <td>Title</td>
                    <td><textarea className="bp-details-input" rows={2} value={testCaseDetailsDraft.title || ""} onChange={(e) => setTestCaseDetailsDraft((p) => ({ ...p, title: e.target.value }))} /></td>
                  </tr>
                  <tr>
                    <td>Business Process</td>
                    <td><textarea className="bp-details-input" rows={2} value={testCaseDetailsDraft.businessProcessName || ""} onChange={(e) => setTestCaseDetailsDraft((p) => ({ ...p, businessProcessName: e.target.value }))} /></td>
                  </tr>
                  <tr>
                    <td>Persona</td>
                    <td><textarea className="bp-details-input" rows={2} value={testCaseDetailsDraft.persona || ""} onChange={(e) => setTestCaseDetailsDraft((p) => ({ ...p, persona: e.target.value }))} /></td>
                  </tr>
                  <tr>
                    <td>Description</td>
                    <td><textarea className="bp-details-input" rows={3} value={testCaseDetailsDraft.description || ""} onChange={(e) => setTestCaseDetailsDraft((p) => ({ ...p, description: e.target.value }))} /></td>
                  </tr>
                  <tr>
                    <td>Pre-Requisites</td>
                    <td><textarea className="bp-details-input" rows={3} value={testCaseDetailsDraft.preRequisites || ""} onChange={(e) => setTestCaseDetailsDraft((p) => ({ ...p, preRequisites: e.target.value }))} /></td>
                  </tr>
                  <tr>
                    <td>Test Steps</td>
                    <td><textarea className="bp-details-input" rows={5} value={testCaseDetailsDraft.steps || ""} onChange={(e) => setTestCaseDetailsDraft((p) => ({ ...p, steps: e.target.value }))} /></td>
                  </tr>
                  <tr>
                    <td>Expected Result</td>
                    <td><textarea className="bp-details-input" rows={3} value={testCaseDetailsDraft.expected_result || ""} onChange={(e) => setTestCaseDetailsDraft((p) => ({ ...p, expected_result: e.target.value }))} /></td>
                  </tr>
                  <tr>
                    <td>Criticality</td>
                    <td><input className="bp-details-input" value={testCaseDetailsDraft.criticality || ""} onChange={(e) => setTestCaseDetailsDraft((p) => ({ ...p, criticality: e.target.value }))} /></td>
                  </tr>
                  <tr>
                    <td>Blocking / Non-Blocking</td>
                    <td><input className="bp-details-input" value={testCaseDetailsDraft.blockingType || ""} onChange={(e) => setTestCaseDetailsDraft((p) => ({ ...p, blockingType: e.target.value }))} /></td>
                  </tr>
                  <tr>
                    <td>Customer Impact</td>
                    <td><textarea className="bp-details-input" rows={2} value={testCaseDetailsDraft.customerImpact || ""} onChange={(e) => setTestCaseDetailsDraft((p) => ({ ...p, customerImpact: e.target.value }))} /></td>
                  </tr>
                  <tr>
                    <td>Regulatory Sensitivity</td>
                    <td><textarea className="bp-details-input" rows={2} value={testCaseDetailsDraft.regulatorySensitivity || ""} onChange={(e) => setTestCaseDetailsDraft((p) => ({ ...p, regulatorySensitivity: e.target.value }))} /></td>
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
