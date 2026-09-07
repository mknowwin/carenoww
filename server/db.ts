import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/carenoww";

let isConnected = false;

export async function connectDB() {
  if (isConnected) return;
  try {
    console.log("🔗 Connecting to MongoDB...", MONGODB_URI);
    await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    isConnected = true;
    console.log("✅ MongoDB connected:", MONGODB_URI);
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err);
    throw err;
  }
}

mongoose.connection.on("disconnected", () => {
  isConnected = false;
  console.warn("⚠️  MongoDB disconnected");
});

export default mongoose;
