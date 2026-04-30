// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

library FunctionsResponse {
    struct Response {
        bytes32 requestId;
        bytes result;
        bytes32[] errorStrings;
        uint8[] errors;
        uint256 totalCostInJuels;
    }

    struct Commitment {
        bytes32 requestId;
        address client;
        uint32 callbackGasLimit;
        bytes32 donId;
        uint64 subscriptionId;
    }

    enum FulfillResult {
        Success,
        Failure
    }
}