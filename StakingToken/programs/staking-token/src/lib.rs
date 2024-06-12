use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer, Mint};
use std::time::{SystemTime, UNIX_EPOCH};

declare_id!("4Dd4gbfRWDQuNuLTQXifnNSk6Cp75EkAYYRoYgunrqkt");

#[program]
mod staking_token {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let staking_account = &mut ctx.accounts.staking_account;
        staking_account.staker = *ctx.accounts.staker.key;
        staking_account.amount = 0;
        staking_account.reward = 0;
        staking_account.last_staked_time = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs() as i64;
        Ok(())
    }

    pub fn initialize_admin(ctx: Context<InitializeAdmin>) -> Result<()> {
        let admin_account = &mut ctx.accounts.admin_account;
        admin_account.admin = *ctx.accounts.admin.key;
        admin_account.reward_rate = 1; // Default reward rate
        admin_account.penalty_rate = 10; // Default penalty rate
        Ok(())
    }

    pub fn stake(ctx: Context<Stake>, amount: u64) -> Result<()> {
        let cpi_accounts = Transfer {
            from: ctx.accounts.user_token_account.to_account_info(),
            to: ctx.accounts.staking_token_account.to_account_info(),
            authority: ctx.accounts.staker.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, amount)?;

        let staking_account = &mut ctx.accounts.staking_account;
        staking_account.amount += amount;
        staking_account.last_staked_time = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs() as i64;

        emit!(StakeEvent {
            staker: ctx.accounts.staker.key(),
            amount,
        });

        Ok(())
    }

    pub fn unstake(ctx: Context<Unstake>, amount: u64) -> Result<()> {
        let bump = ctx.accounts.staking_account.bump;
        let staking_account_info = ctx.accounts.staking_account.to_account_info();
        
        let staker_key = ctx.accounts.staker.key();
        let seeds = &[b"staking", staker_key.as_ref(), &[bump]];
        let signer = &[&seeds[..]];
        let cpi_accounts = Transfer {
            from: ctx.accounts.staking_token_account.to_account_info(),
            to: ctx.accounts.user_token_account.to_account_info(),
            authority: staking_account_info, // Use pre-fetched account info
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);

        let staking_account = &mut ctx.accounts.staking_account;
        require!(staking_account.amount >= amount, ErrorCode::InsufficientFunds);

        let current_time = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs() as i64;
        let min_staking_period = 7 * 24 * 60 * 60; // 7 days
        if current_time - staking_account.last_staked_time < min_staking_period {
            let penalty = amount / 10; // Example 10% penalty
            staking_account.amount -= penalty;
        }

        token::transfer(cpi_ctx, amount)?;

        staking_account.amount -= amount;

        emit!(UnstakeEvent {
            staker: ctx.accounts.staker.key(),
            amount,
        });

        Ok(())
    }

    pub fn distribute_rewards(ctx: Context<DistributeRewards>) -> Result<()> {
        let staking_account = &mut ctx.accounts.staking_account;
        let current_time = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs() as i64;
        
        let staking_duration = current_time - staking_account.last_staked_time;
        let reward_rate_per_second = 1; // Example reward rate
        let reward = staking_account.amount * staking_duration as u64 * reward_rate_per_second;

        staking_account.reward += reward;
        staking_account.last_staked_time = current_time;
        Ok(())
    }

    pub fn set_reward_rate(ctx: Context<SetAdmin>, new_rate: u64) -> Result<()> {
        let admin_account = &mut ctx.accounts.admin_account;
        admin_account.reward_rate = new_rate;
        Ok(())
    }

    pub fn set_penalty_rate(ctx: Context<SetAdmin>, new_rate: u64) -> Result<()> {
        let admin_account = &mut ctx.accounts.admin_account;
        admin_account.penalty_rate = new_rate;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = staker, space = 8 + 56)]
    pub staking_account: Account<'info, StakingAccount>,
    #[account(mut)]
    pub staker: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct InitializeAdmin<'info> {
    #[account(init, payer = admin, space = 8 + 24)]
    pub admin_account: Account<'info, AdminAccount>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Stake<'info> {
    #[account(mut)]
    pub staking_account: Account<'info, StakingAccount>,
    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub staking_token_account: Account<'info, TokenAccount>,
    pub staker: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Unstake<'info> {
    #[account(mut, has_one = staker)]
    pub staking_account: Account<'info, StakingAccount>,
    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub staking_token_account: Account<'info, TokenAccount>,
    pub staker: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct DistributeRewards<'info> {
    #[account(mut, has_one = staker)]
    pub staking_account: Account<'info, StakingAccount>,
    pub staker: Signer<'info>,
}

#[derive(Accounts)]
pub struct SetAdmin<'info> {
    #[account(mut, has_one = admin)]
    pub admin_account: Account<'info, AdminAccount>,
    pub admin: Signer<'info>,
}

#[account]
pub struct StakingAccount {
    pub staker: Pubkey,
    pub amount: u64,
    pub bump: u8,
    pub reward: u64,
    pub last_staked_time: i64,
}

#[account]
pub struct AdminAccount {
    pub admin: Pubkey,
    pub reward_rate: u64,
    pub penalty_rate: u64,
}

#[event]
pub struct StakeEvent {
    pub staker: Pubkey,
    pub amount: u64,
}

#[event]
pub struct UnstakeEvent {
    pub staker: Pubkey,
    pub amount: u64,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Insufficient funds in staking account")]
    InsufficientFunds,
}
