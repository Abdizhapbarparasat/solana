use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    instruction::{AccountMeta, Instruction as SolInstruction},
    program::invoke,
    pubkey,
};
use anchor_lang::system_program::{transfer, Transfer};
use anchor_spl::token::{mint_to, Mint, MintTo, Token, TokenAccount};

/// SPL Memo program (v2). Writes a text note into the transaction logs.
pub const MEMO_PROGRAM_ID: Pubkey = pubkey!("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

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

    // ------------------------------------------------------------------
    // Week 11: CPI (cross-program invocation) and composability
    // ------------------------------------------------------------------

    /// Owner creates the jar's reward mint. The mint account is created by a
    /// CPI to the System Program and initialised by a CPI to the Token Program
    /// (both done by Anchor's `init`). The jar PDA becomes the mint authority.
    pub fn create_reward_mint(_ctx: Context<CreateRewardMint>) -> Result<()> {
        Ok(())
    }

    /// Tip with a receipt. One transaction calls three other programs:
    ///   1. System Program: transfers SOL from the tipper to the jar
    ///   2. Token Program:  mints 1 reward token to the tipper (jar PDA signs)
    ///   3. Memo Program:   writes a note into the transaction log
    pub fn tip_with_receipt(ctx: Context<TipWithReceipt>, amount: u64) -> Result<()> {
        require!(amount > 0, TipJarError::ZeroAmount);

        // 1) CPI -> System Program
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

        // 2) CPI -> Token Program, signed by the jar PDA (invoke_signed under the hood)
        let owner_key = ctx.accounts.jar.owner;
        let bump = ctx.accounts.jar.bump;
        let signer_seeds: &[&[&[u8]]] = &[&[b"jar", owner_key.as_ref(), &[bump]]];
        mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.reward_mint.to_account_info(),
                    to: ctx.accounts.tipper_reward_account.to_account_info(),
                    authority: ctx.accounts.jar.to_account_info(),
                },
                signer_seeds,
            ),
            1,
        )?;

        // 3) CPI -> Memo Program (hand-built instruction, no SDK needed)
        let memo = format!(
            "tip_jar: {} lamports to {}",
            amount,
            ctx.accounts.jar.key()
        );
        let memo_ix = SolInstruction {
            program_id: MEMO_PROGRAM_ID,
            accounts: vec![AccountMeta::new_readonly(ctx.accounts.tipper.key(), true)],
            data: memo.into_bytes(),
        };
        invoke(
            &memo_ix,
            &[
                ctx.accounts.tipper.to_account_info(),
                ctx.accounts.memo_program.to_account_info(),
            ],
        )?;

        // Bookkeeping, same as a normal tip
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

#[derive(Accounts)]
pub struct CreateRewardMint<'info> {
    #[account(
        seeds = [b"jar", owner.key().as_ref()],
        bump = jar.bump,
        has_one = owner
    )]
    pub jar: Account<'info, Jar>,
    #[account(
        init,
        payer = owner,
        seeds = [b"reward", jar.key().as_ref()],
        bump,
        mint::decimals = 0,
        mint::authority = jar
    )]
    pub reward_mint: Account<'info, Mint>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct TipWithReceipt<'info> {
    #[account(
        mut,
        seeds = [b"jar", jar.owner.as_ref()],
        bump = jar.bump
    )]
    pub jar: Account<'info, Jar>,
    #[account(
        mut,
        seeds = [b"reward", jar.key().as_ref()],
        bump
    )]
    pub reward_mint: Account<'info, Mint>,
    #[account(
        mut,
        token::mint = reward_mint,
        token::authority = tipper
    )]
    pub tipper_reward_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub tipper: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    /// CHECK: the address is pinned to the SPL Memo program id
    #[account(address = MEMO_PROGRAM_ID)]
    pub memo_program: UncheckedAccount<'info>,
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
