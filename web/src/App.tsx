import { useCallback, useEffect, useMemo, useState } from "react";
import { clusterApiUrl, LAMPORTS_PER_SOL, PublicKey, Transaction } from "@solana/web3.js";
import {
  ConnectionProvider,
  WalletProvider,
  useConnection,
  useWallet,
} from "@solana/wallet-adapter-react";
import {
  WalletModalProvider,
  WalletMultiButton,
} from "@solana/wallet-adapter-react-ui";
import {
  EXPLORER,
  JarData,
  createJarIx,
  decodeJar,
  findJarPda,
  tipIx,
  withdrawIx,
} from "./lib/tipjar";
import DefiPanel from "./Defi";

type Status = { kind: "info" | "error"; text: string; sig?: string } | null;

function TipJarApp() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();

  const [myJar, setMyJar] = useState<JarData | null>(null);
  const [jarName, setJarName] = useState("My tip jar");
  const [targetOwner, setTargetOwner] = useState("");
  const [tipSol, setTipSol] = useState("0.01");
  const [withdrawSol, setWithdrawSol] = useState("0.005");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  const loadMyJar = useCallback(async () => {
    if (!publicKey) {
      setMyJar(null);
      return;
    }
    const info = await connection.getAccountInfo(findJarPda(publicKey));
    setMyJar(info ? decodeJar(info.data as Buffer) : null);
  }, [connection, publicKey]);

  useEffect(() => {
    loadMyJar().catch(() => setMyJar(null));
  }, [loadMyJar]);

  const send = async (label: string, build: () => Promise<Transaction>) => {
    if (!publicKey) return;
    setBusy(true);
    setStatus({ kind: "info", text: `${label}: confirm in your wallet...` });
    try {
      const tx = await build();
      const sig = await sendTransaction(tx, connection);
      const latest = await connection.getLatestBlockhash();
      await connection.confirmTransaction({ signature: sig, ...latest }, "confirmed");
      setStatus({ kind: "info", text: `${label}: done.`, sig });
      await loadMyJar();
    } catch (e) {
      setStatus({ kind: "error", text: `${label} failed: ${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  };

  const toLamports = (sol: string) => BigInt(Math.round(parseFloat(sol) * LAMPORTS_PER_SOL));

  const onCreate = () =>
    send("Create jar", async () => new Transaction().add(await createJarIx(publicKey!, jarName)));

  const onTip = () =>
    send("Send tip", async () => {
      const owner = new PublicKey(targetOwner.trim());
      return new Transaction().add(await tipIx(publicKey!, owner, toLamports(tipSol)));
    });

  const onWithdraw = () =>
    send("Withdraw", async () =>
      new Transaction().add(await withdrawIx(publicKey!, toLamports(withdrawSol)))
    );

  return (
    <div className="page">
      <header>
        <h1>Tip Jar on Solana (devnet)</h1>
        <WalletMultiButton />
      </header>

      {!publicKey && (
        <div className="card muted">Connect a wallet (Phantom, Solflare...) set to Devnet.</div>
      )}

      {publicKey && (
        <div className="card">
          <h2>My jar</h2>
          {myJar ? (
            <>
              <div className="stat">
                <span><b>{myJar.name}</b>name</span>
                <span><b>{(Number(myJar.totalTips) / LAMPORTS_PER_SOL).toFixed(4)} SOL</b>received</span>
                <span><b>{myJar.tipCount.toString()}</b>tips</span>
              </div>
              <div className="row">
                <input value={withdrawSol} onChange={(e) => setWithdrawSol(e.target.value)} />
                <button className="primary" disabled={busy} onClick={onWithdraw}>
                  Withdraw SOL
                </button>
              </div>
              <p className="muted">
                Share this address so people can tip you: <code>{publicKey.toBase58()}</code>
              </p>
            </>
          ) : (
            <div className="row">
              <input value={jarName} maxLength={32} onChange={(e) => setJarName(e.target.value)} />
              <button className="primary" disabled={busy} onClick={onCreate}>
                Create jar
              </button>
            </div>
          )}
        </div>
      )}

      {publicKey && (
        <div className="card">
          <h2>Tip someone</h2>
          <div className="row">
            <input
              placeholder="Jar owner address"
              value={targetOwner}
              onChange={(e) => setTargetOwner(e.target.value)}
            />
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <input value={tipSol} onChange={(e) => setTipSol(e.target.value)} />
            <button className="primary" disabled={busy || !targetOwner} onClick={onTip}>
              Send tip (SOL)
            </button>
          </div>
        </div>
      )}

      <DefiPanel tipSol={tipSol} onPickSol={setTipSol} />

      {status && (
        <div className={`status ${status.kind === "error" ? "error" : ""}`}>
          {status.text}{" "}
          {status.sig && (
            <a href={EXPLORER("tx", status.sig)} target="_blank" rel="noreferrer">
              View on Explorer
            </a>
          )}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const endpoint = useMemo(
    () => import.meta.env.VITE_RPC_URL ?? clusterApiUrl("devnet"),
    []
  );
  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={[]} autoConnect>
        <WalletModalProvider>
          <TipJarApp />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
