import mongoose from "mongoose";

const projectFileSchema = new mongoose.Schema(
  {
    projectId:  { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true },
    filename:   { type: String, required: true },   // ✅ keep this
    mimetype:   { type: String, required: true },
    size:       { type: Number, required: true },
    data:       { type: Buffer, required: true },
    uploadedAt: { type: Date, default: Date.now },
    version:    { type: String, required: true },   // e.g. v1.0, v2.0
  },
  { timestamps: false }
);

export type ProjectFileDoc = mongoose.InferSchemaType<typeof projectFileSchema>;

export const ProjectFile = mongoose.model<ProjectFileDoc>(
  "ProjectFile",
  projectFileSchema,
  "projectFiles"
);
