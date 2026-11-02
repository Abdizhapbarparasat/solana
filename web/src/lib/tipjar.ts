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
