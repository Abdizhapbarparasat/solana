import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { assert } from "chai";
import { TipJar } from "../target/types/tip_jar";

describe("tip_jar", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.tipJar as Program<TipJar>;

  const owner = provider.wallet.publicKey;
  const [jar] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("jar"), owner.toBuffer()],
    program.programId
  );

  it("creates a jar", async () => {
    await program.methods
      .createJar("Coffee fund")
      .accountsPartial({ jar, owner })
      .rpc();

    const data = await program.account.jar.fetch(jar);
    assert.equal(data.name, "Coffee fund");
    assert.equal(data.tipCount.toNumber(), 0);
    assert.isTrue(data.owner.equals(owner));
  });

  it("accepts a tip", async () => {
    const amount = new BN(1_000_000); // 0.001 SOL
    await program.methods
      .tip(amount)
      .accountsPartial({ jar, tipper: owner })
      .rpc();

    const data = await program.account.jar.fetch(jar);
    assert.equal(data.totalTips.toNumber(), 1_000_000);
    assert.equal(data.tipCount.toNumber(), 1);
  });

  it("rejects a zero tip", async () => {
    try {
      await program.methods
        .tip(new BN(0))
        .accountsPartial({ jar, tipper: owner })
        .rpc();
      assert.fail("should have thrown");
    } catch (e: any) {
      assert.include(e.toString(), "ZeroAmount");
    }
  });

  it("lets the owner withdraw", async () => {
    const before = await provider.connection.getBalance(owner);
    await program.methods
      .withdraw(new BN(500_000))
      .accountsPartial({ jar, owner })
      .rpc();
    const after = await provider.connection.getBalance(owner);
    assert.isAbove(after, before - 10_000); // gained 0.0005 SOL minus the fee
  });
});
