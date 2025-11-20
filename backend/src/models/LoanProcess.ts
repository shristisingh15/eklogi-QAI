import mongoose from "mongoose";

const loanSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  createdAt: { type: Date, default: Date.now }
}, { timestamps: false });

export type LoanProcessDoc = mongoose.InferSchemaType<typeof loanSchema>;
export const LoanProcess = mongoose.model<LoanProcessDoc>("LoanProcess", loanSchema, "loanProcesses");
