import mongoose, { Document, Schema } from "mongoose";

export interface IUser extends Document {
  telegramId: number;
  username?: string;
  firstName?: string;
  lastName?: string;
  balance: number;
  totalSpent: number;
  state: string;
  stateData: Record<string, unknown>;
  lastMessageId?: number;
  isBlocked: boolean;
  createdAt: Date;
  lastActive: Date;
}

const UserSchema = new Schema<IUser>({
  telegramId: { type: Number, required: true, unique: true, index: true },
  username: String,
  firstName: String,
  lastName: String,
  balance: { type: Number, default: 0 },
  totalSpent: { type: Number, default: 0 },
  state: { type: String, default: "idle" },
  stateData: { type: Schema.Types.Mixed, default: {} },
  lastMessageId: Number,
  isBlocked: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  lastActive: { type: Date, default: Date.now },
});

export const User = mongoose.model<IUser>("User", UserSchema);

export async function getOrCreateUser(from: {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
}): Promise<IUser> {
  let user = await User.findOne({ telegramId: from.id });
  if (!user) {
    user = await User.create({
      telegramId: from.id,
      username: from.username,
      firstName: from.first_name,
      lastName: from.last_name,
    });
  } else {
    user.username = from.username;
    user.firstName = from.first_name;
    user.lastName = from.last_name;
    user.lastActive = new Date();
    await user.save();
  }
  return user;
}
