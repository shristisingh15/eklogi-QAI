import mongoose from "mongoose";

const uri = "mongodb+srv://rudranshsharma:excoda@testcluster.3nzv09x.mongodb.net/projectsDB?retryWrites=true&w=majority&appName=TestCluster";

async function run() {
  await mongoose.connect(uri);

  const db = mongoose.connection.db!;
  const collections = await db.listCollections().toArray();
  console.log("Collections:", collections.map(c => c.name));

  for (const { name } of collections) {
    const docs = await db.collection(name).find().limit(3).toArray();
    console.log(`\n📂 ${name}:`);
    console.dir(docs, { depth: null });
  }

  await mongoose.disconnect();
}
run().catch(console.error);
