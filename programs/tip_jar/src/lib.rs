use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};

// Placeholder ID. After `anchor build` run `anchor keys sync` to replace it
// with the ID of your own program keypair.
declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

/// Tip Jar: every wallet can open one "jar" (a PDA). Anyone can send SOL
/// tips to a jar, and only the jar's owner can withdraw them.
#[program]
pub mod tip_jar {
    use super::*;

    /// Creates the jar PDA for the signer.
    pub fn create_jar(ctx: Context<CreateJar>, name: String) -> Result<()> {
        require!(name.len() <= Jar::MAX_NAME, TipJarError::NameTooLong);

        let jar = &mut ctx.accounts.jar;
        jar.owner = ctx.accounts.owner.key();
        jar.name = name;
        jar.total_tips = 0;
        jar.tip_count = 0;
        jar.bump = ctx.bumps.jar;
        Ok(())
    }

    /// Sends `amount` lamports from the tipper to the jar.
    pub fn tip(ctx: Context<Tip>, amount: u64) -> Result<()> {
        require!(amount > 0, TipJarError::ZeroAmount);

        transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.tipper.to_account_info(),
                    to: ctx.accounts.jar.to_account_info(),
                },
            ),
            amount,
        )?;

        let jar = &mut ctx.accounts.jar;
        jar.total_tips = jar
            .total_tips
            .checked_add(amount)
            .ok_or(TipJarError::Overflow)?;
        jar.tip_count = jar.tip_count.checked_add(1).ok_or(TipJarError::Overflow)?;

        emit!(TipReceived {
            jar: jar.key(),
            tipper: ctx.accounts.tipper.key(),
            amount,
        });
        Ok(())
    }

    /// Owner withdraws lamports, keeping the account rent-exempt.
    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        let jar_info = ctx.accounts.jar.to_account_info();
        let rent_min = Rent::get()?.minimum_balance(jar_info.data_len());
        let available = jar_info.lamports().saturating_sub(rent_min);
        require!(
            amount > 0 && amount <= available,
            TipJarError::InsufficientFunds
        );

        **jar_info.try_borrow_mut_lamports()? -= amount;
        **ctx
            .accounts
            .owner
            .to_account_info()
            .try_borrow_mut_lamports()? += amount;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct CreateJar<'info> {
    #[account(
        init,
        payer = owner,
        space = 8 + Jar::INIT_SPACE,
        seeds = [b"jar", owner.key().as_ref()],
        bump
    )]
    pub jar: Account<'info, Jar>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Tip<'info> {
    #[account(
        mut,
        seeds = [b"jar", jar.owner.as_ref()],
        bump = jar.bump
    )]
    pub jar: Account<'info, Jar>,
    #[account(mut)]
    pub tipper: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(
        mut,
        seeds = [b"jar", owner.key().as_ref()],
        bump = jar.bump,
        has_one = owner
    )]
    pub jar: Account<'info, Jar>,
    #[account(mut)]
    pub owner: Signer<'info>,
}

#[account]
#[derive(InitSpace)]
pub struct Jar {
    pub owner: Pubkey,
    #[max_len(32)]
    pub name: String,
    pub total_tips: u64,
    pub tip_count: u64,
    pub bump: u8,
}

impl Jar {
    pub const MAX_NAME: usize = 32;
}

#[event]
pub struct TipReceived {
    pub jar: Pubkey,
    pub tipper: Pubkey,
    pub amount: u64,
}

#[error_code]
pub enum TipJarError {
    #[msg("Jar name is longer than 32 bytes")]
    NameTooLong,
    #[msg("Tip amount must be greater than zero")]
    ZeroAmount,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Not enough withdrawable funds in the jar")]
    InsufficientFunds,
}
