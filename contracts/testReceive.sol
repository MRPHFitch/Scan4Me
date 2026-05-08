// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract TestReceiver {
    event Received(address sender, uint256 amount, uint256 balanceAfter);

    // This function is called when ETH is sent to the contract
    receive() external payable {
        emit Received(msg.sender, msg.value, address(this).balance);
    }

    // Helper to check the contract's balance
    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }
}