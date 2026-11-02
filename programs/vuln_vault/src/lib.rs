use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};

declare_id!("EcDa2ikT8UfSAUabwozsbeqMeTda8zJhXn1f39NrbxuC");

/// WEEK 12 SECURITY LAB: INTENTIONALLY VULNERABLE. DO NOT USE ON MAINNET.
///
/// A vault holds SOL for one authority. Only the authority should be able to
/// withdraw. Can you find the bug? (The answer is in docs/week12.md.)
#[program]
pub mod vuln_vault {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        vault.authority = ctx.accounts.authority.key();
        vault.bump = ctx.bumps.vault;
        Ok(())
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.depositor.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                },
            ),
            amount,
        )
    }

    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        // The code compares the authority's public key with the one stored in
        // the vault, so it LOOKS like an access check.
        require_keys_eq!(
            ctx.accounts.vault.authority,
            ctx.accounts.authority.key(),
            VaultError::WrongAuthority
        );

        let vault_info = ctx.accounts.vault.to_account_info();
        let rent_min = Rent::get()?.minimum_balance(vault_info.data_len());
        let available = vault_info.lamports().saturating_sub(rent_min);
        require!(amount > 0 && amount <= available, VaultError::InsufficientFunds);

        **vault_info.try_borrow_mut_lamports()? -= amount;
        **ctx
            .accounts
            .recipient
            .to_account_info()
            .try_borrow_mut_lamports()? += amount;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + Vault::INIT_SPACE,
        seeds = [b"vault", authority.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, Vault>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(
        mut,
        seeds = [b"vault", vault.authority.as_ref()],
        bump = vault.bump
    )]
    pub vault: Account<'info, Vault>,
    #[account(mut)]
    pub depositor: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(
        mut,
        seeds = [b"vault", vault.authority.as_ref()],
        bump = vault.bump
    )]
    pub vault: Account<'info, Vault>,
    /// CHECK: INTENTIONALLY VULNERABLE. This is not a `Signer`, so nothing
    /// proves that the real authority approved this transaction.
    pub authority: UncheckedAccount<'info>,
    /// Anyone can name any recipient.
    #[account(mut)]
    pub recipient: SystemAccount<'info>,
}

#[account]
#[derive(InitSpace)]
pub struct Vault {
    pub authority: Pubkey,
    pub bump: u8,
}

#[error_code]
pub enum VaultError {
    #[msg("Wrong authority")]
    WrongAuthority,
    #[msg("Not enough withdrawable funds")]
    InsufficientFunds,
}
