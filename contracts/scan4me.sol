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
import {IFunctionsRouter} from "../lib/interfaces/IFunctionsRouter.sol";

//TODO: Min_Payment 

contract Scan4MeMarketplace is ReentrancyGuard, Ownable, FunctionsClient {
    using SafeERC20 for IERC20;

    enum ScanType { PHOTO_360, LIDAR, STANDARD_PHOTO, DRONE_SCAN, VIDEO_CAPTURE }
    enum VerificationStatus { NotRequested, Pending, Approved, Rejected }

    struct ScanRequest {
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
    mapping(uint256 => ScanRequest) public requests;
    uint256 public nextRequestId;
    uint256 public constant MIN_PAYMENT = 0.00 ether; //Check to possible adjust for fair payment
    uint256 public constant SCANNER_PAYMENT = 100; // 100% Not sure about this. Double check it

    // Chainlink Functions configuration
    bytes32 public donId;
    address public chainlinkFunctionsRouter;
    uint32 public chainlinkFunctionsSubscriptionId;
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
    event RequestReopened(uint256 indexed requestId);
    event VerificationRequested(uint256 requestId, bytes32 verificationRequestId);
    event ScanVerified(uint256 requestId, address scanner, bool approved);
    event FundsWithdrawn(uint256 requestId, address recipient, uint256 amount);
    event DebugLog(string message, uint256 value);
    event DebugLogString(string message, string value);

    constructor(
        address _functionsRouter,
        bytes32 _donId,
        uint32 _subscriptionId
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

    function createRequest(
        string memory location,
        ScanType scanType,
        uint256 requiredScans) external payable {
        emit DebugLog("Entered createRequest", msg.value);
        require(msg.value >= MIN_PAYMENT, "Insufficient payment");
        emit DebugLog("Passed min payment", msg.value);
        require(bytes(location).length > 0, "Location cannot be empty");
        emit DebugLog("Passed location check", msg.value);

        requests[nextRequestId] = ScanRequest({
            requestor: msg.sender,
            location: location,
            scanType: scanType,
            payment: msg.value,
            scanner: address(0),
            fulfilled: false,
            accepted: false,
            verificationStatus: VerificationStatus.NotRequested,
            scanDataUri: "",
            requiredScans: requiredScans,
            submissions: 0,
            verificationRequestId: bytes32(0),
            lastRejected: 0,
            scannerPaid: false
        });
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
    bool public rejected=false;
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
        if (testingMode) {
            emit DebugLogString("Entering test mode bypass", testingMode ? "true" : "false");
            req.verificationRequestId = keccak256(abi.encodePacked(requestId, _now()));
            req.verificationStatus = VerificationStatus.Pending;
            req.fulfilled = false;
            emit VerificationRequested(requestId, req.verificationRequestId);
            emit ScanVerified(requestId, req.scanner, true);
            return;
        }
        
        // Prepare the Chainlink Functions request
        string[] memory args = new string[](3);
        args[0] = req.scanDataUri;
        args[1] = req.location;
        args[2] = scanTypeToString(req.scanType);

        string[] memory sources = new string[](1);
        sources[0] = verificationOracleUrl;

        bytes memory requestBytes = abi.encode(args, sources);

        // Send the request to Chainlink Functions
        bytes32 requestIdBytes32 = _sendRequest(
        requestBytes,
        uint64(uint256(donId)),
        chainlinkFunctionsSubscriptionId,
        bytes32(uint256(300000)) // Gas limit
        );

        req.verificationRequestId = requestIdBytes32;
        req.verificationStatus = VerificationStatus.Pending;
        emit VerificationRequested(requestId, requestIdBytes32);
    }

    function testFulfillRequest(bytes32 requestId, bytes memory response, bytes memory err) public {
        _fulfillRequest(requestId, response, err);
    }

    function _fulfillRequest(bytes32 requestId,bytes memory response,bytes memory err)
    internal override {
        (uint256 uintrequestID, bool approved) = abi.decode(response, (uint256, bool));
        //Set a test mode bypass
        if (testingMode ) {
            // Decode the requestId to uint256 (if needed)
            // Simulate a successful approval (or rejection)
            ScanRequest storage test = requests[uintrequestID];
            if (approved) {
                test.verificationStatus = VerificationStatus.Approved;
                test.fulfilled = true;
                test.scannerPaid=false;
            } 
            else {
                test.verificationStatus = VerificationStatus.Rejected;
                test.fulfilled = false;
                test.lastRejected = _now();
            }
            emit ScanVerified(uintrequestID, test.scanner, true); // true = approved
            return;
        }

        if (err.length > 0) {
        revert(string(err));
        }
        
        // Retrieve the request
        ScanRequest storage req = requests[uintrequestID];
        require(req.verificationRequestId == requestId, "Invalid request ID");
        require(req.verificationStatus == VerificationStatus.Pending, "No verification pending");

        // Update the verification status
        if(approved){
            req.verificationStatus=VerificationStatus.Approved;
            req.fulfilled=true;
        }
        else{
            req.verificationStatus=VerificationStatus.Rejected;
            req.fulfilled=false;
            req.lastRejected=_now();
        }
        emit ScanVerified(uintrequestID, req.scanner, approved);
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

        uint256 scannerPayment = (req.payment * SCANNER_PAYMENT) / 100;
        console.log("Scanner payment comes out to:", scannerPayment);
        (bool success, ) = req.scanner.call{value: scannerPayment}("");
        emit DebugLog("Contract balance before send", address(this).balance);
        require(success, "Transfer failed");
        req.scannerPaid=true;
        emit DebugLog("Contract balance after send", address(this).balance);
        emit FundsWithdrawn(requestId, req.scanner, scannerPayment);
    }

    function withdrawRequestorFunds(uint256 requestId) external nonReentrant {
        ScanRequest storage req = requests[requestId];
        require(msg.sender == req.requestor, "Only requestor can withdraw");

        if (req.verificationStatus == VerificationStatus.Approved) {
            uint256 requestorRefund = req.payment - ((req.payment * SCANNER_PAYMENT) / 100);
            (bool success, ) = req.requestor.call{value: requestorRefund}("");
            require(success, "Transfer failed");
            emit FundsWithdrawn(requestId, req.requestor, requestorRefund);
        } else if (req.verificationStatus == VerificationStatus.Rejected) {
            (bool success, ) = req.requestor.call{value: req.payment}("");
            require(success, "Transfer failed");
            emit FundsWithdrawn(requestId, req.requestor, req.payment);
        } else {
            revert("Verification still pending");
        }
    }

    function setVerificationOracleUrl(string memory _url) external onlyOwner {
        verificationOracleUrl = _url;
    }
}