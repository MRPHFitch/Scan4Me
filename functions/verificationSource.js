// args[0] = requestId
// args[1] = scanDataUri
// args[2] = location
// args[3] = scanType

const requestId = args[0];
const scanDataUri = args[1];
const location = args[2];
const scanType = args[3];

function isValidScanType(value) {
  return ["PHOTO_360", "LIDAR", "STANDARD_PHOTO", "DRONE_SCAN", "VIDEO_CAPTURE"].includes(value);
}

function looksLikeImageUri(uri) {
  return (
    uri.startsWith("http://") ||
    uri.startsWith("https://") ||
    uri.startsWith("ipfs://")
  );
}

// Very rough MVP checks only.
// This does NOT prove the image is of the correct location.
const hasRequiredFields =
  typeof requestId === "string" &&
  requestId.length > 0 &&
  typeof scanDataUri === "string" &&
  scanDataUri.length > 0 &&
  typeof location === "string" &&
  location.length > 0 &&
  typeof scanType === "string" &&
  isValidScanType(scanType) &&
  looksLikeImageUri(scanDataUri);

const approved = hasRequiredFields;

return ethers.getBytes(
  ethers.AbiCoder.defaultAbiCoder().encode(["bool"], [approved])
);