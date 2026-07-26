import mongoose, { Document, Schema } from "mongoose";

export interface IUserActivity extends Document {
  telegramId: number;
  username?: string;
  firstName?: string;
  date: string; // YYYY-MM-DD in BD timezone
  buys: number;
  cancels: number;
  otps: number;
  spent: number;
  serviceBreakdown: Array<{
    service: string;
    countryName: string;
    count: number;
    revenue: number;
  }>;
}

const UserActivitySchema = new Schema<IUserActivity>({
  telegramId: { type: Number, required: true, index: true },
  username: String,
  firstName: String,
  date: { type: String, required: true, index: true },
  buys: { type: Number, default: 0 },
  cancels: { type: Number, default: 0 },
  otps: { type: Number, default: 0 },
  spent: { type: Number, default: 0 },
  serviceBreakdown: [
    {
      service: String,
      countryName: String,
      count: { type: Number, default: 0 },
      revenue: { type: Number, default: 0 },
    },
  ],
});

UserActivitySchema.index({ telegramId: 1, date: 1 }, { unique: true });

export const UserActivity = mongoose.model<IUserActivity>(
  "UserActivity",
  UserActivitySchema,
);

export function getBdDate(): string {
  const now = new Date();
  const bdOffset = 6 * 60 * 60 * 1000;
  const bdTime = new Date(now.getTime() + bdOffset);
  return bdTime.toISOString().slice(0, 10);
}

export async function recordActivity(
  telegramId: number,
  username: string | undefined,
  firstName: string | undefined,
  field: "buys" | "cancels" | "otps",
  amount: number,
  spent: number,
  service?: string,
  countryName?: string,
): Promise<void> {
  const date = getBdDate();
  const inc: Record<string, number> = {
    [field]: 1,
    spent,
  };
  const update: Record<string, unknown> = {
    $inc: inc,
    $set: { username, firstName },
  };

  if (field === "otps" && service && countryName) {
    update["$push"] = {
      serviceBreakdown: {
        service,
        countryName,
        count: 1,
        revenue: amount,
      },
    };
  }

  await UserActivity.findOneAndUpdate({ telegramId, date }, update, {
    upsert: true,
  });
}
