// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "hardhat/console.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Context} from "@openzeppelin/contracts/utils/Context.sol";
import {ConfirmedOwner} from "@chainlink/contracts/src/v0.8/shared/access/ConfirmedOwner.sol";
import {FunctionsClient} from "@chainlink/contracts/src/v0.8/functions/dev/v1_X/FunctionsClient.sol";
import {FunctionsRequest} from "@chainlink/contracts/src/v0.8/functions/dev/v1_X/libraries/FunctionsRequest.sol";
import {IFunctionsRouter} from "../lib/interfaces/IFunctionsRouter.sol";

//TODO: Update payment to increase for multiple scans, Verification logic and code

contract Scan4MeMarketplace is ReentrancyGuard, Ownable, FunctionsClient {
    using SafeERC20 for IERC20;
    using FunctionsRequest for FunctionsRequest.Request;

    enum ScanType { PHOTO_360, LIDAR, STANDARD_PHOTO, DRONE_SCAN, VIDEO_CAPTURE }
    enum VerificationStatus { NotRequested, Pending, Approved, Rejected, Canceled }

    struct ScanRequest {
        bool testMode;
        bool exists;
        address requestor;
        string location;
        ScanType scanType;
        uint256 payment;
        address scanner;
        bool fulfilled;
        bool accepted;
        VerificationStatus verificationStatus;
        string scanDataUri;
        uint256 requiredScans;
        uint256 submissions;
        bytes32 verificationRequestId;
        uint256 lastRejected; // Timestamp of last rejection
        bool scannerPaid;   //Flag to prevent double withdraws
    }

    uint256 public constant REJECTED_TIMEOUT = 3 days;
    mapping(uint256 => ScanRequest) private requests;
    mapping(bytes32 => uint256) public verifRequestId;
    uint256 public nextRequestId;
    //Check to possible adjust for fair payment
    function minPayment(ScanType scanType) public pure returns (uint256) {
        if (scanType == ScanType.PHOTO_360) return 0.045 ether;
        if (scanType == ScanType.LIDAR) return 0.05 ether;
        if (scanType == ScanType.STANDARD_PHOTO) return 0.025 ether;
        if (scanType == ScanType.DRONE_SCAN) return 0.12 ether;
        if (scanType == ScanType.VIDEO_CAPTURE) return 0.065 ether;

        revert("Unknown scan type");
    }

    // Chainlink Functions configuration
    bytes32 public donId;
    address public chainlinkFunctionsRouter;
    uint64 public chainlinkFunctionsSubscriptionId;
    string public verificationOracleUrl;
    string public verificationSourceCode;

    event RequestCreated(
        uint256 requestId,
        address requestor,
        string location,
        ScanType scanType,
        uint256 payment
    );
    event ScanAccepted(uint256 requestId, address scanner);
    event ScanSubmitted(uint256 requestId, address scanner, string scanDataUri);
    event RequestReopened(uint256 indexed requestId);
    event RequestCanceled(uint256 requestId);
    event RequestDeleted(uint256 requestId);
    event VerificationRequested(uint256 requestId, bytes32 verificationRequestId);
    event ScanVerified(uint256 requestId, address scanner, bool approved);
    event FundsWithdrawn(uint256 requestId, address recipient, uint256 amount);
    event DebugLog(string message, uint256 value);
    event DebugLogString(string message, string value);

    constructor(
        address _functionsRouter,
        bytes32 _donId,
        uint64 _subscriptionId
        ) Ownable(msg.sender) FunctionsClient(_functionsRouter) {
            emit DebugLog("Constructor called", 0);
        chainlinkFunctionsRouter = _functionsRouter;
        donId = _donId;
        chainlinkFunctionsSubscriptionId = _subscriptionId;
    }
    receive() external payable {}

    function getRequest(uint256 requestID) public view returns(ScanRequest memory){
        return requests[requestID];
    }

    function getRequestBasic(uint256 requestId) external view returns (
        bool testMode,
        bool exists,
        address requestor,
        string memory location,
        ScanType scanType,
        uint256 payment,
        address scanner,
        bool fulfilled,
        bool accepted
    ) {
        ScanRequest storage r = requests[requestId];
        return (
        r.testMode,
        r.exists,
        r.requestor,
        r.location,
        r.scanType,
        r.payment,
        r.scanner,
        r.fulfilled,
        r.accepted
        );
    }

    function getRequestVerification(uint256 requestId) external view returns (
        VerificationStatus verificationStatus,
        string memory scanDataUri,
        uint256 requiredScans,
        uint256 submissions,
        bytes32 verificationRequestId,
        uint256 lastRejected,
        bool scannerPaid
    ) {
        ScanRequest storage r = requests[requestId];
        return (
            r.verificationStatus,
            r.scanDataUri,
            r.requiredScans,
            r.submissions,
            r.verificationRequestId,
            r.lastRejected,
            r.scannerPaid
        );
    }

    function createRequest(
        string memory location,
        ScanType scanType,
        uint256 requiredScans) external payable {
        emit DebugLog("Entered createRequest", msg.value);
        uint256 minPay=minPayment(scanType);
        require(msg.value >= minPay, "Insufficient payment");
        emit DebugLog("Passed min payment", msg.value);
        require(bytes(location).length > 0, "Location cannot be empty");
        emit DebugLog("Passed location check", msg.value);

        ScanRequest storage r=requests[nextRequestId];
        r.testMode=testingMode;
        r.exists=true;
        r.requestor = msg.sender;
        r.location = location;
        r.scanType = scanType;
        r.payment = msg.value;
        r.scanner = address(0);
        r.fulfilled = false;
        r.accepted = false;
        r.verificationStatus = VerificationStatus.NotRequested;
        r.scanDataUri = "";
        r.requiredScans = requiredScans;
        r.submissions = 0;
        r.verificationRequestId = bytes32(0);
        r.lastRejected = 0;
        r.scannerPaid = false;
        nextRequestId++;
        emit RequestCreated(nextRequestId, msg.sender, location, scanType, msg.value);
    }
    //Work on allowing multiple people to accept a request, if they don't possess equipment
    //If they want a photo and a drone scan, one can accept the photo, another can accept the drone
    //Easiest would just be for only one scan type per request. Maybe see about allowing multiple scans per request.
    function acceptRequest(uint256 requestId) external nonReentrant {
        emit DebugLog("acceptRequest: entered", requestId);
        ScanRequest storage req = requests[requestId];
        emit DebugLog("acceptRequest: checking scanner", uint256(uint160(req.scanner)));
        require(req.scanner == address(0), "Already accepted"); 
        emit DebugLog("acceptRequest: checking sender doesn't match requestor", uint256(uint160(msg.sender))); 
        require(msg.sender != req.requestor, "Requestor cannot be scanner");
        emit DebugLog("acceptRequest: checking accepted", req.accepted ? 1 : 0);
        require(!req.accepted, "Request already accepted");
        req.scanner = msg.sender;
        req.accepted=true;
        emit ScanAccepted(requestId, msg.sender);
    }

    function submitScan(uint256 requestId, string memory scanDataUri) external nonReentrant {
        emit DebugLog("submitScan: entered", requestId);
        ScanRequest storage req = requests[requestId];
        req.scanDataUri = scanDataUri;
        req.submissions+=1;
        emit DebugLog("Scan submissions incremented", requestId);
        require(msg.sender == req.scanner, "Not scanner");
        emit DebugLog("submitScan: passed scanner check", requestId);
        require(req.verificationStatus==VerificationStatus.NotRequested||req.verificationStatus==VerificationStatus.Rejected, "Cannot submit scan now");
        emit DebugLog("submitScan: passed verificationStatus check", uint256(req.verificationStatus));
        require(bytes(scanDataUri).length > 0, "Scan data URI cannot be empty");
        emit DebugLogString("submitScan: contains data", scanDataUri);
        require(req.submissions>=req.requiredScans, "Not enough scans submitted");
        emit DebugLog("submitScan: passed submissions check", req.submissions);

        req.verificationRequestId=0;
        req.fulfilled=false;
        emit ScanSubmitted(requestId, msg.sender, scanDataUri);
        emit DebugLog("submitScan: completed", req.submissions);
    }

    function scanTypeToString(ScanType scanType) internal pure returns (string memory) {
        if (scanType == ScanType.PHOTO_360) return "PHOTO_360";
        if (scanType == ScanType.LIDAR) return "LIDAR";
        if (scanType == ScanType.STANDARD_PHOTO) return "STANDARD_PHOTO";
        if (scanType == ScanType.DRONE_SCAN) return "DRONE_SCAN";
        if (scanType == ScanType.VIDEO_CAPTURE) return "VIDEO_CAPTURE";
        revert("Unknown scan type");
    }

    bool public testingMode = true;
    uint256 public mockTime;
    function setTestingMode(bool _mode) external onlyOwner {
        testingMode = _mode;
    }
    function setMockTime(uint256 _mockTime) public {
        require(testingMode, "Not in testing mode");
        mockTime = _mockTime;
    }
    function _now() internal view returns (uint256) {
        return testingMode ? mockTime : block.timestamp;
    }

    function requestVerification(uint256 requestId) external nonReentrant{
        emit DebugLog("requestVerification: entered", requestId);
        ScanRequest storage req = requests[requestId];
        emit DebugLog("requestVerification: submissions", req.submissions);
        emit DebugLog("requestVerification: requiredScans", req.requiredScans);
        require(bytes(req.scanDataUri).length>0, "Scan not submitted");     //Must submit a scan to verify it
        emit DebugLogString("requestVerification: scanDataUri", req.scanDataUri);
        require(req.submissions >= req.requiredScans, "Not enough scans submitted");
        emit DebugLog("requestVerification: passed submissions check", req.submissions);
        require(!req.fulfilled, "Already fulfilled");       //Can't already be fulfilled
        emit DebugLog("requestVerification: passed fulfilled check", req.fulfilled ? 1 : 0);
        require(req.verificationStatus == VerificationStatus.NotRequested, "Verification already requested or completed");
        req.verificationStatus = VerificationStatus.Pending;
        emit DebugLog("requestVerification: passed verificationStatus check", uint256(req.verificationStatus));

        //Test mode bypass
        if (req.testMode) {
            emit DebugLogString("Entering test mode bypass", req.testMode ? "true" : "false");
            req.verificationRequestId = keccak256(abi.encodePacked(requestId, _now()));
            verifRequestId[req.verificationRequestId] = requestId + 1;
            req.verificationStatus = VerificationStatus.Pending;
            req.fulfilled = false;
            emit VerificationRequested(requestId, req.verificationRequestId);
            emit ScanVerified(requestId, req.scanner, true);
            return;
        }
        
        // Prepare the Chainlink Functions request
        string[] memory args = new string[](5);
            args[0] = Strings.toString(requestId);
            args[1] = req.scanDataUri;
            args[2] = req.location;
            args[3] = scanTypeToString(req.scanType);
            args[4] = verificationOracleUrl;


        FunctionsRequest.Request memory funcReq;
        funcReq._initializeRequestForInlineJavaScript(verificationSourceCode);
        funcReq._setArgs(args);

        bytes memory requestBytes = funcReq._encodeCBOR();

        bytes32 functionsRequestId = _sendRequest(
            requestBytes,
            chainlinkFunctionsSubscriptionId,
            uint32(300000),
            donId
        );

        req.verificationRequestId = functionsRequestId;
        verifRequestId[functionsRequestId] = requestId + 1;
        emit VerificationRequested(requestId, functionsRequestId);
    }

    function testFulfillRequest(bytes32 requestId, bytes memory response, bytes memory err) public {
        _fulfillRequest(requestId, response, err);
    }

    function _fulfillRequest(
        bytes32 requestId,
        bytes memory response,
        bytes memory err
    ) internal override {
        if (err.length > 0) {
            revert(string(err));
        }

        uint256 marketRequestIdPlusOne = verifRequestId[requestId];
        require(marketRequestIdPlusOne != 0, "Unknown verification request");

        uint256 marketRequestId = marketRequestIdPlusOne - 1;
        ScanRequest storage req = requests[marketRequestId];

        require(req.verificationRequestId == requestId, "Invalid request ID");
        require(req.verificationStatus == VerificationStatus.Pending, "No verification pending");

        (bool approved) = abi.decode(response, (bool));

        if (approved) {
            req.verificationStatus = VerificationStatus.Approved;
            req.fulfilled = true;
        }
        else {
            req.verificationStatus = VerificationStatus.Rejected;
            req.fulfilled = false;
            req.lastRejected = _now();
        }

        emit ScanVerified(marketRequestId, req.scanner, approved);
}

    function revertToOpen(uint256 requestId) external nonReentrant{
        ScanRequest storage req=requests[requestId];
        require(req.verificationStatus==VerificationStatus.Rejected, "Not rejected");
        emit DebugLog("revertToOpen: checking timeout", _now());
        emit DebugLog("revertToOpen: lastRejected", req.lastRejected);
        emit DebugLog("revertToOpen: timeout threshold", req.lastRejected + REJECTED_TIMEOUT);
        require(_now()>req.lastRejected+REJECTED_TIMEOUT, "Timeout not reached");
        
        req.scanner=address(0);
        req.accepted=false;
        req.verificationStatus=VerificationStatus.NotRequested;
        req.scanDataUri="";
        req.verificationRequestId=bytes32(0);
        req.fulfilled=false;
        emit RequestReopened(requestId);
    }

    function withdrawScannerPayment(uint256 requestId) external nonReentrant {
        ScanRequest storage req = requests[requestId];
        require(msg.sender == req.scanner, "Only scanner can withdraw");
        require(req.verificationStatus == VerificationStatus.Approved, "Not approved");
        require(!req.scannerPaid, "Already withdrawn");

        uint256 scannerPayment = req.payment;
        (bool success, ) = req.scanner.call{value: scannerPayment}("");
        require(success, "Transfer failed");
        req.scannerPaid = true;
        emit FundsWithdrawn(requestId, req.scanner, scannerPayment);
    }

    function cancelRequest(uint256 requestId) external nonReentrant {
        ScanRequest storage req = requests[requestId];
        require(req.exists, "Request doesn't exist");
        require(req.verificationStatus != VerificationStatus.Approved, "Cannot cancel after approval");
        require(req.verificationStatus != VerificationStatus.Canceled, "Already canceled");
        require(!req.accepted, "Cannot cancel after acceptance");
        require(msg.sender == req.requestor, "Only requestor can cancel");
        
        // Refund the payment before deleting
        uint256 amount = req.payment;
        req.payment = 0;
        (bool success, ) = req.requestor.call{value: amount}("");
        require(success, "Transfer failed");

        // Cancel and then Delete the request from storage
        delete requests[requestId];
        emit RequestCanceled(requestId);
        emit RequestDeleted(requestId);
    }

    function setVerificationSourceCode(string memory _code) external onlyOwner {
        verificationSourceCode = _code;
    }

    function setVerificationOracleUrl(string memory _url) external onlyOwner {
        verificationOracleUrl = _url;
    }
}