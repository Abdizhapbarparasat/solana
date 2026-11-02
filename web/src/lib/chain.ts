// Week 10: reading blockchain data through the RPC API.
import { Connection, PublicKey } from "@solana/web3.js";

export const TOKEN_PROGRAM = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
export const TOKEN_2022_PROGRAM = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

export interface TokenBalance {
  mint: string;
  amount: string; // human readable, already divided by decimals
  program: "Token" | "Token-2022";
}

export interface TxRow {
  signature: string;
  time: number | null; // unix seconds
  ok: boolean;
  slot: number;
}

export interface ProgramStats {
  recent: TxRow[];
  successRate: number | null; // 0..1
}

/** SOL balance in SOL. RPC method: getBalance */
export async function getSolBalance(c: Connection, owner: PublicKey): Promise<number> {
  return (await c.getBalance(owner)) / 1e9;
}

/** All SPL token balances of the wallet. RPC method: getParsedTokenAccountsByOwner */
export async function getTokenBalances(c: Connection, owner: PublicKey): Promise<TokenBalance[]> {
  const programs: [PublicKey, TokenBalance["program"]][] = [
    [TOKEN_PROGRAM, "Token"],
    [TOKEN_2022_PROGRAM, "Token-2022"],
  ];
  const out: TokenBalance[] = [];
  for (const [programId, label] of programs) {
    const res = await c.getParsedTokenAccountsByOwner(owner, { programId });
    for (const { account } of res.value) {
      const info = account.data.parsed.info;
      const amount: string = info.tokenAmount.uiAmountString ?? "0";
      if (amount !== "0") out.push({ mint: info.mint, amount, program: label });
    }
  }
  return out;
}

/** Latest transactions that touched an address. RPC method: getSignaturesForAddress */
export async function getRecentTransactions(
  c: Connection,
  address: PublicKey,
  limit = 10
): Promise<TxRow[]> {
  const sigs = await c.getSignaturesForAddress(address, { limit });
  return sigs.map((s) => ({
    signature: s.signature,
    time: s.blockTime ?? null,
    ok: s.err === null,
    slot: s.slot,
  }));
}

/** Activity of a program: last transactions and how many succeeded. */
export async function getProgramStats(
  c: Connection,
  programId: PublicKey,
  limit = 20
): Promise<ProgramStats> {
  const recent = await getRecentTransactions(c, programId, limit);
  const successRate = recent.length ? recent.filter((t) => t.ok).length / recent.length : null;
  return { recent, successRate };
}

export const shortKey = (s: string) => `${s.slice(0, 4)}...${s.slice(-4)}`;

export const formatTime = (unix: number | null) =>
  unix ? new Date(unix * 1000).toLocaleString() : "pending";
