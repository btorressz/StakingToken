import BN from "bn.js";
import * as web3 from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
// Client

import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import { StakingToken } from "../target/types/staking_token";
import { TOKEN_PROGRAM_ID, createMint, createAccount, mintTo } from "@solana/spl-token";
import { web3 } from "@solana/web3.js";
import type { StakingToken } from "../target/types/staking_token";

// Configure the client to use the local cluster
anchor.setProvider(anchor.AnchorProvider.env());

const program = anchor.workspace.StakingToken as anchor.Program<StakingToken>;


const provider = AnchorProvider.env();
anchor.setProvider(provider);

const program = anchor.workspace.StakingToken as Program<StakingToken>;

const main = async () => {
  console.log("My address:", provider.wallet.publicKey.toString());
  const balance = await provider.connection.getBalance(provider.wallet.publicKey);
  console.log(`My balance: ${balance / web3.LAMPORTS_PER_SOL} SOL`);

  const [stakingPDA, stakingBump] = await anchor.web3.PublicKey.findProgramAddress(
    [Buffer.from("staking"), provider.wallet.publicKey.toBuffer()],
    program.programId
  );

  const [adminPDA, adminBump] = await anchor.web3.PublicKey.findProgramAddress(
    [Buffer.from("admin")],
    program.programId
  );

  const mint = await createMint(
    provider.connection,
    provider.wallet.payer,
    provider.wallet.publicKey,
    null,
    0,
    TOKEN_PROGRAM_ID
  );

  const userTokenAccount = await createAccount(
    provider.connection,
    provider.wallet.payer,
    mint,
    provider.wallet.publicKey
  );

  const stakingTokenAccount = await createAccount(
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

  console.log("Initializing staking account...");
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

  console.log("Staking tokens...");
  await program.methods
    .stake(new anchor.BN(100))
    .accounts({
      stakingAccount: stakingPDA,
      userTokenAccount: userTokenAccount,
      stakingTokenAccount: stakingTokenAccount,
      staker: provider.wallet.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([provider.wallet.payer])
    .rpc();

  console.log("Unstaking tokens...");
  await program.methods
    .unstake(new anchor.BN(50))
    .accounts({
      stakingAccount: stakingPDA,
      userTokenAccount: userTokenAccount,
      stakingTokenAccount: stakingTokenAccount,
      staker: provider.wallet.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([provider.wallet.payer])
    .rpc();

  console.log("Distributing rewards...");
  await program.methods
    .distributeRewards()
    .accounts({
      stakingAccount: stakingPDA,
      staker: provider.wallet.publicKey,
    })
    .rpc();

  console.log("Setting reward rate...");
  await program.methods
    .initializeAdmin()
    .accounts({
      adminAccount: adminPDA,
      admin: provider.wallet.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .signers([provider.wallet.payer])
    .rpc();

  await program.methods
    .setRewardRate(new anchor.BN(2)) // Example new reward rate
    .accounts({
      adminAccount: adminPDA,
      admin: provider.wallet.publicKey,
    })
    .rpc();

  console.log("Setting penalty rate...");
  await program.methods
    .setPenaltyRate(new anchor.BN(5)) // Example new penalty rate
    .accounts({
      adminAccount: adminPDA,
      admin: provider.wallet.publicKey,
    })
    .rpc();

  console.log("All operations completed.");
};

main().catch(err => {
  console.error(err);
});

/*console.log("My address:", program.provider.publicKey.toString());
const balance = await program.provider.connection.getBalance(program.provider.publicKey);
console.log(`My balance: ${balance / web3.LAMPORTS_PER_SOL} SOL`);*/
