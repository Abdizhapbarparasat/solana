import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";

// Replace via web/.env: VITE_PROGRAM_ID=<your deployed program id>
export const PROGRAM_ID = new PublicKey(
  import.meta.env.VITE_PROGRAM_ID ?? "Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS"
);

export const EXPLORER = (kind: "tx" | "address", id: string) =>
  `https://explorer.solana.com/${kind}/${id}?cluster=devnet`;

// Anchor instruction discriminator = first 8 bytes of sha256("global:<name>")
async function discriminator(name: string): Promise<Buffer> {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`global:${name}`)
  );
  return Buffer.from(hash).subarray(0, 8);
}

function u64(value: bigint): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(value);
  return buf;
}

export function findJarPda(owner: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("jar"), owner.toBuffer()],
    PROGRAM_ID
  )[0];
}

export async function createJarIx(
  owner: PublicKey,
  name: string
): Promise<TransactionInstruction> {
  const nameBytes = Buffer.from(name, "utf8");
  const len = Buffer.alloc(4);
  len.writeUInt32LE(nameBytes.length);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: findJarPda(owner), isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([await discriminator("create_jar"), len, nameBytes]),
  });
}

export async function tipIx(
  tipper: PublicKey,
  jarOwner: PublicKey,
  lamports: bigint
): Promise<TransactionInstruction> {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: findJarPda(jarOwner), isSigner: false, isWritable: true },
      { pubkey: tipper, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([await discriminator("tip"), u64(lamports)]),
  });
}

export async function withdrawIx(
  owner: PublicKey,
  lamports: bigint
): Promise<TransactionInstruction> {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: findJarPda(owner), isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: true },
    ],
    data: Buffer.concat([await discriminator("withdraw"), u64(lamports)]),
  });
}

export interface JarData {
  owner: PublicKey;
  name: string;
  totalTips: bigint;
  tipCount: bigint;
}

// Layout: 8 (account discriminator) | 32 owner | 4+n name | 8 total | 8 count | 1 bump
export function decodeJar(data: Buffer): JarData {
  let offset = 8;
  const owner = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const nameLen = data.readUInt32LE(offset);
  offset += 4;
  const name = data.subarray(offset, offset + nameLen).toString("utf8");
  offset += nameLen;
  const totalTips = data.readBigUInt64LE(offset);
  offset += 8;
  const tipCount = data.readBigUInt64LE(offset);
  return { owner, name, totalTips, tipCount };
}

// ---------------------------------------------------------------------------
// Week 11: CPI instructions (reward token + memo)
// ---------------------------------------------------------------------------
const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ATA_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

/** Reward mint of a jar. Seeds: ["reward", jar PDA] */
export function findRewardMintPda(jarOwner: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("reward"), findJarPda(jarOwner).toBuffer()],
    PROGRAM_ID
  )[0];
}

export function findAta(owner: PublicKey, mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ATA_PROGRAM_ID
  )[0];
}

/** Associated Token Account program, "create idempotent" (instruction 1). */
export function createAtaIdempotentIx(
  payer: PublicKey,
  owner: PublicKey,
  mint: PublicKey
): TransactionInstruction {
  return new TransactionInstruction({
    programId: ATA_PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: findAta(owner, mint), isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([1]),
  });
}

export async function createRewardMintIx(owner: PublicKey): Promise<TransactionInstruction> {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: findJarPda(owner), isSigner: false, isWritable: false },
      { pubkey: findRewardMintPda(owner), isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: await discriminator("create_reward_mint"),
  });
}

export async function tipWithReceiptIx(
  tipper: PublicKey,
  jarOwner: PublicKey,
  lamports: bigint
): Promise<TransactionInstruction> {
  const mint = findRewardMintPda(jarOwner);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: findJarPda(jarOwner), isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: true },
      { pubkey: findAta(tipper, mint), isSigner: false, isWritable: true },
      { pubkey: tipper, isSigner: true, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: MEMO_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([await discriminator("tip_with_receipt"), u64(lamports)]),
  });
}
