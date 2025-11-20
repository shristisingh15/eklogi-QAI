import mongoose from "mongoose";

const TestCaseSchema = new mongoose.Schema({
  projectId: { type: String, required: true, index: true },

  // 🔹 Reference to parent Scenario
  scenarioId: { type: mongoose.Schema.Types.ObjectId, ref: "Scenario" },
  scenarioTitle: { type: String }, // denormalized for grouping in UI

  title: { type: String, required: true },
  description: { type: String },
  steps: { type: [String], default: [] },
  expected_result: { type: String },
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
