// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {FunctionsClient} from "@chainlink/contracts/src/v0.8/functions/dev/v1_0_0/FunctionsClient.sol";
import {ConfirmedOwner} from "@chainlink/contracts/src/v0.8/shared/access/ConfirmedOwner.sol";

contract Scan4MeMarketplace is ReentrancyGuard, Ownable, FunctionsClient {
    using SafeERC20 for IERC20;

    enum ScanType { PHOTO_360, LIDAR, STANDARD_PHOTO, DRONE_SCAN, VIDEO_CAPTURE }
    enum VerificationStatus { Pending, Approved, Rejected }

    struct ScanRequest {
        address requestor;
        string location;
        ScanType scanType;
        uint256 payment;
        address scanner;
        bool fulfilled;
        VerificationStatus verificationStatus;
        string scanDataUri;
        bytes32 verificationRequestId;
    }

    mapping(uint256 => ScanRequest) public requests;
    uint256 public nextRequestId;
    uint256 public constant MIN_PAYMENT = 0.01 ether; //Check to possible adjust for fair payment
    uint256 public constant PLATFORM_FEE_PERCENT = 1; // 1%

    // Chainlink Functions configuration
    bytes32 public donId;
    string public chainlinkFunctionsRouter;
    string public chainlinkFunctionsSubscriptionId;
    string public verificationOracleUrl;

    event RequestCreated(
        uint256 requestId,
        address requestor,
        string location,
        ScanType scanType,
        uint256 payment
    );
    event ScanAccepted(uint256 requestId, address scanner);
    event ScanSubmitted(uint256 requestId, address scanner, string scanDataUri);
    event VerificationRequested(uint256 requestId, bytes32 verificationRequestId);
    event ScanVerified(uint256 requestId, address scanner, bool approved);
    event FundsWithdrawn(uint256 requestId, address recipient, uint256 amount);

    constructor(
        address _functionsRouter,
        bytes32 _donId,
        uint64 _subscriptionId
    ) FunctionsClient(_functionsRouter) {
        chainlinkFunctionsRouter = _functionsRouter;
        donId = _donId;
        chainlinkFunctionsSubscriptionId = _subscriptionId.toString();
    }

    function createRequest(
        string memory location,
        ScanType scanType
    ) external payable {
        require(msg.value >= MIN_PAYMENT, "Insufficient payment");
        require(bytes(location).length > 0, "Location cannot be empty");

        requests[nextRequestId] = ScanRequest({
            requestor: msg.sender,
            location: location,
            scanType: scanType,
            payment: msg.value,
            scanner: address(0),
            fulfilled: false,
            verificationStatus: VerificationStatus.Pending,
            scanDataUri: "",
            verificationRequestId: ""
        });

        emit RequestCreated(nextRequestId, msg.sender, location, scanType, msg.value);
        nextRequestId++;
    }

    function acceptRequest(uint256 requestId) external nonReentrant {
        ScanRequest storage req = requests[requestId];
        require(req.scanner == address(0), "Already accepted");
        require(msg.sender != req.requestor, "Requestor cannot be scanner");
        req.scanner = msg.sender;
        emit ScanAccepted(requestId, msg.sender);
    }

    function submitScan(uint256 requestId, string memory scanDataUri) external nonReentrant {
        ScanRequest storage req = requests[requestId];
        require(msg.sender == req.scanner, "Not scanner");
        require(!req.fulfilled, "Already fulfilled");
        require(bytes(scanDataUri).length > 0, "Scan data URI cannot be empty");

        req.fulfilled = true;
        req.scanDataUri = scanDataUri;
        emit ScanSubmitted(requestId, msg.sender, scanDataUri);
    }

    function requestVerification(uint256 requestId) external nonReentrant {
        ScanRequest storage req = requests[requestId];
        require(req.fulfilled, "Scan not submitted");
        require(req.verificationStatus == VerificationStatus.Pending, "Already verified");

        // Prepare the Chainlink Functions request
        string[] memory args = new string[](3);
        args[0] = req.scanDataUri;
        args[1] = req.location;
        args[2] = req.scanType.toString();

        string[] memory sources = new string[](1);
        sources[0] = verificationOracleUrl;

        bytes memory requestBytes = abi.encodePacked(args, sources);

        // Send the request to Chainlink Functions
        bytes32 requestIdBytes32 = sendRequest(
            requestBytes,
            donId,
            chainlinkFunctionsSubscriptionId,
            300000, // Gas limit
            0.1 ether // LINK amount
        );

        req.verificationRequestId = requestIdBytes32;
        req.verificationStatus = VerificationStatus.Pending;
        emit VerificationRequested(requestId, requestIdBytes32);
    }

    function fulfillRequest(bytes32 requestId, bytes memory response)
        internal
        override
        onlyOwner
    {
        (uint256 requestIdUint, bool approved) = abi.decode(response, (uint256, bool));

        ScanRequest storage req = requests[requestIdUint];
        require(req.verificationRequestId == requestId, "Invalid request ID");
        require(req.verificationStatus == VerificationStatus.Pending, "Already verified");

        req.verificationStatus = approved ? VerificationStatus.Approved : VerificationStatus.Rejected;
        emit ScanVerified(requestIdUint, req.scanner, approved);
    }

    function withdrawScannerPayment(uint256 requestId) external nonReentrant {
        ScanRequest storage req = requests[requestId];
        require(msg.sender == req.scanner, "Only scanner can withdraw");
        require(req.verificationStatus == VerificationStatus.Approved, "Not approved");

        uint256 scannerPayment = (req.payment * PLATFORM_FEE_PERCENT) / 100;
        payable(req.scanner).transfer(scannerPayment);
        emit FundsWithdrawn(requestId, req.scanner, scannerPayment);
    }

    function withdrawRequestorFunds(uint256 requestId) external nonReentrant {
        ScanRequest storage req = requests[requestId];
        require(msg.sender == req.requestor, "Only requestor can withdraw");

        if (req.verificationStatus == VerificationStatus.Approved) {
            uint256 requestorRefund = req.payment - ((req.payment * PLATFORM_FEE_PERCENT) / 100);
            payable(req.requestor).transfer(requestorRefund);
            emit FundsWithdrawn(requestId, req.requestor, requestorRefund);
        } else if (req.verificationStatus == VerificationStatus.Rejected) {
            payable(req.requestor).transfer(req.payment);
            emit FundsWithdrawn(requestId, req.requestor, req.payment);
        } else {
            revert("Verification still pending");
        }
    }

    function setVerificationOracleUrl(string memory _url) external onlyOwner {
        verificationOracleUrl = _url;
    }
}