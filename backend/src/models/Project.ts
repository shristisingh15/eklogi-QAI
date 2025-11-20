import mongoose from "mongoose";

const projectSchema = new mongoose.Schema(
  {
    projectName: { type: String, required: true },
    description: { type: String, default: "" },
    projectType: { type: String, default: "Web" },
    date:        { type: String, default: () => new Date().toISOString().split("T")[0] },
    progress:    { type: Number, default: 0 }, // 0–100
  },
  { timestamps: false }
);

export type ProjectDoc = mongoose.InferSchemaType<typeof projectSchema>;

export const Project = mongoose.model<ProjectDoc>(
  "Project",    // model name
  projectSchema,
  "projects"    // collection name
);
