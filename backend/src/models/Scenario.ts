import mongoose from "mongoose";

const ScenarioSchema = new mongoose.Schema({
  projectId: { type: String, required: true, index: true },
  businessProcessId: { type: mongoose.Schema.Types.ObjectId, ref: "BusinessProcess" }, // ✅ add
  businessProcessName: { type: String }, // ✅ add
  title: { type: String, required: true },
  description: { type: String },
  steps: { type: [String], default: [] },
  expected_result: { type: String },
  createdAt: { type: Date, default: Date.now },
  source: { type: String, default: "manual" }, // ✅ keep "ai" for generated ones
});

export const Scenario =
  mongoose.models.Scenario || mongoose.model("Scenario", ScenarioSchema);

export default Scenario;
