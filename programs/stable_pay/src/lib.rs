use anchor_lang::prelude::*;
use anchor_spl::token::{transfer_checked, Mint, Token, TokenAccount, TransferChecked};

declare_id!("FZmbRa7Vt1PjjVQEi2EmziuKwMaTautei97q9eosncqp");

/// Stablecoin invoice payments.
///
/// A merchant (for example a freelancer) issues an on-chain invoice for a
/// fixed amount of a stablecoin (any SPL token mint, e.g. USDC). A customer
/// pays it in one transaction. The invoice account is a public, verifiable
/// receipt: who paid, how much, in which token and when.
#[program]
pub mod stable_pay {
    use super::*;

    /// Merchant opens an invoice. `invoice_id` is chosen by the merchant
    /// (for example an order number), so every merchant has their own id space.
    pub fn create_invoice(ctx: Context<CreateInvoice>, invoice_id: u64, amount: u64) -> Result<()> {
        require!(amount > 0, PayError::ZeroAmount);

        let invoice = &mut ctx.accounts.invoice;
        invoice.merchant = ctx.accounts.merchant.key();
        invoice.mint = ctx.accounts.mint.key();
        invoice.payer = Pubkey::default();
        invoice.amount = amount;
        invoice.invoice_id = invoice_id;
        invoice.paid = false;
        invoice.paid_at = 0;
        invoice.bump = ctx.bumps.invoice;
        Ok(())
    }

    /// Customer pays the invoice: tokens go straight to the merchant's token
    /// account (CPI to the Token Program) and the invoice is marked as paid.
    pub fn pay_invoice(ctx: Context<PayInvoice>) -> Result<()> {
        require!(!ctx.accounts.invoice.paid, PayError::AlreadyPaid);
        let amount = ctx.accounts.invoice.amount;

        transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.payer_token.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.merchant_token.to_account_info(),
                    authority: ctx.accounts.payer.to_account_info(),
                },
            ),
            amount,
            ctx.accounts.mint.decimals,
        )?;

        let invoice = &mut ctx.accounts.invoice;
        invoice.paid = true;
        invoice.payer = ctx.accounts.payer.key();
        invoice.paid_at = Clock::get()?.unix_timestamp;

        emit!(InvoicePaid {
            invoice: invoice.key(),
            merchant: invoice.merchant,
            payer: invoice.payer,
            mint: invoice.mint,
            amount,
        });
        Ok(())
    }

    /// Merchant cancels an unpaid invoice and gets the rent back.
    pub fn cancel_invoice(_ctx: Context<CancelInvoice>) -> Result<()> {
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(invoice_id: u64)]
pub struct CreateInvoice<'info> {
    #[account(
        init,
        payer = merchant,
        space = 8 + Invoice::INIT_SPACE,
        seeds = [b"invoice", merchant.key().as_ref(), &invoice_id.to_le_bytes()],
        bump
    )]
    pub invoice: Account<'info, Invoice>,
    pub mint: Account<'info, Mint>,
    #[account(mut)]
    pub merchant: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct PayInvoice<'info> {
    #[account(
        mut,
        seeds = [b"invoice", invoice.merchant.as_ref(), &invoice.invoice_id.to_le_bytes()],
        bump = invoice.bump
    )]
    pub invoice: Account<'info, Invoice>,
    #[account(address = invoice.mint)]
    pub mint: Account<'info, Mint>,
    #[account(
        mut,
        token::mint = mint,
        token::authority = payer
    )]
    pub payer_token: Account<'info, TokenAccount>,
    #[account(
        mut,
        token::mint = mint,
        token::authority = invoice.merchant
    )]
    pub merchant_token: Account<'info, TokenAccount>,
    pub payer: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct CancelInvoice<'info> {
    #[account(
        mut,
        close = merchant,
        has_one = merchant,
        constraint = !invoice.paid @ PayError::AlreadyPaid
    )]
    pub invoice: Account<'info, Invoice>,
    #[account(mut)]
    pub merchant: Signer<'info>,
}

#[account]
#[derive(InitSpace)]
pub struct Invoice {
    pub merchant: Pubkey,
    pub mint: Pubkey,
    pub payer: Pubkey,
    pub amount: u64,
    pub invoice_id: u64,
    pub paid: bool,
    pub paid_at: i64,
    pub bump: u8,
}

#[event]
pub struct InvoicePaid {
    pub invoice: Pubkey,
    pub merchant: Pubkey,
    pub payer: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
}

#[error_code]
pub enum PayError {
    #[msg("Invoice amount must be greater than zero")]
    ZeroAmount,
    #[msg("Invoice is already paid")]
    AlreadyPaid,
}
