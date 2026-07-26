import mongoose, { Document, Schema } from "mongoose";

export interface IBotConfig extends Document {
  key: string;
  value: string | number | string[];
}

const BotConfigSchema = new Schema<IBotConfig>({
  key: { type: String, required: true, unique: true, index: true },
  value: { type: Schema.Types.Mixed, required: true },
});

export const BotConfig = mongoose.model<IBotConfig>("BotConfig", BotConfigSchema);

export async function getConfig(key: string): Promise<string | number | string[] | null> {
  const doc = await BotConfig.findOne({ key });
  return doc ? doc.value : null;
}

export async function setConfig(key: string, value: string | number | string[]): Promise<void> {
  await BotConfig.findOneAndUpdate({ key }, { value }, { upsert: true });
}

export async function getExtraMargin(): Promise<number> {
  const val = await getConfig("extraMargin");
  return typeof val === "number" ? val : 0;
}

export async function getMaxActiveNumbers(): Promise<number> {
  const val = await getConfig("maxActiveNumbers");
  return typeof val === "number" ? val : 3;
}

export async function getForceJoinChannels(): Promise<string[]> {
  const val = await getConfig("forceJoinChannels");
  if (Array.isArray(val)) return val;
  if (typeof val === "string" && val) return val.split(",").map((s) => s.trim());
  return [];
}
