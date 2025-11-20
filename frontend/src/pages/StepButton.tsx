import React from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import "../pages/ProjectFlow.css";

const steps = [
  { path: "root", label: "1. Upload Documents" },
  { path: "analysis", label: "2. Flow Analysis" },
  { path: "scenarios", label: "3. Test Scenarios" },
  { path: "testcases", label: "4. Test Cases" },
  { path: "test", label: "5. Test" },
];

const StepButtons: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path: string) => {
    if (path === "root") return location.pathname === `/project/${id}`;
    return location.pathname.includes(path);
  };

  const currentStepIndex = steps.findIndex((s) => isActive(s.path));

  return (
    <div className="stepper-container">
      {steps.map((step, index) => {
        const active = isActive(step.path);
        const completed = index < currentStepIndex;

        return (
          <div key={step.path} className="stepper-step">
            <button
              className={`step-circle ${
                completed ? "completed" : active ? "active" : ""
              }`}
              onClick={() =>
                navigate(
                  step.path === "root"
                    ? `/project/${id}`
                    : `/project/${id}/${step.path}`
                )
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
