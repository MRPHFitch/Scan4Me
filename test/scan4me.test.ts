import { network } from "hardhat";
import { createPublicClient, createWalletClient, http, parseEther } from "viem";
import type { Address } from "viem";
import { foundry } from "viem/chains";
import { deployContract } from "viem/actions";
import artifact from "../artifacts/contracts/scan4me.sol/Scan4MeMarketplace.json";
import { describe, it, beforeEach, after, before } from "node:test";
import { expect } from "chai";
import * as chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { privateKeyToAccount } from "viem/accounts";
import { parseAbiItem } from "viem";
import fs from "fs";
import path from "path";
import { log } from "console";
import { AbiCoder } from "ethers";
import {ethers} from "ethers";
chai.use(chaiAsPromised);

//Use a test private key (DO NOT use real keys in production)
//Using Account#10 for Creator
const CREATOR_KEY = "0xf214f2b2cd398c806f84e317254e0f0b801d0643303237d97a22a48e01628897"; // Replace with a test key
const creatorAccount = privateKeyToAccount(CREATOR_KEY);
//Using Account#17 for Acceptor
const SCANNER_KEY = "0x689af8efa8c651a91ad287602527f3af2fe9f6501a7ac4b061667b5a93e037fd"
const scannerAccount = privateKeyToAccount(SCANNER_KEY);
//Using Account#7 for Random account
const RANDO_KEY = "0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356"
const randoAccount = privateKeyToAccount(RANDO_KEY);

//Fix to retrieve from counter or something for deployment
const REQUEST_ID = 0;
//Local testing dummy values
const dummyRouter = "0x0000000000000000000000000000000000000001";
const dummyDonId = "0x0000000000000000000000000000000000000000000000000000000000000001";
const dummySubId = 1;

const START_TIME = 1_000_000_000; // Any arbitrary UNIX timestamp for fastforward options

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
  account: creatorAccount,
});
const acceptorWalletClient = createWalletClient({
  chain: foundry,
  transport: http(),
  account: scannerAccount,
});
const randoWalletClient = createWalletClient({
  chain: foundry,
  transport: http(),
  account: randoAccount,
});

fs.writeFileSync("debugLogs.txt", "");
let startBlock = await client.getBlockNumber();
let contractAddress: Address;

describe("Scan4MeMarketplace", function () {
  beforeEach(async function () {
    //Deploy contract and get transaction hash
    //=================================================================================================================================================
    //=================================================================================================================================================
    //=================================================================================================================================================
    const txHash = await deployContract(creatorWalletClient, {
      abi,
      bytecode: bytecode as `0x${string}`,
      args: [dummyRouter, dummyDonId, dummySubId],
      account: creatorAccount,
    });

    //Wait for the transaction to be mined and get the receipt
    const receipt = await client.getTransactionReceipt({ hash: txHash });
    //Extract the contract address
    contractAddress = receipt.contractAddress as Address;
    //Assert the contract address is valid
    expect(contractAddress).to.match(/^0x[a-fA-F0-9]{40}$/);
  });
  //Create Request Test
  //=================================================================================================================================================
  //=================================================================================================================================================
  //=================================================================================================================================================
  describe("createRequest", function () {
    it("should create a new request and emit an event", async function () {
      // Call the function
      const txHash = await creatorWalletClient.writeContract({
        address: contractAddress,
        abi,
        functionName: "createRequest",
        args: ["test data", 1, 1], //location, scanType, # of scans
        value: parseEther("0.01"),
      });

      //Make sure the state aligns
      const request = await client.readContract({
        address: contractAddress,
        abi,
        functionName: "getRequest",
        args: [0], // Replace with actual request id
      }) as ScanRequest;

      expect(request.location).to.equal("test data");
      expect(request.scanType).to.equal(1);
    });

    it("should revert if called with invalid data", async function () {
      let errorCaught = false;
      try {
        await creatorWalletClient.writeContract({
          address: contractAddress,
          abi,
          functionName: "createRequest",
          args: ["", 0],
        });
      } catch (err) {
        errorCaught = true;
        // Optionally, check error message or type here
      }
      expect(errorCaught).to.be.true;
    });
  });

  //Accept Request Test
  //=================================================================================================================================================
  //=================================================================================================================================================
  //=================================================================================================================================================
  describe("acceptRequest", function () {
    beforeEach(async function () {
      //Creator creates the request
      await creatorWalletClient.writeContract({
        address: contractAddress,
        abi,
        functionName: "createRequest",
        args: ["test data", 1, 1],
      });
    });
    it("should allow acceptor to accept request", async function () {
      //Acceptor accepts request
      await acceptorWalletClient.writeContract({
        address: contractAddress,
        abi,
        functionName: "acceptRequest",
        args: [REQUEST_ID],
      });
      //Check to ensure the request is now locked
      const request = await client.readContract({
        address: contractAddress,
        abi,
        functionName: "getRequest",
        args: [REQUEST_ID],
      }) as ScanRequest;
      expect(request.accepted).to.be.true;
    });
    it("should prevent anyone else from accepting the same request", async function () {
      //First let's accept
      await acceptorWalletClient.writeContract({
        address: contractAddress,
        abi,
        functionName: "acceptRequest",
        args: [REQUEST_ID],
        account: scannerAccount,
      });
      //Try and accept with a different user
      let errorCaught = false;
      try {
        await randoWalletClient.writeContract({
          address: contractAddress,
          abi,
          functionName: "acceptRequest",
          args: [REQUEST_ID],
        });
      }
      catch (err) {
        errorCaught = true;
      }
      expect(errorCaught).to.be.true;
    })
  })

  //Submit Scan Test
  //=================================================================================================================================================
  //=================================================================================================================================================
  //=================================================================================================================================================
  describe("submitScan", function () {
    let requestID: number;
    requestID = REQUEST_ID;
    beforeEach(async function () {
      //Creator posts request
      await creatorWalletClient.writeContract({
        address: contractAddress,
        abi,
        functionName: "createRequest",
        args: ["test data", 0, 1],
      });
      //Acceptor accepts request
      await acceptorWalletClient.writeContract({
        address: contractAddress,
        abi,
        functionName: "acceptRequest",
        args: [requestID],
      });
    });
    it("should fulfill the request after correct number of submissions", async function () {
      // Submit scan
      await acceptorWalletClient.writeContract({
        address: contractAddress,
        abi,
        functionName: "submitScan",
        args: [REQUEST_ID, "ipfs://scan-data-1"],
      });
      // Check fulfilled
      const request = await client.readContract({
        address: contractAddress,
        abi,
        functionName: "getRequest",
        args: [REQUEST_ID],
      }) as ScanRequest;
      expect(request.submissions).to.equal(request.requiredScans);
    });
  });
  it("should reject submission from others", async function () {
    let errorCaught = false;
    try {
      await creatorWalletClient.writeContract({
        address: contractAddress,
        abi,
        functionName: "submitScan",
        args: [REQUEST_ID, "ipfs://bad"],
      });
    }
    catch (err) {
      errorCaught = true;
    }
    expect(errorCaught).to.be.true;
  })

  //Request Verification Test
  //=================================================================================================================================================
  //=================================================================================================================================================
  //=================================================================================================================================================
  describe("requestVerification", function () {
    beforeEach(async function () {
      //Creator posts request
      await creatorWalletClient.writeContract({
        address: contractAddress,
        abi,
        functionName: "createRequest",
        args: ["test data", 1, 1], //location, scanType, # of scans
      });
      //Acceptor accepts request
      await acceptorWalletClient.writeContract({
        address: contractAddress,
        abi,
        functionName: "acceptRequest",
        args: [REQUEST_ID],
      });
      //Acceptor submits scans
      await acceptorWalletClient.writeContract({
        address: contractAddress,
        abi,
        functionName: "submitScan",
        args: [REQUEST_ID, "ipfs://scan-data"],
      });
    })
    it("Should allow verification request after scan submission", async function () {
      //Call request
      await creatorWalletClient.writeContract({
        address: contractAddress,
        abi,
        functionName: "setTestingMode",
        args: [true],
      });
      await creatorWalletClient.writeContract({
        address: contractAddress,
        abi,
        functionName: "requestVerification",
        args: [REQUEST_ID],
      });
      //Check the state of request
      const request = await client.readContract({
        address: contractAddress,
        abi,
        functionName: "getRequest",
        args: [REQUEST_ID]
      }) as ScanRequest;

      expect(request.verificationStatus).to.equal(1);   //Pending verification
      expect(request.verificationRequestId).to.not.equal(""); //Should be set at this point
      expect(request.fulfilled).to.be.false;
    });
    it("Should revert if scan not submitted", async function () {
      const newRequestId = 1;
      let errorCaught = false;
      try {
        await acceptorWalletClient.writeContract({
          address: contractAddress,
          abi,
          functionName: "requestVerification",
          args: [newRequestId],
        });
      }
      catch (err: any) {
        errorCaught = true;
        expect(err.message).to.match(/Scan not submitted/);
      }
      expect(errorCaught).to.be.true;
    });
    it("should revert if already verified", async function () {
      await creatorWalletClient.writeContract({
        address: contractAddress,
        abi,
        functionName: "setTestingMode",
        args: [true],
      })
      // Request verification once (should succeed)
      await acceptorWalletClient.writeContract({
        address: contractAddress,
        abi,
        functionName: "requestVerification",
        args: [REQUEST_ID],
      });
      // Try again
      let errorCaught = false;
      try {
        await acceptorWalletClient.writeContract({
          address: contractAddress,
          abi,
          functionName: "requestVerification",
          args: [REQUEST_ID],
        });
      } catch (err: any) {
        errorCaught = true;
        expect(err.message).to.match(/(Already fulfilled|Verification already requested or completed)/);
      }
      expect(errorCaught).to.be.true;
    });
  });

  //Fulfill Request Test Using the Bypass
  //=================================================================================================================================================
  //=================================================================================================================================================
  //=================================================================================================================================================
  describe("_fulfillRequest", function () {
    beforeEach(async function () {
      await creatorWalletClient.writeContract({
        address: contractAddress,
        abi,
        functionName: "setTestingMode",
        args: [true],
      })
      await creatorWalletClient.writeContract({
        address: contractAddress,
        abi,
        functionName: "createRequest",
        args: ["Taj Mahal", 3, 1],
      });
      //Acceptor accepts request
      await acceptorWalletClient.writeContract({
        address: contractAddress,
        abi,
        functionName: "acceptRequest",
        args: [REQUEST_ID],
      });
      //Acceptor submits scans
      await acceptorWalletClient.writeContract({
        address: contractAddress,
        abi,
        functionName: "submitScan",
        args: [REQUEST_ID, "ipfs://scan-data"],
      });
      //Either of them calls for a review
      await creatorWalletClient.writeContract({
        address: contractAddress,
        abi,
        functionName: 'requestVerification',
        args: [REQUEST_ID]
      });
    });
    it("should set verificationStatus to Approved and fulfilled to true", async function () {
      // Encode response: (uint256, bool)
      const abiCoder = new AbiCoder();
      const response = abiCoder.encode(
        ["uint256", "bool"],
        [Number(REQUEST_ID), true]
      );
      // Empty error bytes
      const err = "0x";
      const request = await client.readContract({
        address: contractAddress,
        abi,
        functionName: "getRequest",
        args: [REQUEST_ID],
      }) as ScanRequest;
      await acceptorWalletClient.writeContract({
        address: contractAddress,
        abi,
        functionName: "testFulfillRequest",
        args: [request.verificationRequestId, response, err],
      });
      const updated = await client.readContract({
        address: contractAddress,
        abi,
        functionName: "getRequest",
        args: [REQUEST_ID],
      }) as ScanRequest;

      expect(updated.verificationStatus).to.equal(2); // 2 = Approved
      expect(updated.fulfilled).to.be.true;
    });
    it("should not allow fulfill/verification again", async function () {
      let errorCaught = false;
      try {
        await creatorWalletClient.writeContract({
          address: contractAddress,
          abi,
          functionName: "requestVerification",
          args: [REQUEST_ID],
        });
      } catch (err: any) {
        errorCaught = true;
        // Accept either "Already verified" or "Already fulfilled" depending on require order
        expect(err.message).to.match(/(Already verified|fulfilled|Verification already requested or completed)/);
      }
      expect(errorCaught).to.be.true;
    });
  });

  //Revert to Open Test
  //=================================================================================================================================================
  //=================================================================================================================================================
  //=================================================================================================================================================
  describe("revertToOpen", function () {
    const abiCoder = new AbiCoder();
    const response = abiCoder.encode(["uint256", "bool"], [Number(REQUEST_ID), false]);
    const err = "0x";
    beforeEach(async function () {
      await creatorWalletClient.writeContract({
        address: contractAddress,
        abi,
        functionName: "setTestingMode",
        args: [true],
      })
      await creatorWalletClient.writeContract({
        address: contractAddress,
        abi,
        functionName: "createRequest",
        args: ["Taj Mahal", 3, 1],
      });
      //Acceptor accepts request
      await acceptorWalletClient.writeContract({
        address: contractAddress,
        abi,
        functionName: "acceptRequest",
        args: [REQUEST_ID],
      });
      //Acceptor submits scans
      await acceptorWalletClient.writeContract({
        address: contractAddress,
        abi,
        functionName: "submitScan",
        args: [REQUEST_ID, "ipfs://scan-data"],
      });
      //Either of them calls for a review
      await creatorWalletClient.writeContract({
        address: contractAddress,
        abi,
        functionName: 'requestVerification',
        args: [REQUEST_ID]
      });
      const request = await client.readContract({
        address: contractAddress,
        abi,
        functionName: "getRequest",
        args: [REQUEST_ID],
      }) as ScanRequest;
      await creatorWalletClient.writeContract({
        address: contractAddress,
        abi,
        functionName: "setMockTime",
        args: [START_TIME], // e.g., Date.now() / 1000 or a fixed value
      });
      await creatorWalletClient.writeContract({
        address: contractAddress,
        abi,
        functionName: "testFulfillRequest",
        args: [request.verificationRequestId, response, err],
      });
    });
    it("should revert to open after timeout", async function () {
      // Fast-forward time by REJECTED_TIMEOUT + 1
      await creatorWalletClient.writeContract({
        address: contractAddress,
        abi,
        functionName: "setMockTime",
        args: [START_TIME + 3 * 24 * 60 * 60 + 1], // 3 days + 1 second later
      });
      await creatorWalletClient.writeContract({
        address: contractAddress,
        abi,
        functionName: "revertToOpen",
        args: [REQUEST_ID],
      });
      const updated = await client.readContract({
        address: contractAddress,
        abi,
        functionName: "getRequest",
        args: [REQUEST_ID],
      }) as ScanRequest;
      expect(updated.verificationStatus).to.equal(0); // NotRequested
      expect(updated.fulfilled).to.be.false;
    });
    it("should not allow revert before timeout", async function () {
      // Set mock time to just after rejection (but before timeout)
      await creatorWalletClient.writeContract({
        address: contractAddress,
        abi,
        functionName: "setMockTime",
        args: [START_TIME + 1], // Just after rejection, but not enough for timeout
      });
      let errorCaught = false;
      try {
        await creatorWalletClient.writeContract({
          address: contractAddress,
          abi,
          functionName: "revertToOpen",
          args: [REQUEST_ID],
        });
      }
      catch (err: any) {
        errorCaught = true;
        expect(err.message).to.match(/Timeout not reached/);
      }
      expect(errorCaught).to.be.true;
    });
    it("should not allow revert if not rejected", async function () {
      const response = abiCoder.encode(["uint256", "bool"], [Number(REQUEST_ID), true]); // true = approved
      const request = await client.readContract({
        address: contractAddress,
        abi,
        functionName: "getRequest",
        args: [REQUEST_ID],
      }) as ScanRequest;
      await creatorWalletClient.writeContract({
        address: contractAddress,
        abi,
        functionName: "testFulfillRequest",
        args: [request.verificationRequestId, response, err],
});
      let errorCaught = false;
      try {
        await creatorWalletClient.writeContract({
          address: contractAddress,
          abi,
          functionName: "revertToOpen",
          args: [REQUEST_ID],
        });
      }
      catch (err: any) {
        errorCaught = true;
        expect(err.message).to.match(/Not rejected/);
      }
      expect(errorCaught).to.be.true;
    });
  });

  //Revert to Open Test
  //=================================================================================================================================================
  //=================================================================================================================================================
  //=================================================================================================================================================
  describe("withdrawScannerPayment", function(){
    let request:ScanRequest;
    beforeEach(async function () {
    // Set up contract and request
    await creatorWalletClient.writeContract({
      address: contractAddress,
      abi,
      functionName: "setTestingMode",
      args: [true],
    });
    await creatorWalletClient.writeContract({
      address: contractAddress,
      abi,
      functionName: "createRequest",
      args: ["Taj Mahal", 3, 1],
      value: parseEther("1.0"), // Example payment
    });
    await acceptorWalletClient.writeContract({
      address: contractAddress,
      abi,
      functionName: "acceptRequest",
      args: [REQUEST_ID],
    });
    await acceptorWalletClient.writeContract({
      address: contractAddress,
      abi,
      functionName: "submitScan",
      args: [REQUEST_ID, "ipfs://scan-data"],
    });
    await creatorWalletClient.writeContract({
      address: contractAddress,
      abi,
      functionName: "requestVerification",
      args: [REQUEST_ID],
    });
    // Set mock time and simulate approval
    await creatorWalletClient.writeContract({
      address: contractAddress,
      abi,
      functionName: "setMockTime",
      args: [START_TIME],
    });
    const abiCoder = new AbiCoder();
    const response = abiCoder.encode(["uint256", "bool"], [Number(REQUEST_ID), true]); // true = approved
    const err = "0x";
    request = await client.readContract({
      address: contractAddress,
      abi,
      functionName: "getRequest",
      args: [REQUEST_ID],
    }) as ScanRequest;
    await creatorWalletClient.writeContract({
      address: contractAddress,
      abi,
      functionName: "testFulfillRequest",
      args: [request.verificationRequestId, response, err],
    });
  });

  it("should allow scanner to withdraw after approval", async function () {
    // Check initial balance
    const before = await ethers.provider.getBalance(scannerAddress);
    // Withdraw
    await acceptorWalletClient.writeContract({
      address: contractAddress,
      abi,
      functionName: "withdrawScannerPayment",
      args: [REQUEST_ID],
    });
    // Check new balance (should increase by scannerPayment)
    const after = await ethers.provider.getBalance(scannerAddress);
    expect(after).to.be.above(before);
    // Optionally, check event emission
  });
  it("should not allow non-scanner to withdraw", async function () {
    let errorCaught = false;
    try {
      await creatorWalletClient.writeContract({
        address: contractAddress,
        abi,
        functionName: "withdrawScannerPayment",
        args: [REQUEST_ID],
      });
    } catch (err: any) {
      errorCaught = true;
      expect(err.message).to.match(/Only scanner can withdraw/);
    }
    expect(errorCaught).to.be.true;
  });
  it("should not allow scanner to withdraw before approval", async function () {
    // Set up a new request, but do not approve
    // ...repeat setup, but skip testFulfillRequest or set approved = false...
    // Try to withdraw
    let errorCaught = false;
    try {
      await acceptorWalletClient.writeContract({
        address: contractAddress,
        abi,
        functionName: "withdrawScannerPayment",
        args: [REQUEST_ID],
      });
    } catch (err: any) {
      errorCaught = true;
      expect(err.message).to.match(/Not approved/);
    }
    expect(errorCaught).to.be.true;
  });
  it("should not allow scanner to withdraw twice", async function () {
    // First withdrawal
    await acceptorWalletClient.writeContract({
      address: contractAddress,
      abi,
      functionName: "withdrawScannerPayment",
      args: [REQUEST_ID],
    });
    // Second withdrawal should fail (if contract logic prevents double-withdrawal)
    let errorCaught = false;
    try {
      await acceptorWalletClient.writeContract({
        address: contractAddress,
        abi,
        functionName: "withdrawScannerPayment",
        args: [REQUEST_ID],
      });
    } catch (err: any) {
      errorCaught = true;
      // The revert reason may vary depending on your contract logic
    }
    expect(errorCaught).to.be.true;
  });
  })
  after(async function () {
    const lastBlock = await client.getBlockNumber();
    // Pull up the logs after all tests
    const logs = await client.getLogs({
      address: contractAddress,
      event: parseAbiItem('event DebugLog(string message, uint256 value)'),
      fromBlock: 'latest',
      // toBlock: lastBlock
    });

    // Write to file
    const logLines = logs.map(
      (log) => `DebugLog: ${log.args.message ?? "(no message)"} | Value: ${log.args.value?.toString() ?? "(no value)"}`
    );
    fs.appendFileSync("debugLogs.txt", logLines.join("\n") + "\n");
  });
})