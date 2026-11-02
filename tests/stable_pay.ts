import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  createMint,
  getAccount,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { assert } from "chai";
import { StablePay } from "../target/types/stable_pay";

describe("stable_pay (week 13)", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.stablePay as Program<StablePay>;
  const conn = provider.connection;

  const wallet = provider.wallet as anchor.Wallet; // the merchant
  const merchant = wallet.publicKey;
  const customer = Keypair.generate(); // signs payments, needs no SOL (wallet pays the fee)

  const DECIMALS = 6; // like USDC
  const PRICE = 25_000_000; // 25.00 stablecoins
  let mint: PublicKey;
  let merchantToken: PublicKey;
  let customerToken: PublicKey;

  const invoicePda = (id: BN) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("invoice"), merchant.toBuffer(), id.toArrayLike(Buffer, "le", 8)],
      program.programId
    )[0];

  before("create a test stablecoin and fund the customer with 100", async () => {
    mint = await createMint(conn, wallet.payer, merchant, null, DECIMALS);
    merchantToken = (
      await getOrCreateAssociatedTokenAccount(conn, wallet.payer, mint, merchant)
    ).address;
    customerToken = (
      await getOrCreateAssociatedTokenAccount(conn, wallet.payer, mint, customer.publicKey)
    ).address;
    await mintTo(conn, wallet.payer, mint, customerToken, wallet.payer, 100_000_000);
  });

  const id = new BN(Date.now() % 1_000_000_000);
  const invoice = invoicePda(id);

  it("merchant creates an invoice", async () => {
    await program.methods
      .createInvoice(id, new BN(PRICE))
      .accountsPartial({ invoice, mint, merchant })
      .rpc();

    const data = await program.account.invoice.fetch(invoice);
    assert.equal(data.amount.toNumber(), PRICE);
    assert.isFalse(data.paid);
  });

  it("customer pays the invoice in stablecoin", async () => {
    await program.methods
      .payInvoice()
      .accountsPartial({
        invoice,
        mint,
        payerToken: customerToken,
        merchantToken,
        payer: customer.publicKey,
      })
      .signers([customer])
      .rpc();

    const data = await program.account.invoice.fetch(invoice);
    assert.isTrue(data.paid);
    assert.isTrue(data.payer.equals(customer.publicKey));
    assert.equal(Number((await getAccount(conn, merchantToken)).amount), PRICE);
    assert.equal(Number((await getAccount(conn, customerToken)).amount), 100_000_000 - PRICE);
  });

  it("rejects a second payment of the same invoice", async () => {
    let failed = false;
    try {
      await program.methods
        .payInvoice()
        .accountsPartial({
          invoice,
          mint,
          payerToken: customerToken,
          merchantToken,
          payer: customer.publicKey,
        })
        .signers([customer])
        .rpc();
    } catch (e: any) {
      failed = e.toString().includes("AlreadyPaid");
    }
    assert.isTrue(failed, "double payment must fail with AlreadyPaid");
  });

  it("merchant can cancel an unpaid invoice, but not a paid one", async () => {
    const id2 = new BN((Date.now() + 1) % 1_000_000_000);
    const invoice2 = invoicePda(id2);
    await program.methods
      .createInvoice(id2, new BN(PRICE))
      .accountsPartial({ invoice: invoice2, mint, merchant })
      .rpc();
    await program.methods.cancelInvoice().accountsPartial({ invoice: invoice2, merchant }).rpc();
    assert.isNull(await conn.getAccountInfo(invoice2));

    let failed = false;
    try {
      await program.methods.cancelInvoice().accountsPartial({ invoice, merchant }).rpc();
    } catch {
      failed = true;
    }
    assert.isTrue(failed, "a paid invoice cannot be cancelled");
  });
});
