// Week 9: DeFi integrations (read-only).
//  - Jupiter: swap quote SOL -> USDC (best route across Solana DEXes)
//  - Pyth: SOL/USD oracle price
//
// Endpoints and API keys can be changed in web/.env, because both services
// have changed their access rules over time:
//   VITE_JUPITER_URL      default https://lite-api.jup.ag/swap/v1
//   VITE_JUPITER_API_KEY  optional, sent as x-api-key
//   VITE_PYTH_URL         default https://hermes.pyth.network
//   VITE_PYTH_API_KEY     optional, sent as Authorization: Bearer

export const SOL_MINT = "So11111111111111111111111111111111111111112";
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"; // mainnet USDC

// Pyth price feed id for Crypto.SOL/USD
export const PYTH_SOL_USD =
  "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d";

const JUP_URL: string = import.meta.env.VITE_JUPITER_URL ?? "https://lite-api.jup.ag/swap/v1";
const JUP_KEY: string | undefined = import.meta.env.VITE_JUPITER_API_KEY;
const PYTH_URL: string = import.meta.env.VITE_PYTH_URL ?? "https://hermes.pyth.network";
const PYTH_KEY: string | undefined = import.meta.env.VITE_PYTH_API_KEY;

export interface JupiterQuote {
  inAmount: string;
  outAmount: string;
  priceImpactPct: string;
  routeLabels: string[];
}

/** Quote for swapping `lamports` of SOL into USDC (USDC has 6 decimals). */
export async function getJupiterQuote(lamports: bigint): Promise<JupiterQuote> {
  const params = new URLSearchParams({
    inputMint: SOL_MINT,
    outputMint: USDC_MINT,
    amount: lamports.toString(),
    slippageBps: "50",
  });
  const res = await fetch(`${JUP_URL}/quote?${params}`, {
    headers: JUP_KEY ? { "x-api-key": JUP_KEY } : undefined,
  });
  if (!res.ok) throw new Error(`Jupiter quote failed: HTTP ${res.status}`);
  const q = await res.json();
  return {
    inAmount: q.inAmount,
    outAmount: q.outAmount,
    priceImpactPct: q.priceImpactPct,
    routeLabels: (q.routePlan ?? []).map(
      (r: { swapInfo?: { label?: string } }) => r.swapInfo?.label ?? "unknown"
    ),
  };
}

/** Current SOL price in USD from the Pyth oracle. */
export async function getSolUsdPrice(): Promise<{ usd: number; publishTime: number }> {
  const res = await fetch(
    `${PYTH_URL}/v2/updates/price/latest?ids[]=0x${PYTH_SOL_USD}&parsed=true`,
    { headers: PYTH_KEY ? { Authorization: `Bearer ${PYTH_KEY}` } : undefined }
  );
  if (!res.ok) throw new Error(`Pyth price failed: HTTP ${res.status}`);
  const body = await res.json();
  const p = body.parsed?.[0]?.price;
  if (!p) throw new Error("Pyth returned no price");
  return { usd: Number(p.price) * Math.pow(10, p.expo), publishTime: p.publish_time };
}
