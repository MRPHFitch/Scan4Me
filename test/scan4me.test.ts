import { createPublicClient, createWalletClient, http } from "viem";
import type { Address } from "viem";
import { foundry } from "viem/chains";
import { deployContract } from "viem/actions";
import artifact from "../artifacts/contracts/scan4me.sol/Scan4MeMarketplace.json";
import { expect } from "chai";
import * as chai from "chai";
import chaiAsPromised from "chai-as-promised";
chai.use(chaiAsPromised);

//Use a test private key (DO NOT use real keys in production)
//Using Account#10 for Creator
const CREATOR_KEY = "0xf214f2b2cd398c806f84e317254e0f0b801d0643303237d97a22a48e01628897"; // Replace with a test key
//Using Account#17 for Acceptor
const ACCEPTOR_KEY="0x689af8efa8c651a91ad287602527f3af2fe9f6501a7ac4b061667b5a93e037fd"
//Using Account#7 for Random account
const RANDO_KEY= "0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356"

//Fix to retrieve from counter or something for deployment
const REQUEST_ID=0;

type ScanRequest = {
  requestor: string;
  location: string;
  scanType: number;
  payment: bigint;
  scanner: string;
  accepted: boolean;
  fulfilled: boolean;
  verificationStatus: number;
  scanDataUri: string;
  requiredScans: number;
  submissions: number;
  verificationRequestId: string;
};

const { abi, bytecode } = artifact;

const client = createPublicClient({
  chain: foundry,
  transport: http(),
});

// Create wallets for signing transactions
const creatorWalletClient = createWalletClient({
  chain: foundry,
  transport: http(),
  account: CREATOR_KEY,
});
const acceptorWalletClient = createWalletClient({
  chain: foundry,
  transport: http(),
  account: ACCEPTOR_KEY,
});
const randoWalletClient = createWalletClient({
  chain: foundry,
  transport: http(),
  account: RANDO_KEY,
});

describe("Scan4MeMarketplace", function () {
  let contractAddress: Address;

  beforeEach(async function () {
    contractAddress = await deployContract(creatorWalletClient, {
      abi,
      bytecode: bytecode as `0x${string}`,
      args: [/* constructor args if any */],
      account: CREATOR_KEY,
    });
    expect(contractAddress).to.match(/^0x[a-fA-F0-9]{40}$/);
  });

  describe("createRequest", function () {
    it("should create a new request and emit an event", async function () {
      // Call the function
      const txHash = await creatorWalletClient.writeContract({
        address: contractAddress,
        abi,
        functionName: "createRequest",
        args: ["test data", 123], // Replace with actual args
        account: CREATOR_KEY,
      });

      // Optionally, check the state
      const request = await client.readContract({
        address: contractAddress,
        abi,
        functionName: "getRequest",
        args: [0], // Replace with actual request id
      });

      expect(request).to.include({ data: "test data", value: 123 });
    });

    it("should revert if called with invalid data", async function () {
      let errorCaught = false;
      try {
        await creatorWalletClient.writeContract({
          address: contractAddress,
          abi,
          functionName: "createRequest",
          args: ["", 0],
          account: CREATOR_KEY,
        });
      } catch (err) {
        errorCaught = true;
        // Optionally, check error message or type here
      }
      expect(errorCaught).to.be.true;
    });
  });
  describe("acceptRequest", function () {
  beforeEach(async function () {
    //Creator creates the request
    await creatorWalletClient.writeContract({
      address: contractAddress,
      abi,
      functionName: "createRequest",
      args: ["test data", 123],
      account: CREATOR_KEY,
    });
  });
    it("should allow acceptor to accept request", async function () {
      //Acceptor accepts request
      await acceptorWalletClient.writeContract({
        address: contractAddress,
        abi,
        functionName: "acceptRequest",
        args:[REQUEST_ID],
        account: ACCEPTOR_KEY,
      });
      //Check to ensure the request is now locked
      const request=await client.readContract({
        address: contractAddress,
        abi,
        functionName: "getRequest",
        args:[REQUEST_ID],
      }) as ScanRequest;
      expect(request.accepted).to.be.true;
    });
    it("should prevent anyone else from accepting the same request", async function(){
      //First let's accept
      await acceptorWalletClient.writeContract({
        address: contractAddress,
        abi,
        functionName: "acceptRequest",
        args:[REQUEST_ID],
        account: ACCEPTOR_KEY,
      });
      //Try and accept with a different user
      let errorCaught=false;
      try{
        await randoWalletClient.writeContract({
          address: contractAddress,
          abi,
          functionName: "acceptRequest",
          args:[REQUEST_ID],
          account: RANDO_KEY,
        });
      }
      catch (err){
        errorCaught=true;
      }
      expect(errorCaught).to.be.true;
    })
  })
  describe("submitScan", function () {
    let requestID: number;
    requestID=REQUEST_ID;
    beforeEach(async function () {
      //Creator posts request
      await creatorWalletClient.writeContract({
        address: contractAddress,
        abi,
        functionName: "createRequest",
        args: ["test data", 123, 1],
        account: CREATOR_KEY,
      });
      //Acceptor accepts request
      await acceptorWalletClient.writeContract({
        address: contractAddress,
        abi,
        functionName: "acceptRequest",
        args: [requestID],
        account: ACCEPTOR_KEY,
      });
    });
    it("should fulfill the request after one submission if only one is required", async function () {
      // Create request with requiredSubmissions = 1
      await creatorWalletClient.writeContract({
        address: contractAddress,
        abi,
        functionName: "createRequest",
        args: ["location1", 0, 100, 1], // last arg: requiredSubmissions = 1
        account: CREATOR_KEY,
      });
      // Accept the request
      await acceptorWalletClient.writeContract({
        address: contractAddress,
        abi,
        functionName: "acceptRequest",
        args: [0],
        account: ACCEPTOR_KEY,
      });
      // Submit scan
      await acceptorWalletClient.writeContract({
        address: contractAddress,
        abi,
        functionName: "submitScan",
        args: [0, "ipfs://scan-data-1"],
        account: ACCEPTOR_KEY,
      });
      // Check fulfilled
      const request = await client.readContract({
        address: contractAddress,
        abi,
        functionName: "getRequest",
        args: [0],
      }) as ScanRequest;

      expect(request.fulfilled).to.be.true;
      expect(request.submissions).to.equal(1);
    });
  });
  it("should only fulfill the request after correct number of submissions", async function () {
  //Create request with requiredSubmissions = 3
  await creatorWalletClient.writeContract({
    address: contractAddress,
    abi,
    functionName: "createRequest",
    args: ["location2", 0, 100, 3], // last arg: requiredSubmissions = 3
    account: CREATOR_KEY,
  });
  // Accept the request
  await acceptorWalletClient.writeContract({
    address: contractAddress,
    abi,
    functionName: "acceptRequest",
    args: [1],
    account: ACCEPTOR_KEY,
  });
  // Submit first scan
  await acceptorWalletClient.writeContract({
    address: contractAddress,
    abi,
    functionName: "submitScan",
    args: [1, "ipfs://scan-data-1"],
    account: ACCEPTOR_KEY,
  });
  // Check not fulfilled yet
  let request = await client.readContract({
    address: contractAddress,
    abi,
    functionName: "getRequest",
    args: [1],
  }) as ScanRequest;

  expect(request.fulfilled).to.be.false;
  expect(request.submissions).to.equal(1);

  // Submit second scan
  await acceptorWalletClient.writeContract({
    address: contractAddress,
    abi,
    functionName: "submitScan",
    args: [1, "ipfs://scan-data-2"],
    account: ACCEPTOR_KEY,
  });
  // Submit third scan
  await acceptorWalletClient.writeContract({
    address: contractAddress,
    abi,
    functionName: "submitScan",
    args: [1, "ipfs://scan-data-3"],
    account: ACCEPTOR_KEY,
  });
  // Now it should be fulfilled
  request = await client.readContract({
    address: contractAddress,
    abi,
    functionName: "getRequest",
    args: [1],
  }) as ScanRequest;

  expect(request.fulfilled).to.be.true;
  expect(request.submissions).to.equal(3);
});
  it("should reject submission from others", async function () {
    let errorCaught = false;
    try {
      await creatorWalletClient.writeContract({
        address: contractAddress,
        abi,
        functionName: "submitScan",
        args: [REQUEST_ID, "ipfs://bad"],
        account: CREATOR_KEY,
      });
    }
    catch (err) {
      errorCaught = true;
    }
    expect(errorCaught).to.be.true;
  })
})