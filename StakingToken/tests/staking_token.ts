import BN from "bn.js";
import * as web3 from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { StakingToken } from "../target/types/staking_token";
import { TOKEN_PROGRAM_ID, createMint, createAccount, mintTo } from "@solana/spl-token";
import { expect } from "chai";
import type { StakingToken } from "../target/types/staking_token";

describe("staking_token", () => {
  // Configure the client to use the local cluster
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.StakingToken as anchor.Program<StakingToken>;
  
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.StakingToken as Program<StakingToken>;

  let mint = null;
  let userTokenAccount = null;
  let stakingTokenAccount = null;
  let stakingAccount = null;
  let adminAccount = null;
  const adminKey = provider.wallet.publicKey;

  it("Initializes the staking account", async () => {
    const [stakingPDA, bump] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("staking"), provider.wallet.publicKey.toBuffer()],
      program.programId
    );

    const [adminPDA, _] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("admin")],
      program.programId
    );

    mint = await createMint(
      provider.connection,
      provider.wallet.payer,
      provider.wallet.publicKey,
      null,
      0,
      TOKEN_PROGRAM_ID
    );

    userTokenAccount = await createAccount(
      provider.connection,
      provider.wallet.payer,
      mint,
      provider.wallet.publicKey
    );

    stakingTokenAccount = await createAccount(
      provider.connection,
      provider.wallet.payer,
      mint,
      stakingPDA
    );

    await mintTo(
      provider.connection,
      provider.wallet.payer,
      mint,
      userTokenAccount,
      provider.wallet.publicKey,
      1000
    );

    await program.methods
      .initialize()
      .accounts({
        stakingAccount: stakingPDA,
        staker: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([provider.wallet.payer])
      .rpc();

    stakingAccount = stakingPDA;

    await program.methods
      .initializeAdmin()
      .accounts({
        adminAccount: adminPDA,
        admin: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([provider.wallet.payer])
      .rpc();

    adminAccount = adminPDA;
  });

  it("Stakes tokens", async () => {
    await program.methods
      .stake(new anchor.BN(100))
      .accounts({
        stakingAccount: stakingAccount,
        userTokenAccount: userTokenAccount,
        stakingTokenAccount: stakingTokenAccount,
        staker: provider.wallet.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([provider.wallet.payer])
      .rpc();

    const stakingAccountData = await program.account.stakingAccount.fetch(stakingAccount);
    expect(stakingAccountData.amount.toNumber()).to.equal(100);
  });

  it("Unstakes tokens", async () => {
    await program.methods
      .unstake(new anchor.BN(50))
      .accounts({
        stakingAccount: stakingAccount,
        userTokenAccount: userTokenAccount,
        stakingTokenAccount: stakingTokenAccount,
        staker: provider.wallet.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([provider.wallet.payer])
      .rpc();

    const stakingAccountData = await program.account.stakingAccount.fetch(stakingAccount);
    expect(stakingAccountData.amount.toNumber()).to.equal(50);
  });

  it("Distributes rewards", async () => {
    await program.methods
      .distributeRewards()
      .accounts({
        stakingAccount: stakingAccount,
        staker: provider.wallet.publicKey,
      })
      .rpc();

    const stakingAccountData = await program.account.stakingAccount.fetch(stakingAccount);
    expect(stakingAccountData.reward.toNumber()).to.be.greaterThan(0);
  });

  it("Penalizes early unstaking", async () => {
    // Stake again to ensure there are tokens to unstake
    await program.methods
      .stake(new anchor.BN(100))
      .accounts({
        stakingAccount: stakingAccount,
        userTokenAccount: userTokenAccount,
        stakingTokenAccount: stakingTokenAccount,
        staker: provider.wallet.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([provider.wallet.payer])
      .rpc();

    // Unstake immediately to trigger penalty
    await program.methods
      .unstake(new anchor.BN(20))
      .accounts({
        stakingAccount: stakingAccount,
        userTokenAccount: userTokenAccount,
        stakingTokenAccount: stakingTokenAccount,
        staker: provider.wallet.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([provider.wallet.payer])
      .rpc();

    const stakingAccountData = await program.account.stakingAccount.fetch(stakingAccount);
    expect(stakingAccountData.amount.toNumber()).to.be.lessThan(130); // Less than original stake - penalty
  });

  it("Sets reward rate", async () => {
    await program.methods
      .setRewardRate(new anchor.BN(2)) // Example new reward rate
      .accounts({
        adminAccount: adminAccount,
        admin: provider.wallet.publicKey,
      })
      .rpc();

    const adminAccountData = await program.account.adminAccount.fetch(adminAccount);
    expect(adminAccountData.rewardRate.toNumber()).to.equal(2);
  });

  it("Sets penalty rate", async () => {
    await program.methods
      .setPenaltyRate(new anchor.BN(5)) // Example new penalty rate
      .accounts({
        adminAccount: adminAccount,
        admin: provider.wallet.publicKey,
      })
      .rpc();

    const adminAccountData = await program.account.adminAccount.fetch(adminAccount);
    expect(adminAccountData.penaltyRate.toNumber()).to.equal(5);
  });
});
