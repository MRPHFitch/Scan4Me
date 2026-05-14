import "dotenv/config";
import hre from "hardhat";
import fs from "node:fs";
import { createWalletClient, http, createPublicClient, getContract } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

async function main() {
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  const privateKey = process.env.PRIVATE_KEY;
  const contractAddress = process.env.CONTRACT_ADDRESS;
  const oracleUrl = process.env.VERIFICATION_ORACLE_URL;

  if (!rpcUrl || !privateKey || !contractAddress) {
    throw new Error("Missing one or more required .env values");
  }

  const source = fs.readFileSync("./functions/verificationSource.js", "utf8");

  const normalizedPrivateKey = privateKey.startsWith("0x")
    ? privateKey
    : `0x${privateKey}`;

  const account = privateKeyToAccount(normalizedPrivateKey as `0x${string}`);

  const artifact = await hre.artifacts.readArtifact("Scan4MeMarketplace");

  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http(rpcUrl),
  });

  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(rpcUrl),
  });

  const contract = getContract({
    address: contractAddress as `0x${string}`,
    abi: artifact.abi,
    client: walletClient,
  });

  const sourceHash = await contract.write.setVerificationSourceCode([source]);
  console.log("setVerificationSourceCode tx:", sourceHash);

  if (oracleUrl && oracleUrl.trim().length > 0) {
    const urlHash = await contract.write.setVerificationOracleUrl([oracleUrl]);
    console.log("setVerificationOracleUrl tx:", urlHash);
  } else {
    console.log("VERIFICATION_ORACLE_URL not set, skipping setVerificationOracleUrl");
  }

  // Wait for the first tx to confirm just to be safe
  const receipt = await publicClient.waitForTransactionReceipt({ hash: sourceHash });
  console.log("Source update confirmed in block:", receipt.blockNumber);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});