import mongoose from "mongoose";

const uri = "mongodb+srv://rudranshsharma:excoda@testcluster.3nzv09x.mongodb.net/projectsDB?retryWrites=true&w=majority&appName=TestCluster";

async function main() {
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    console.log("✅ Connected to MongoDB Atlas");
    await mongoose.disconnect();
  } catch (err) {
    console.error("❌ Connection failed:", err);
  }
}

main();
