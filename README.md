# Scan4Me

## Project Overview
The project allows for a requestor to submit a request for a scan, and allow anyone in the world to accept that request. Once accepted, the scanner can upload their scan file and request for verification. After the scan has been verified for correct location and file type, the request is marked as fulfilled and the scanner and withdraw their money from the contract.  

If the creator of the request determines that they made a mistake, they can cancel or delete their request before the request is accepted. After the request is accepted, they cannot do so.  

If the request for verification returns a rejection, the scanner has 3 days to resubmit a scan. If at the end of 3 days, there has been no response from the scanner, the request can be reverted to an open status and anyone can accept it at that time, or the requestor can cancel the request.

## Usage

I prefer yarn to npm or npx, so I have some scripts set up for running the code using yarn.

### Running Tests

To run all the tests in the project, execute the following command:

```shell
yarn test
```

### Make a deployment to Sepolia

There were two contracts created, one with the hope of adjusting the already deployed one in order to retrieve some tokens from the contract, and the main deployment. As such there are two deployment script shortcuts I created. Both are specified to work on the Sepolia testnet.

```shell
yarn deploy
yarn update
```

Before running, a wallet's private key will be needed, along with Sepolia's RPC URL. I used alchemy to retrieve the URL.  
You will also need the functions router and DON ID. Both are publicly available from Chainklink here:

https://docs.chain.link/chainlink-functions/supported-networks

### Other shortcuts
I also established a shortcut to start up a hardhat node for original testing.

```shell
yarn on
```

With the excessive amount of compiling, I also created:

```shell
yarn compile
```

Lastly, I created one last shortcut in case I needed to clean up and rebuild everything. I mostly did this because my brain wanted to keep on typing clear instead of clean and it was driving me nuts.

```shell
yarn clean
```

### Structure

You will find all front end material inside of the frontend directory, and the main contract in the contracts directory. The lib directory can be ignored as it was a way to import chainlink and openzeppelin files before just including them in the dependencies. Both contract deployment files are found in the scripts directory. Sometimes, the node_modules directory has a problem because the viem tsconfig.json file added in a reliance upon a base.json file that doesn't exist. Just go in and delete the line.