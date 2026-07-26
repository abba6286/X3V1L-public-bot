import mongoose from "mongoose";
import { MONGODB_URI } from "./config.js";
import { logger } from "../lib/logger.js";

let connected = false;

export async function connectDatabase(): Promise<void> {
  if (connected) return;
  await mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
  });
  connected = true;
  logger.info("MongoDB connected");
}

export default mongoose;
