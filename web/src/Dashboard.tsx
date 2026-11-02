import { useCallback, useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { EXPLORER, PROGRAM_ID } from "./lib/tipjar";
import {
  ProgramStats,
  TokenBalance,
  TxRow,
  formatTime,
  getProgramStats,
  getRecentTransactions,
  getSolBalance,
  getTokenBalances,
  shortKey,
} from "./lib/chain";

function TxList({ rows }: { rows: TxRow[] }) {
  if (rows.length === 0) return <p className="muted">No transactions yet.</p>;
  return (
    <table className="table">
      <thead>
        <tr><th>Signature</th><th>Time</th><th>Status</th></tr>
      </thead>
      <tbody>
        {rows.map((t) => (
          <tr key={t.signature}>
            <td>
              <a href={EXPLORER("tx", t.signature)} target="_blank" rel="noreferrer">
                {shortKey(t.signature)}
              </a>
            </td>
            <td>{formatTime(t.time)}</td>
            <td className={t.ok ? "ok" : "error"}>{t.ok ? "success" : "failed"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function Dashboard() {
  const { connection } = useConnection();
  const { publicKey } = useWallet();

  const [sol, setSol] = useState<number | null>(null);
  const [tokens, setTokens] = useState<TokenBalance[]>([]);
  const [myTxs, setMyTxs] = useState<TxRow[]>([]);
  const [program, setProgram] = useState<ProgramStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Program activity does not need a wallet
      setProgram(await getProgramStats(connection, PROGRAM_ID));
      if (publicKey) {
        const [balance, tokenList, txs] = await Promise.all([
          getSolBalance(connection, publicKey),
          getTokenBalances(connection, publicKey),
          getRecentTransactions(connection, publicKey, 10),
        ]);
        setSol(balance);
        setTokens(tokenList);
        setMyTxs(txs);
      } else {
        setSol(null);
        setTokens([]);
        setMyTxs([]);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [connection, publicKey]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  return (
    <>
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0 }}>Dashboard</h2>
          <button className="primary" disabled={loading} onClick={refresh}>
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
        {error && <p className="error">{error}</p>}
      </div>

      {publicKey && (
        <div className="card">
          <h2>Balances</h2>
          <div className="stat">
            <span><b>{sol === null ? "..." : sol.toFixed(4)}</b>SOL</span>
            <span><b>{tokens.length}</b>token accounts</span>
          </div>
          {tokens.length > 0 && (
            <table className="table">
              <thead><tr><th>Mint</th><th>Amount</th><th>Program</th></tr></thead>
              <tbody>
                {tokens.map((t) => (
                  <tr key={t.mint}>
                    <td>
                      <a href={EXPLORER("address", t.mint)} target="_blank" rel="noreferrer">
                        {shortKey(t.mint)}
                      </a>
                    </td>
                    <td>{t.amount}</td>
                    <td>{t.program}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {publicKey && (
        <div className="card">
          <h2>My latest transactions</h2>
          <TxList rows={myTxs} />
        </div>
      )}

      <div className="card">
        <h2>Program activity (tip_jar)</h2>
        <p className="muted">
          Program:{" "}
          <a href={EXPLORER("address", PROGRAM_ID.toBase58())} target="_blank" rel="noreferrer">
            {shortKey(PROGRAM_ID.toBase58())}
          </a>
          {program && program.successRate !== null && (
            <> · last {program.recent.length} transactions, {Math.round(program.successRate * 100)}% succeeded</>
          )}
        </p>
        <TxList rows={program?.recent ?? []} />
      </div>
    </>
  );
}
