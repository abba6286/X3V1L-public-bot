import axios from "axios";
import { BSCSCAN_API_KEY, BSCSCAN_BASE, ADMIN_WALLET, USDT_CONTRACT } from "../config.js";

const api = axios.create({ baseURL: BSCSCAN_BASE, timeout: 15000 });

interface TokenTransferEvent {
  blockHash: string;
  blockNumber: string;
  confirmations: string;
  contractAddress: string;
  from: string;
  to: string;
  tokenDecimal: string;
  tokenName: string;
  tokenSymbol: string;
  value: string;
  txreceipt_status?: string;
  isError?: string;
  hash: string;
  timeStamp: string;
}

interface TxResult {
  status: string;
  message: string;
  result: TokenTransferEvent[] | string;
}

export interface VerifyResult {
  valid: boolean;
  amount: number;
  error?: string;
}

export async function verifyUsdtDeposit(txId: string): Promise<VerifyResult> {
  try {
    // Get BEP-20 token transfer events for this tx hash
    const { data } = await api.get<TxResult>("", {
      params: {
        module: "account",
        action: "tokentx",
        txhash: txId,
        apikey: BSCSCAN_API_KEY,
      },
    });

    if (data.status !== "1" || !Array.isArray(data.result)) {
      // Also try checking tx status directly
      const { data: txData } = await api.get<TxResult>("", {
        params: {
          module: "proxy",
          action: "eth_getTransactionReceipt",
          txhash: txId,
          apikey: BSCSCAN_API_KEY,
        },
      });

      return {
        valid: false,
        amount: 0,
        error: `Transaction not found or failed. BSCScan response: ${data.message}`,
      };
    }

    const transfers = data.result as TokenTransferEvent[];

    // Find the USDT transfer to admin wallet
    const adminLower = ADMIN_WALLET.toLowerCase();
    const contractLower = USDT_CONTRACT.toLowerCase();

    const matching = transfers.find(
      (t) =>
        t.contractAddress.toLowerCase() === contractLower &&
        t.to.toLowerCase() === adminLower,
    );

    if (!matching) {
      return {
        valid: false,
        amount: 0,
        error:
          "No USDT transfer to admin wallet found in this transaction. Make sure you sent USDT on BSC network.",
      };
    }

    // USDT has 18 decimals on BSC
    const decimals = parseInt(matching.tokenDecimal, 10) || 18;
    const amount = parseInt(matching.value, 10) / Math.pow(10, decimals);

    if (amount <= 0) {
      return { valid: false, amount: 0, error: "Transfer amount is zero." };
    }

    return { valid: true, amount };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { valid: false, amount: 0, error: `Verification error: ${msg}` };
  }
}
