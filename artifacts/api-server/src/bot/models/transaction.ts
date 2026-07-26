import mongoose, { Document, Schema } from "mongoose";

export interface ITransaction extends Document {
  txId: string;
  telegramId: number;
  amount: number;
  status: "confirmed" | "rejected";
  createdAt: Date;
}

const TransactionSchema = new Schema<ITransaction>({
  txId: { type: String, required: true, unique: true, index: true },
  telegramId: { type: Number, required: true, index: true },
  amount: { type: Number, required: true },
  status: { type: String, enum: ["confirmed", "rejected"], required: true },
  createdAt: { type: Date, default: Date.now },
});

export const Transaction = mongoose.model<ITransaction>(
  "Transaction",
  TransactionSchema,
);
