import React from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import "../pages/ProjectFlow.css";

const steps = [
  { path: "upload", label: "1. Upload Documents" },
  { path: "analysis", label: "2. Flow Analysis" },
  { path: "scenarios", label: "3. Test Scenarios" },
  { path: "testcases", label: "4. Test Cases" },
  { path: "test", label: "5. Test" },
];

const StepButtons: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [hasEditedBp, setHasEditedBp] = React.useState(false);
  const [hasEditedScenario, setHasEditedScenario] = React.useState(false);
  const [hasEditedTestCase, setHasEditedTestCase] = React.useState(false);

  const API_BASE = (import.meta as any).env?.VITE_API_BASE || "https://eklogi-qai.onrender.com";

  const pathParts = location.pathname.split("/").filter(Boolean);
  const currentStepPath = pathParts[2] || "upload";

  const isActive = (path: string) => {
    return currentStepPath === path;
  };

  const currentStepIndex = steps.findIndex((s) => isActive(s.path));

  React.useEffect(() => {
    if (!id) {
      setHasEditedBp(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [bpRes, scRes, tcRes] = await Promise.all([
          fetch(`${API_BASE}/api/business/matched/${id}`),
          fetch(`${API_BASE}/api/projects/${id}/scenarios`),
          fetch(`${API_BASE}/api/projects/${id}/test-cases`),
        ]);

        if (bpRes.ok) {
          const bpJson = await bpRes.json();
          const bpItems = Array.isArray(bpJson?.items) ? bpJson.items : [];
          const bpEditedExists = bpItems.some((it: any) => !!it?.edited);
          if (!cancelled) setHasEditedBp(bpEditedExists);
        } else if (!cancelled) {
          setHasEditedBp(false);
        }

        if (scRes.ok) {
          const scJson = await scRes.json();
          const scItems = Array.isArray(scJson?.items) ? scJson.items : [];
          const scEditedExists = scItems.some((it: any) => !!it?.edited);
          if (!cancelled) setHasEditedScenario(scEditedExists);
        } else if (!cancelled) {
          setHasEditedScenario(false);
        }

        if (tcRes.ok) {
          const tcJson = await tcRes.json();
          const tcItems = Array.isArray(tcJson?.items) ? tcJson.items : [];
          const tcEditedExists = tcItems.some((it: any) => !!it?.edited);
          if (!cancelled) setHasEditedTestCase(tcEditedExists);
        } else if (!cancelled) {
          setHasEditedTestCase(false);
        }
      } catch {
        if (!cancelled) {
          setHasEditedBp(false);
          setHasEditedScenario(false);
          setHasEditedTestCase(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, API_BASE, location.pathname]);

  return (
    <div className="stepper-container">
      {steps.map((step, index) => {
        const active = isActive(step.path);
        const completed = index < currentStepIndex;
        // If BP is edited, block only forward navigation; allow current and backward steps.
        const bpForwardLock = hasEditedBp && index > currentStepIndex;
        const scenarioForwardLock =
          hasEditedScenario && currentStepPath === "scenarios" && index > currentStepIndex;
        const testCaseForwardLock =
          hasEditedTestCase && currentStepPath === "testcases" && index > currentStepIndex;
        const navDisabled = bpForwardLock || scenarioForwardLock || testCaseForwardLock;

        return (
          <div key={step.path} className="stepper-step">
            <button
              className={`step-circle ${
                completed ? "completed" : active ? "active" : ""
              } ${navDisabled ? "disabled" : ""}`}
              onClick={() => {
                if (navDisabled) return;
                navigate(`/project/${id}/${step.path}`);
              }}
              disabled={navDisabled}
              title={
                navDisabled
                  ? "Edits pending. Click Next on the current step to regenerate and unlock forward navigation."
                  : ""
              }
            >
              {completed ? "✔" : index + 1}
            </button>
            <span className={`step-label ${active ? "active-label" : ""}`}>
              {step.label}
            </span>

            {/* Arrow between steps */}
            {index < steps.length - 1 && (
              <div
                className={`step-arrow ${index < currentStepIndex ? "filled" : ""}`}
              >
                ➝
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default StepButtons;
