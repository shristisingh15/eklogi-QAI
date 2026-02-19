import mongoose from "mongoose";

const TestCaseSchema = new mongoose.Schema({
  projectId: { type: String, required: true, index: true },

  // 🔹 Optional denormalized parent Business Process for hierarchy rendering
  businessProcessId: { type: mongoose.Schema.Types.ObjectId, ref: "BusinessProcess" },
  businessProcessName: { type: String },

  // 🔹 Reference to parent Scenario
  scenarioId: { type: mongoose.Schema.Types.ObjectId, ref: "Scenario" },
  scenarioTitle: { type: String }, // denormalized for grouping in UI

  title: { type: String, required: true },
  testCaseId: { type: String, default: "" },
  description: { type: String },
  persona: { type: String, default: "" },
  preRequisites: { type: String, default: "" },
  steps: { type: [String], default: [] },
  expected_result: { type: String },
  criticality: { type: String, default: "" },
  blockingType: { type: String, default: "" },
  customerImpact: { type: String, default: "" },
  regulatorySensitivity: { type: String, default: "" },
  edited: { type: Boolean, default: false, index: true },
  testRunSuccess: { type: Boolean, default: false, index: true },
  type: {
    type: String,
    enum: ["Unit", "Integration", "System", "Other", "Positive", "Negative", "Edge", "Security", "Performance", "Usability"],
    default: "Other",
  },

  createdAt: { type: Date, default: Date.now },
  source: { type: String, default: "manual" }, // or "ai"
});

export const TestCase =
  mongoose.models.TestCase || mongoose.model("TestCase", TestCaseSchema);

export default TestCase;
