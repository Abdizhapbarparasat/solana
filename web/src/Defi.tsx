import { useCallback, useEffect, useState } from "react";
import { getJupiterQuote, getSolUsdPrice, JupiterQuote } from "./lib/defi";

interface Props {
  /** Current tip amount typed by the user, in SOL. */
  tipSol: string;
  /** Lets the panel set the tip amount (USD -> SOL conversion). */
  onPickSol: (sol: string) => void;
}

export default function DefiPanel({ tipSol, onPickSol }: Props) {
  const [price, setPrice] = useState<number | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [usdInput, setUsdInput] = useState("5");
  const [quote, setQuote] = useState<JupiterQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadPrice = useCallback(async () => {
    try {
      const { usd } = await getSolUsdPrice();
      setPrice(usd);
      setPriceError(null);
    } catch (e) {
      setPriceError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    loadPrice();
    const id = setInterval(loadPrice, 30_000);
    return () => clearInterval(id);
  }, [loadPrice]);

  const tipValueUsd = price !== null ? parseFloat(tipSol || "0") * price : null;

  const onUsdToSol = () => {
    if (price === null) return;
    const sol = parseFloat(usdInput) / price;
    if (Number.isFinite(sol) && sol > 0) onPickSol(sol.toFixed(4));
  };

  const onQuote = async () => {
    setLoading(true);
    setQuoteError(null);
    try {
      const lamports = BigInt(Math.round(parseFloat(tipSol) * 1e9));
      setQuote(await getJupiterQuote(lamports));
    } catch (e) {
      setQuote(null);
      setQuoteError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card">
      <h2>DeFi tools</h2>

      <p className="muted">
        SOL price (Pyth oracle):{" "}
        {price !== null ? <b>${price.toFixed(2)}</b> : priceError ? <span className="error">{priceError}</span> : "loading..."}
        {tipValueUsd !== null && <> · your tip is worth about <b>${tipValueUsd.toFixed(2)}</b></>}
      </p>

      <div className="row">
        <input value={usdInput} onChange={(e) => setUsdInput(e.target.value)} />
        <button className="primary" disabled={price === null} onClick={onUsdToSol}>
          Tip this many USD in SOL
        </button>
      </div>

      <div className="row" style={{ marginTop: 16 }}>
        <button className="primary" disabled={loading} onClick={onQuote}>
          {loading ? "Getting quote..." : `Jupiter quote: ${tipSol} SOL -> USDC`}
        </button>
      </div>

      {quote && (
        <p className="muted">
          You would get about <b>{(Number(quote.outAmount) / 1e6).toFixed(2)} USDC</b> · price impact{" "}
          {quote.priceImpactPct} · route: {quote.routeLabels.join(" > ") || "n/a"}
        </p>
      )}
      {quoteError && <p className="error">{quoteError}</p>}

      <p className="muted">
        Quotes are read-only and use mainnet liquidity. Devnet has no real DEX pools, so the
        app never executes the swap.
      </p>
    </div>
  );
}
