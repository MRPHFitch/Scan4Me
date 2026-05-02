import { createPublicClient, createWalletClient, http } from "viem";
import type { Address } from "viem";
import { foundry } from "viem/chains";
import { deployContract } from "viem/actions";
import artifact from "../artifacts/contracts/scan4me.sol/Scan4MeMarketplace.json";
import { expect } from "chai";

const { abi, bytecode } = artifact;
//Use a test private key (DO NOT use real keys in production) Using Account#10
const PRIVATE_KEY = "0xf214f2b2cd398c806f84e317254e0f0b801d0643303237d97a22a48e01628897"; // Replace with a test key

const client = createPublicClient({
  chain: foundry,
  transport: http(),
});

// Create a wallet client for signing transactions
const walletClient = createWalletClient({
  chain: foundry,
  transport: http(),
  account: PRIVATE_KEY,
});

describe("Scan4MeMarketplace", function () {
  it("should deploy", async function () {
    const contractAddress: Address = await deployContract(client, {
      abi,
      bytecode: bytecode as `0x${string}`,
      args: [/* constructor args */],
      account: PRIVATE_KEY,
    });
    expect(contractAddress).to.match(/^0x[a-fA-F0-9]{40}$/);
  });
});