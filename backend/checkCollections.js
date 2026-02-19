/*
  scripts/checkCollections.js
  Quick script to list collections and show first 5 documents from projects_1.
  Usage: node scripts/checkCollections.js
*/
const mongoose = require("mongoose");

const uri = process.env.MONGO_URI ||
  "mongodb+srv://rudranshsharma:excoda@testcluster.3nzv09x.mongodb.net/projectsDB?retryWrites=true&w=majority&appName=TestCluster";

async function run() {
  await mongoose.connect(uri, { maxPoolSize: 5 });
  const db = mongoose.connection.db;
  if (!db) {
    console.error("❌ mongoose.connection.db is undefined — connection failed");
    process.exit(1);
  }

  // list collections
  const collections = await db.listCollections().toArray();
  console.log("Collections:", collections.map(c => c.name).join(", "));

  // Inspect projects_1 specifically (change name if needed)
  const name = "projects_1";
  const exists = collections.some(c => c.name === name);
  if (!exists) {
    console.log(`\nCollection "${name}" not found in DB. Available: ${collections.map(c=>c.name).join(", ")}`);
  } else {
    const docs = await db.collection(name).find({}).limit(5).toArray();
    console.log(`\nFirst ${docs.length} documents from "${name}":`);
    console.dir(docs, { depth: null, colors: true });
    const count = await db.collection(name).countDocuments();
    console.log(`\nTotal documents in "${name}":`, count);
  }

  await mongoose.disconnect();
}

run().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
