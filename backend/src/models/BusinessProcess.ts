// backend/src/model/businessprocess.ts
import mongoose from "mongoose";

const bpSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: { type: String },
    priority: {
      type: String,
      enum: ["Critical", "High", "Medium", "Low"],
      default: "Medium",
    },
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: "Project" },

    // NEW fields for regenerate/matching
    matched: { type: Boolean, default: false, index: true },
    score: { type: Number, default: 0 }, // normalized score (0..1)
    source: { type: String, default: "manual" }, // e.g. "openai", "local_score"
  },
  {
    timestamps: true, // createdAt & updatedAt will be managed automatically
    strict: true,
  }
);

export type BusinessProcessDoc = mongoose.InferSchemaType<typeof bpSchema>;
export const BusinessProcess = mongoose.model<BusinessProcessDoc>(
  "BusinessProcess",
  bpSchema,
  "businessProcesses"
);
