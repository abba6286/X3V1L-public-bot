import mongoose, { Document, Schema } from "mongoose";

export interface IActiveNumber extends Document {
  telegramId: number;
  activationId: string;
  phoneNumber: string;
  countryId: number;
  countryName: string;
  service: "tg" | "wa";
  providerId: number;
  price: number;
  apiPrice: number;
  messageId: number;
  purchasedAt: Date;
  expiresAt: Date;
  status: "active" | "completed" | "cancelled" | "expired";
  balanceDeducted: boolean;
}

const ActiveNumberSchema = new Schema<IActiveNumber>({
  telegramId: { type: Number, required: true, index: true },
  activationId: { type: String, required: true, unique: true, index: true },
  phoneNumber: { type: String, required: true },
  countryId: { type: Number, required: true },
  countryName: { type: String, required: true },
  service: { type: String, enum: ["tg", "wa"], required: true },
  providerId: { type: Number, required: true },
  price: { type: Number, required: true },
  apiPrice: { type: Number, required: true },
  messageId: { type: Number, default: 0 },
  purchasedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
  status: {
    type: String,
    enum: ["active", "completed", "cancelled", "expired"],
    default: "active",
  },
  balanceDeducted: { type: Boolean, default: false },
});

export const ActiveNumber = mongoose.model<IActiveNumber>(
  "ActiveNumber",
  ActiveNumberSchema,
);
