export const scan4MeContractAddress = import.meta.env
  .VITE_SCAN4ME_CONTRACT_ADDRESS as `0x${string}`

export const scan4MeAbi = [
  {
    type: 'function',
    name: 'getRequest',
    stateMutability: 'view',
    inputs: [{ name: 'requestID', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          {name: 'testMode', type: 'bool'},
          { name: 'exists', type: 'bool' },
          { name: 'requestor', type: 'address' },
          { name: 'location', type: 'string' },
          { name: 'scanType', type: 'uint8' },
          { name: 'payment', type: 'uint256' },
          { name: 'scanner', type: 'address' },
          { name: 'fulfilled', type: 'bool' },
          { name: 'accepted', type: 'bool' },
          { name: 'verificationStatus', type: 'uint8' },
          { name: 'scanDataUri', type: 'string' },
          { name: 'requiredScans', type: 'uint256' },
          { name: 'submissions', type: 'uint256' },
          { name: 'verificationRequestId', type: 'bytes32' },
          { name: 'lastRejected', type: 'uint256' },
          { name: 'scannerPaid', type: 'bool' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'requests',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'exists', type: 'bool' },
          { name: 'requestor', type: 'address' },
          { name: 'location', type: 'string' },
          { name: 'scanType', type: 'uint8' },
          { name: 'payment', type: 'uint256' },
          { name: 'scanner', type: 'address' },
          { name: 'fulfilled', type: 'bool' },
          { name: 'accepted', type: 'bool' },
          { name: 'verificationStatus', type: 'uint8' },
          { name: 'scanDataUri', type: 'string' },
          { name: 'requiredScans', type: 'uint256' },
          { name: 'submissions', type: 'uint256' },
          { name: 'verificationRequestId', type: 'bytes32' },
          { name: 'lastRejected', type: 'uint256' },
          { name: 'scannerPaid', type: 'bool' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'nextRequestId',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'minPayment',
    stateMutability: 'pure',
    inputs: [{name: 'scanType', type: 'uint8'}],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'REJECTED_TIMEOUT',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'testingMode',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'mockTime',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'donId',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'chainlinkFunctionsRouter',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'chainlinkFunctionsSubscriptionId',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint64' }],
  },
  {
    type: 'function',
    name: 'verificationOracleUrl',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },

  {
    type: 'function',
    name: 'createRequest',
    stateMutability: 'payable',
    inputs: [
      { name: 'location', type: 'string' },
      { name: 'scanType', type: 'uint8' },
      { name: 'requiredScans', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'acceptRequest',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'requestId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'submitScan',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'requestId', type: 'uint256' },
      { name: 'scanDataUri', type: 'string' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'requestVerification',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'requestId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'revertToOpen',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'requestId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'withdrawScannerPayment',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'requestId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'cancelRequest',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'requestId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'setTestingMode',
    stateMutability: 'nonpayable',
    inputs: [{ name: '_mode', type: 'bool' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'setMockTime',
    stateMutability: 'nonpayable',
    inputs: [{ name: '_mockTime', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'testFulfillRequest',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'requestId', type: 'bytes32' },
      { name: 'response', type: 'bytes' },
      { name: 'err', type: 'bytes' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'setVerificationOracleUrl',
    stateMutability: 'nonpayable',
    inputs: [{ name: '_url', type: 'string' }],
    outputs: [],
  },

  {
    type: 'event',
    name: 'RequestCreated',
    inputs: [
      { name: 'requestId', type: 'uint256', indexed: false },
      { name: 'requestor', type: 'address', indexed: false },
      { name: 'location', type: 'string', indexed: false },
      { name: 'scanType', type: 'uint8', indexed: false },
      { name: 'payment', type: 'uint256', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'ScanAccepted',
    inputs: [
      { name: 'requestId', type: 'uint256', indexed: false },
      { name: 'scanner', type: 'address', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'ScanSubmitted',
    inputs: [
      { name: 'requestId', type: 'uint256', indexed: false },
      { name: 'scanner', type: 'address', indexed: false },
      { name: 'scanDataUri', type: 'string', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'RequestReopened',
    inputs: [{ name: 'requestId', type: 'uint256', indexed: true }],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'RequestCanceled',
    inputs: [{ name: 'requestId', type: 'uint256', indexed: false }],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'RequestDeleted',
    inputs: [{ name: 'requestId', type: 'uint256', indexed: false }],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'VerificationRequested',
    inputs: [
      { name: 'requestId', type: 'uint256', indexed: false },
      { name: 'verificationRequestId', type: 'bytes32', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'ScanVerified',
    inputs: [
      { name: 'requestId', type: 'uint256', indexed: false },
      { name: 'scanner', type: 'address', indexed: false },
      { name: 'approved', type: 'bool', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'FundsWithdrawn',
    inputs: [
      { name: 'requestId', type: 'uint256', indexed: false },
      { name: 'recipient', type: 'address', indexed: false },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
    anonymous: false,
  },
] as const

// import scan4MeAbiJson from './scan4me-abi.json'

// export const scan4MeContractAddress = import.meta.env
//   .VITE_SCAN4ME_CONTRACT_ADDRESS as `0x${string}`

// export const scan4MeAbi = scan4MeAbiJson