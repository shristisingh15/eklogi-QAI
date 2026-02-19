import mongoose from "mongoose";
import { ProjectFile } from "../src/models/ProjectFiles";

// read from .env
const MONGO_URI =
  process.env.MONGO_URI ||
  "mongodb+srv://rudranshsharma:excoda@testcluster.3nzv09x.mongodb.net/projectsDB?retryWrites=true&w=majority&appName=TestCluster";

async function main() {
  try {
    console.log("🔗 Connecting to Mongo...");
    await mongoose.connect(MONGO_URI);

    const files = await ProjectFile.find(
      {},
      { filename: 1, version: 1, uploadedAt: 1 }
    ).lean();

    console.log("📂 Uploaded files:");
    console.table(files);

    await mongoose.disconnect();
    console.log("✅ Done");
  } catch (err) {
    console.error("❌ Error:", err);
    process.exit(1);
  }
}

main();
