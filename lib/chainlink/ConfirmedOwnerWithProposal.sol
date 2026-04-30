// SPDX-License-Identifier: MIT
// Chainlink ConfirmedOwnerWithProposal contract

pragma solidity ^0.8.0;

import {Context} from "../utils/Context.sol";

/**
 * @title ConfirmedOwnerWithProposal
 * @notice Abstract contract that allows for ownership transfer with a proposal mechanism.
 */
abstract contract ConfirmedOwnerWithProposal is Context {
    address private _owner;
    address private _proposedOwner;

    event OwnershipTransferRequested(address indexed from, address indexed to);
    event OwnershipTransferred(address indexed from, address indexed to);

    modifier onlyOwner() {
        require(msg.sender == _owner, "Only owner can call this function");
        _;
    }

    constructor(address owner_, address proposedOwner_) {
        require(owner_ != address(0), "Owner cannot be zero address");
        _owner = owner_;
        _proposedOwner = proposedOwner_;
        emit OwnershipTransferred(address(0), _owner);
    }

    function owner() public view returns (address) {
        return _owner;
    }

    function proposedOwner() public view returns (address) {
        return _proposedOwner;
    }

    function proposeOwner(address to) public onlyOwner {
        require(to != address(0), "Cannot propose zero address");
        _proposedOwner = to;
        emit OwnershipTransferRequested(_owner, to);
    }

    function confirmOwner() public {
        require(msg.sender == _proposedOwner, "Only proposed owner can confirm");
        address previousOwner = _owner;
        _owner = _proposedOwner;
        _proposedOwner = address(0);
        emit OwnershipTransferred(previousOwner, _owner);
    }
}
