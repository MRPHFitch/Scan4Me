interface IScan4MeMarketplace {
    function acceptRequest(uint256 requestId) external;
    function withdrawScannerPayment(uint256 requestId) external;
    function submitScan(uint256 requestId, string calldata scanDataUri) external;
}

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

    // Accept a scan request as the scanner
    function acceptAsScanner(address marketplace, uint256 requestId) external {
        IScan4MeMarketplace(marketplace).acceptRequest(requestId);
    }

    //Submit the scan as scanner
    function submitScanToMarketplace(address marketplace, uint256 requestId, string calldata scanDataUri) external {
        IScan4MeMarketplace(marketplace).submitScan(requestId, scanDataUri);
    }

    // Withdraw payment as the scanner
    function withdrawPayment(address marketplace, uint256 requestId) external {
        IScan4MeMarketplace(marketplace).withdrawScannerPayment(requestId);
    }
    
}