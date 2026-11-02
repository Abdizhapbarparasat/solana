import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { PublicKey, Transaction } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { assert } from "chai";
import { TipJar } from "../target/types/tip_jar";

const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

describe("tip_jar CPI (week 11)", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.tipJar as Program<TipJar>;
  const owner = provider.wallet.publicKey;

  const [jar] = PublicKey.findProgramAddressSync(
    [Buffer.from("jar"), owner.toBuffer()],
    program.programId
  );
  const [rewardMint] = PublicKey.findProgramAddressSync(
    [Buffer.from("reward"), jar.toBuffer()],
    program.programId
  );
  const tipperAta = getAssociatedTokenAddressSync(rewardMint, owner);

  before(async () => {
    // test files run in alphabetical order, so make sure the jar exists
    if (!(await provider.connection.getAccountInfo(jar))) {
      await program.methods.createJar("CPI jar").accountsPartial({ jar, owner }).rpc();
    }
  });

  it("creates the reward mint (System + Token CPI inside Anchor init)", async () => {
    if (!(await provider.connection.getAccountInfo(rewardMint))) {
      await program.methods
        .createRewardMint()
        .accountsPartial({ jar, rewardMint, owner })
        .rpc();
    }
    const info = await provider.connection.getAccountInfo(rewardMint);
    assert.isNotNull(info);
    assert.isTrue(info!.owner.equals(TOKEN_PROGRAM_ID));
  });

  it("tips with a receipt: System transfer + Token mint_to + Memo in one instruction", async () => {
    const createAta = createAssociatedTokenAccountIdempotentInstruction(
      owner,
      tipperAta,
      owner,
      rewardMint
    );
    const tipIx = await program.methods
      .tipWithReceipt(new BN(1_000_000))
      .accountsPartial({
        jar,
        rewardMint,
        tipperRewardAccount: tipperAta,
        tipper: owner,
        memoProgram: MEMO_PROGRAM_ID,
      })
      .instruction();

    const before = await getAccount(provider.connection, tipperAta).catch(() => null);
    await provider.sendAndConfirm(new Transaction().add(createAta, tipIx));
    const after = await getAccount(provider.connection, tipperAta);

    assert.equal(Number(after.amount) - Number(before?.amount ?? 0), 1);
  });
});
