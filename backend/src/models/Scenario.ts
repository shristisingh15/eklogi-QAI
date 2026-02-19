import mongoose from "mongoose";

const ScenarioSchema = new mongoose.Schema({
  projectId: { type: String, required: true, index: true },
  businessProcessId: { type: mongoose.Schema.Types.ObjectId, ref: "BusinessProcess" }, // ✅ add
  businessProcessName: { type: String }, // ✅ add
  scenarioId: { type: String, default: "" },
  title: { type: String, required: true },
  description: { type: String },
  steps: { type: [String], default: [] },
  expected_result: { type: String },
  persona: { type: String, default: "" },
  objective: { type: String, default: "" },
  triggerPrecondition: { type: String, default: "" },
  scope: { type: String, default: "" },
  outOfScope: { type: String, default: "" },
  expectedBusinessOutcome: { type: String, default: "" },
  customerImpact: { type: String, default: "" },
  regulatorySensitivity: { type: String, default: "" },
  scenarioIdWhyItMatters: { type: String, default: "" },
  scenarioTitleWhyItMatters: { type: String, default: "" },
  businessProcessRefWhyItMatters: { type: String, default: "" },
  personaWhyItMatters: { type: String, default: "" },
  objectiveWhyItMatters: { type: String, default: "" },
  triggerPreconditionWhyItMatters: { type: String, default: "" },
  scopeWhyItMatters: { type: String, default: "" },
  outOfScopeWhyItMatters: { type: String, default: "" },
  expectedBusinessOutcomeWhyItMatters: { type: String, default: "" },
  customerImpactWhyItMatters: { type: String, default: "" },
  regulatorySensitivityWhyItMatters: { type: String, default: "" },
  edited: { type: Boolean, default: false, index: true },
  testRunSuccess: { type: Boolean, default: false, index: true },
  createdAt: { type: Date, default: Date.now },
  source: { type: String, default: "manual" }, // ✅ keep "ai" for generated ones
});

export const Scenario =
  mongoose.models.Scenario || mongoose.model("Scenario", ScenarioSchema);

export default Scenario;
