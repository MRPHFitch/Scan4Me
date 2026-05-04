import { createPublicClient, createWalletClient, http, parseEther } from "viem";
import type { Address } from "viem";
import { foundry } from "viem/chains";
import { deployContract } from "viem/actions";
import artifact from "../artifacts/contracts/scan4me.sol/Scan4MeMarketplace.json";
import { describe, it, beforeEach, after } from "node:test";
import { expect } from "chai";
import * as chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { privateKeyToAccount } from "viem/accounts";
import { parseAbiItem } from "viem";
import fs from "fs";
import path from "path";
chai.use(chaiAsPromised);

//Use a test private key (DO NOT use real keys in production)
//Using Account#10 for Creator
const CREATOR_KEY = "0xf214f2b2cd398c806f84e317254e0f0b801d0643303237d97a22a48e01628897"; // Replace with a test key
const creatorAccount=privateKeyToAccount(CREATOR_KEY);
//Using Account#17 for Acceptor
const SCANNER_KEY="0x689af8efa8c651a91ad287602527f3af2fe9f6501a7ac4b061667b5a93e037fd"
const scannerAccount=privateKeyToAccount(SCANNER_KEY);
//Using Account#7 for Random account
const RANDO_KEY= "0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356"
const randoAccount=privateKeyToAccount(RANDO_KEY);

//Fix to retrieve from counter or something for deployment
const REQUEST_ID=0;
//Local testing dummy values
const dummyRouter = "0x0000000000000000000000000000000000000001";
const dummyDonId = "0x0000000000000000000000000000000000000000000000000000000000000001";
const dummySubId = 1;

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

describe("Scan4MeMarketplace", function () {
  let contractAddress: Address;

  beforeEach(async function () {
    //Deploy contract and get transaction hash
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
  //=================================================================================================================//
  describe("createRequest", function () {
    it("should create a new request and emit an event", async function () {
      // Call the function
      const txHash = await creatorWalletClient.writeContract({
        address: contractAddress,
        abi,
        functionName: "createRequest",
        args: ["test data", 1], // Replace with actual args
        value: parseEther("0.01"),
      });
      
      //Make sure the state aligns
      const request = await client.readContract({
        address: contractAddress,
        abi,
        functionName: "getRequest",
        args: [0], // Replace with actual request id
      })as ScanRequest;

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
  //=================================================================================================================//
  describe("acceptRequest", function () {
  beforeEach(async function () {
    //Creator creates the request
    await creatorWalletClient.writeContract({
      address: contractAddress,
      abi,
      functionName: "createRequest",
      args: ["test data", 1],
    });
  });
    it("should allow acceptor to accept request", async function () {
      //Acceptor accepts request
      await acceptorWalletClient.writeContract({
        address: contractAddress,
        abi,
        functionName: "acceptRequest",
        args:[REQUEST_ID],
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
        account: scannerAccount,
      });
      //Try and accept with a different user
      let errorCaught=false;
      try{
        await randoWalletClient.writeContract({
          address: contractAddress,
          abi,
          functionName: "acceptRequest",
          args:[REQUEST_ID],
        });
      }
      catch (err){
        errorCaught=true;
      }
      expect(errorCaught).to.be.true;
    })
  })

  //Submit Scan Test
  //=================================================================================================================//
  describe("submitScan", function () {
    let requestID: number;
    requestID=REQUEST_ID;
    beforeEach(async function () {
      //Creator posts request
      await creatorWalletClient.writeContract({
        address: contractAddress,
        abi,
        functionName: "createRequest",
        args: ["test data", 0],
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
        args: [0, "ipfs://scan-data-1"],
      });
      // Check fulfilled
      const request = await client.readContract({
        address: contractAddress,
        abi,
        functionName: "getRequest",
        args: [0],
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

//   //Request Verification Test
//   //=================================================================================================================//
//   describe("requestVerification", function () {
//     beforeEach(async function () {
//       //Creator posts request
//       await creatorWalletClient.writeContract({
//         address: contractAddress,
//         abi,
//         functionName: "createRequest",
//         args: ["test data", 123, 1],
//       });
//       //Acceptor accepts request
//       await acceptorWalletClient.writeContract({
//         address: contractAddress,
//         abi,
//         functionName: "acceptRequest",
//         args: [REQUEST_ID],
//       });
//       await acceptorWalletClient.writeContract({
//         address: contractAddress,
//         abi,
//         functionName: "submitScan",
//         args: [1, "ipfs://scan-data"],
//       });
//     })
//     it("Should allow verification request after scan submission", async function () {
//       //Call request
//       await acceptorWalletClient.writeContract({
//         address: contractAddress,
//         abi,
//         functionName: "requestVerification",
//         args: [REQUEST_ID],
//       });
//       //Check the state of request
//       const request = await client.readContract({
//         address: contractAddress,
//         abi,
//         functionName: "getRequest",
//         args: [REQUEST_ID]
//       }) as ScanRequest;

//       expect(request.verificationStatus).to.equal(0);   //Pending verification
//       expect(request.verificationRequestId).to.not.equal(""); //Should be set at this point
//       expect(request.fulfilled).to.be.false;
//     });
//     it("Should revert if scan not submitted", async function () {
//       await creatorWalletClient.writeContract({
//         address: contractAddress,
//         abi,
//         functionName: "createRequest",
//         args: ["other data", 123, 1],
//       });
//       const newRequestId = 1;
//       await acceptorWalletClient.writeContract({
//         address: contractAddress,
//         abi,
//         functionName: "acceptRequest",
//         args: [newRequestId],
//       });
//       let errorCaught = false;
//       try {
//         await acceptorWalletClient.writeContract({
//           address: contractAddress,
//           abi,
//           functionName: "requestVerification",
//           args: [newRequestId],
//         });
//       }
//       catch (err: any) {
//         errorCaught = true;
//         expect(err.message).to.match(/Scan not submitted/);
//       }
//       expect(errorCaught).to.be.true;
//     });
//     it("should revert if already verified", async function () {
//       // Request verification once (should succeed)
//       await acceptorWalletClient.writeContract({
//         address: contractAddress,
//         abi,
//         functionName: "requestVerification",
//         args: [REQUEST_ID],
//       });

//       // Simulate verification status set to Approved (mock oracle callback)
//       // await contract.setVerificationStatus(requestID, 1); // 1 = Approved

//       // Try again
//       let errorCaught = false;
//       try {
//         await acceptorWalletClient.writeContract({
//           address: contractAddress,
//           abi,
//           functionName: "requestVerification",
//           args: [REQUEST_ID],
//         });
//       } catch (err: any) {
//         errorCaught = true;
//         expect(err.message).to.match(/Already verified/);
//       }
//       expect(errorCaught).to.be.true;
//     });
//   });

  //

  after(async function () {
    // Pull up the logs after all tests
    const logs = await client.getLogs({
      address: contractAddress,
      event: parseAbiItem('event DebugLog(string message, uint256 value)'),
      fromBlock: 'latest', // or specify the block range if needed
    });

    // Write to file
    const logLines = logs.map(
      (log) => `DebugLog: ${log.args.message ?? "(no message)"} | Value: ${log.args.value?.toString() ?? "(no value)"}`
    );
    fs.appendFileSync("debugLogs.txt", logLines.join("\n") + "\n");
  });
})