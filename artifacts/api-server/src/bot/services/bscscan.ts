import axios from "axios";
import {
  ADMIN_WALLET,
  BSC_CONFIRMATIONS,
  BSC_RPC_URL,
  USDT_CONTRACT,
} from "../config.js";

const api = axios.create({
  baseURL: BSC_RPC_URL,
  timeout: 15000,
  headers: { "Content-Type": "application/json" },
});

const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a9df523b3ef";

interface RpcLog {
  address: string;
  topics: string[];
  data: string;
}

interface TransactionReceipt {
  status?: string;
  blockNumber?: string;
  logs?: RpcLog[];
}

interface RpcResponse<T> {
  result?: T;
  error?: {
    code: number;
    message: string;
  };
}

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const { data } = await api.post<RpcResponse<T>>("", {
    jsonrpc: "2.0",
    id: 1,
    method,
    params,
  });

  if (data.error) {
    throw new Error(`${data.error.code}: ${data.error.message}`);
  }

  if (data.result === undefined) {
    throw new Error(`RPC returned no result for ${method}`);
  }

  return data.result;
}

function topicAddress(topic: string): string {
  return `0x${topic.slice(-40)}`.toLowerCase();
}

function formatUnits(value: bigint, decimals: number): number {
  const scale = 10n ** BigInt(decimals);
  const whole = value / scale;
  const fraction = (value % scale)
    .toString()
    .padStart(decimals, "0")
    .replace(/0+$/, "");
  const formatted = fraction ? `${whole}.${fraction}` : whole.toString();
  const amount = Number(formatted);

  if (!Number.isFinite(amount)) {
    throw new Error("Transfer amount is too large");
  }

  return amount;
}

export interface VerifyResult {
  valid: boolean;
  amount: number;
  error?: string;
}

export async function verifyUsdtDeposit(txId: string): Promise<VerifyResult> {
  try {
    if (!/^0x[a-fA-F0-9]{64}$/.test(txId)) {
      return { valid: false, amount: 0, error: "Invalid transaction hash." };
    }

    const receipt = await rpc<TransactionReceipt>(
      "eth_getTransactionReceipt",
      [txId],
    );

    if (!receipt) {
      return {
        valid: false,
        amount: 0,
        error: "Transaction not found. Wait for the transaction to be mined.",
      };
    }

    if (receipt.status !== "0x1") {
      return {
        valid: false,
        amount: 0,
        error: "Transaction failed or was reverted.",
      };
    }

    if (!receipt.blockNumber || !receipt.logs) {
      return {
        valid: false,
        amount: 0,
        error: "Transaction receipt is incomplete. Try again later.",
      };
    }

    const latestBlock = await rpc<string>("eth_blockNumber", []);
    const confirmations =
      BigInt(latestBlock) - BigInt(receipt.blockNumber) + 1n;

    if (confirmations < BigInt(BSC_CONFIRMATIONS)) {
      return {
        valid: false,
        amount: 0,
        error: `Only ${confirmations.toString()} confirmation(s). Please wait for ${BSC_CONFIRMATIONS}.`,
      };
    }

    const adminLower = ADMIN_WALLET.toLowerCase();
    const contractLower = USDT_CONTRACT.toLowerCase();

    const matchingLogs = receipt.logs.filter(
      (log) =>
        log.address.toLowerCase() === contractLower &&
        log.topics[0]?.toLowerCase() === TRANSFER_TOPIC &&
        log.topics.length >= 3 &&
        topicAddress(log.topics[2]) === adminLower,
    );

    if (matchingLogs.length === 0) {
      return {
        valid: false,
        amount: 0,
        error:
          "No USDT transfer to admin wallet found in this transaction. Make sure you sent USDT on BSC network.",
      };
    }

    // BSC USDT uses 18 decimals. BigInt avoids precision loss on raw values.
    const rawAmount = matchingLogs.reduce(
      (total, log) => total + BigInt(log.data),
      0n,
    );
    const amount = formatUnits(rawAmount, 18);

    if (amount <= 0) {
      return { valid: false, amount: 0, error: "Transfer amount is zero." };
    }

    return { valid: true, amount };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { valid: false, amount: 0, error: `Verification error: ${msg}` };
  }
}
