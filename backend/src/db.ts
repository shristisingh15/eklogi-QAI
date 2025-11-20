import mongoose from "mongoose";
import "dotenv/config";

export async function connectDB() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI not set");

  const conn = await mongoose.connect(uri);
  console.log("✅ MongoDB Connected to:", conn.connection.name); // <- DB name
}
