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
import hre from "hardhat";
import { AbiCoder } from "ethers";
chai.use(chaiAsPromised);

//Use a test private key (DO NOT use real keys in production)
//Using Account#10 for Creator
const CREATOR_KEY = "0xf214f2b2cd398c806f84e317254e0f0b801d0643303237d97a22a48e01628897"; // Replace with a test key
const CREATOR_ADDRESS="0xbcd4042de499d14e55001ccbb24a551f3b954096";
const creatorAccount = privateKeyToAccount(CREATOR_KEY);
//Using Account#17 for Acceptor
const SCANNER_KEY = "0x689af8efa8c651a91ad287602527f3af2fe9f6501a7ac4b061667b5a93e037fd"
const SCANNER_ADDRESS="0xbda5747bfd65f08deb54cb465eb87d40e51b197e";
const scannerAccount = privateKeyToAccount(SCANNER_KEY);
//Using Account#7 for Random account
const RANDO_KEY = "0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356"
const RANDO_ADDRESS="0x14dc79964da2c08b23698b3d3cc7ca32193d9955";
const randoAccount = privateKeyToAccount(RANDO_KEY);

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
  lastRejected: number;
  scannerPaid: boolean,
};

const { abi, bytecode } = artifact;
const ethers = (hre as any).ethers;

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
let reqID=0;
function getNextRequestID() {
  return reqID++;
}

fs.writeFileSync("debugLogs.txt", "");
let contractAddress: Address;

describe("Scan4MeMarketplace", function () {
  let testReceiver, testReceiverAddress;
  beforeEach(async function () {
    //Deploy contract and get transaction hash
    //=================================================================================================================================================
    //=================================================================================================================================================
    //=================================================================================================================================================
    reqID=getNextRequestID();
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
        args: [reqID], // Replace with actual request id
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
        args: [reqID],
      });
      //Check to ensure the request is now locked
      const request = await client.readContract({
        address: contractAddress,
        abi,
        functionName: "getRequest",
        args: [reqID],
      }) as ScanRequest;
      expect(request.accepted).to.be.true;
    });
    it("should prevent anyone else from accepting the same request", async function () {
      //First let's accept
      await acceptorWalletClient.writeContract({
        address: contractAddress,
        abi,
        functionName: "acceptRequest",
        args: [reqID],
        account: scannerAccount,
      });
      //Try and accept with a different user
      let errorCaught = false;
      try {
        await randoWalletClient.writeContract({
          address: contractAddress,
          abi,
          functionName: "acceptRequest",
          args: [reqID],
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
    requestID = reqID;
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
        args: [reqID, "ipfs://scan-data-1"],
      });
      // Check fulfilled
      const request = await client.readContract({
        address: contractAddress,
        abi,
        functionName: "getRequest",
        args: [reqID],
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
        args: [reqID, "ipfs://bad"],
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
        args: [reqID],
      });
      //Acceptor submits scans
      await acceptorWalletClient.writeContract({
        address: contractAddress,
        abi,
        functionName: "submitScan",
        args: [reqID, "ipfs://scan-data"],
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
        args: [reqID],
      });
      //Check the state of request
      const request = await client.readContract({
        address: contractAddress,
        abi,
        functionName: "getRequest",
        args: [reqID]
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
        args: [reqID],
      });
      // Try again
      let errorCaught = false;
      try {
        await acceptorWalletClient.writeContract({
          address: contractAddress,
          abi,
          functionName: "requestVerification",
          args: [reqID],
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
        args: [reqID],
      });
      //Acceptor submits scans
      await acceptorWalletClient.writeContract({
        address: contractAddress,
        abi,
        functionName: "submitScan",
        args: [reqID, "ipfs://scan-data"],
      });
      //Either of them calls for a review
      await creatorWalletClient.writeContract({
        address: contractAddress,
        abi,
        functionName: 'requestVerification',
        args: [reqID]
      });
    });
    it("should set verificationStatus to Approved and fulfilled to true", async function () {
      // Encode response: (uint256, bool)
      const abiCoder = new AbiCoder();
      const response = abiCoder.encode(
        ["uint256", "bool"],
        [Number(reqID), true]
      );
      // Empty error bytes
      const err = "0x";
      const request = await client.readContract({
        address: contractAddress,
        abi,
        functionName: "getRequest",
        args: [reqID],
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
        args: [reqID],
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
          args: [reqID],
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
    const response = abiCoder.encode(["uint256", "bool"], [Number(reqID), false]);
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
        args: [reqID],
      });
      //Acceptor submits scans
      await acceptorWalletClient.writeContract({
        address: contractAddress,
        abi,
        functionName: "submitScan",
        args: [reqID, "ipfs://scan-data"],
      });
      //Either of them calls for a review
      await creatorWalletClient.writeContract({
        address: contractAddress,
        abi,
        functionName: 'requestVerification',
        args: [reqID]
      });
      const request = await client.readContract({
        address: contractAddress,
        abi,
        functionName: "getRequest",
        args: [reqID],
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
        args: [reqID],
      });
      const updated = await client.readContract({
        address: contractAddress,
        abi,
        functionName: "getRequest",
        args: [reqID],
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
          args: [reqID],
        });
      }
      catch (err: any) {
        errorCaught = true;
        expect(err.message).to.match(/Timeout not reached/);
      }
      expect(errorCaught).to.be.true;
    });
    it("should not allow revert if not rejected", async function () {
      const response = abiCoder.encode(["uint256", "bool"], [Number(reqID), true]); // true = approved
      const request = await client.readContract({
        address: contractAddress,
        abi,
        functionName: "getRequest",
        args: [reqID],
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
          args: [reqID],
        });
      }
      catch (err: any) {
        errorCaught = true;
        expect(err.message).to.match(/Not rejected/);
      }
      expect(errorCaught).to.be.true;
    });
  });

  //Withdraw Scanner Payment
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
      value: parseEther("100.0"), // Example payment
    });
    await acceptorWalletClient.writeContract({
      address: contractAddress,
      abi,
      functionName: "acceptRequest",
      args: [reqID],
    });
    await acceptorWalletClient.writeContract({
      address: contractAddress,
      abi,
      functionName: "submitScan",
      args: [reqID, "ipfs://scan-data"],
    });
    await creatorWalletClient.writeContract({
      address: contractAddress,
      abi,
      functionName: "requestVerification",
      args: [reqID],
    });
    // Set mock time and simulate approval
    await creatorWalletClient.writeContract({
      address: contractAddress,
      abi,
      functionName: "setMockTime",
      args: [START_TIME],
    });
    const abiCoder = new AbiCoder();
    const response = abiCoder.encode(["uint256", "bool"], [Number(reqID), true]); // true = approved
    const err = "0x";
    request = await client.readContract({
      address: contractAddress,
      abi,
      functionName: "getRequest",
      args: [reqID],
    }) as ScanRequest;
    await creatorWalletClient.writeContract({
      address: contractAddress,
      abi,
      functionName: "testFulfillRequest",
      args: [request.verificationRequestId, response, err],
    });
  });
  it("should allow scanner to withdraw after approval", async function () {
    const TestReceiver = await ethers.getContractFactory("TestReceiver");
    testReceiver = await TestReceiver.deploy();
    await testReceiver.deployed();
    testReceiverAddress = testReceiver.address;

    // Now you can use testReceiverAddress as the scanner address
    console.log("TestReceiver deployed at:", testReceiverAddress);
    const request = await client.readContract({
      address: contractAddress,
      abi,
      functionName: "getRequest",
      args: [reqID],
    }) as ScanRequest;
    // For Hardhat/localhost
    const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
    const scannerAddress=request.scanner;
    // Check initial balance
    const before = await provider.getBalance(scannerAddress);
    const contractBalBefore = await provider.getBalance(contractAddress);
    
    // Withdraw
    try {
      const tx = await testReceiverAddress.writeContract({
        address: contractAddress,
        abi,
        functionName: "withdrawScannerPayment",
        args: [reqID],
      });
      // Wait for mining
      await client.getTransactionReceipt({ hash: tx });
    }
    catch (err: any) {
      console.error("Withdraw failed:", err.message);
    }
    // Check new balance (should increase by scannerPayment)
    const balance = await ethers.provider.getBalance(testReceiverAddress);
    console.log("TestReceiver balance:", balance.toString());
    const after = await provider.getBalance(scannerAddress);
    const contractBalAfter = await provider.getBalance(contractAddress);
    console.log("Scanner balance before:", before.toString());
    console.log("Scanner balance after:", after.toString());
    console.log("Contract balance before:", contractBalBefore.toString());
    console.log("Contract balance after:", contractBalAfter.toString());
    expect(after > before).to.be.true;
  });
    it("should not allow non-scanner to withdraw", async function () {
    let errorCaught = false;
    try {
      await creatorWalletClient.writeContract({
        address: contractAddress,
        abi,
        functionName: "withdrawScannerPayment",
        args: [reqID],
      });
    } catch (err: any) {
      errorCaught = true;
      expect(err.message).to.match(/Only scanner can withdraw/);
    }
    expect(errorCaught).to.be.true;
  });
  it("should not allow scanner to withdraw before approval", async function () {
    // Set up a new request, but do not approve
    const abiCoder = new AbiCoder();
    const response = abiCoder.encode(["uint256", "bool"], [Number(reqID), false]); // false = rejected
    const err="0x";
    request = await client.readContract({
      address: contractAddress,
      abi,
      functionName: "getRequest",
      args: [reqID],
    }) as ScanRequest;
    await creatorWalletClient.writeContract({
      address: contractAddress,
      abi,
      functionName: "testFulfillRequest",
      args: [request.verificationRequestId, response, err],
    });
    // Try to withdraw
    let errorCaught = false;
    try {
      await acceptorWalletClient.writeContract({
        address: contractAddress,
        abi,
        functionName: "withdrawScannerPayment",
        args: [reqID],
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
      args: [reqID],
    });
    // Second withdrawal should fail (if contract logic prevents double-withdrawal)
    let errorCaught = false;
    try {
      await acceptorWalletClient.writeContract({
        address: contractAddress,
        abi,
        functionName: "withdrawScannerPayment",
        args: [reqID],
      });
    } catch (err: any) {
      errorCaught = true;
      // The revert reason may vary depending on your contract logic
    }
    expect(errorCaught).to.be.true;
  });
  })
  after(async function () {
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