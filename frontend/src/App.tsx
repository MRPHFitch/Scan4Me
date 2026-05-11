import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useMemo, useState } from 'react'
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from 'wagmi'
import { parseEther } from 'viem'
import { scan4MeAbi, scan4MeContractAddress } from './contract'
import './App.css'

function shortAddress(address?: string) {
  if (!address) return ''
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

const scanTypeOptions = [
  { label: 'PHOTO_360', value: 0 },
  { label: 'LIDAR', value: 1 },
  { label: 'STANDARD_PHOTO', value: 2 },
  { label: 'DRONE_SCAN', value: 3 },
  { label: 'VIDEO_CAPTURE', value: 4 },
] as const

function App() {
  const { address, isConnected } = useAccount()

  const [location, setLocation] = useState('')
  const [scanType, setScanType] = useState<number>(0)
  const [requiredScans, setRequiredScans] = useState(1)
  const [paymentEth, setPaymentEth] = useState('0.01')

  const [requestId, setRequestId] = useState('0')
  const [scanDataUri, setScanDataUri] = useState('')

  const [testingMode, setTestingMode] = useState(true)
  const [mockTime, setMockTime] = useState('')

  const {
    data: nextRequestId,
    // refetch: refetchNextRequestId,
    isLoading: loadingNextRequestId,
  } = useReadContract({
    address: scan4MeContractAddress,
    abi: scan4MeAbi,
    functionName: 'nextRequestId',
  })

  const {
    data: minPayment,
    // refetch: refetchMinPayment,
  } = useReadContract({
    address: scan4MeContractAddress,
    abi: scan4MeAbi,
    functionName: 'MIN_PAYMENT',
  })

  const {
    data: requestData,
    refetch: refetchRequest,
  } = useReadContract({
    address: scan4MeContractAddress,
    abi: scan4MeAbi,
    functionName: 'requests',
    args: [BigInt(requestId || '0')],
  })

  const { writeContract, data: hash, isPending, error: writeError } =
    useWriteContract()

  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({ hash })

  const txBusy = isPending || isConfirming

  const canUseContract = useMemo(() => Boolean(scan4MeContractAddress), [])

  const createRequest = () => {
    if (!location || !paymentEth) return

    writeContract({
      address: scan4MeContractAddress,
      abi: scan4MeAbi,
      functionName: 'createRequest',
      args: [location, scanType, BigInt(requiredScans)],
      value: parseEther(paymentEth),
    })
  }

  const acceptRequest = () => {
    writeContract({
      address: scan4MeContractAddress,
      abi: scan4MeAbi,
      functionName: 'acceptRequest',
      args: [BigInt(requestId)],
    })
  }

  const submitScan = () => {
    if (!scanDataUri) return

    writeContract({
      address: scan4MeContractAddress,
      abi: scan4MeAbi,
      functionName: 'submitScan',
      args: [BigInt(requestId), scanDataUri],
    })
  }

  const requestVerification = () => {
    writeContract({
      address: scan4MeContractAddress,
      abi: scan4MeAbi,
      functionName: 'requestVerification',
      args: [BigInt(requestId)],
    })
  }

  const cancelRequest = () => {
    writeContract({
      address: scan4MeContractAddress,
      abi: scan4MeAbi,
      functionName: 'cancelRequest',
      args: [BigInt(requestId)],
    })
  }

  const withdrawScannerPayment = () => {
    writeContract({
      address: scan4MeContractAddress,
      abi: scan4MeAbi,
      functionName: 'withdrawScannerPayment',
      args: [BigInt(requestId)],
    })
  }

  const revertToOpen = () => {
    writeContract({
      address: scan4MeContractAddress,
      abi: scan4MeAbi,
      functionName: 'revertToOpen',
      args: [BigInt(requestId)],
    })
  }

  const setMode = () => {
    writeContract({
      address: scan4MeContractAddress,
      abi: scan4MeAbi,
      functionName: 'setTestingMode',
      args: [testingMode],
    })
  }

  const setMockTimeOnChain = () => {
    if (!mockTime) return

    writeContract({
      address: scan4MeContractAddress,
      abi: scan4MeAbi,
      functionName: 'setMockTime',
      args: [BigInt(mockTime)],
    })
  }

  return (
    <main className="shell">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Scan4Me</p>
          <h1>Create scan requests to turn the world into 3D.</h1>
          <p className="lede">
            A contract dashboard for creating scan jobs, accepting requests,
            submitting scan data, and triggering verification.
          </p>

          <div className="pill-row">
            <span className="pill">Request</span>
            <span className="pill">Accept</span>
            <span className="pill">Submit</span>
            <span className="pill">Verify</span>
          </div>
        </div>

        <aside className="wallet-card">
          <ConnectButton />
          <div className="wallet-status">
            <span className={`dot ${isConnected ? 'dot-on' : ''}`} />
            <span>
              {isConnected
                ? `Connected: ${shortAddress(address)}`
                : 'Wallet disconnected'}
            </span>
          </div>

          <div className="stat">
            <strong>Next request ID</strong>
            <span>{loadingNextRequestId ? 'Loading...' : nextRequestId?.toString() ?? '0'}</span>
          </div>

          <div className="stat">
            <strong>Min payment</strong>
            <span>
              {minPayment ? `${Number(minPayment) / 1e18} ETH` : 'Loading...'}
            </span>
          </div>
        </aside>
      </section>

      <section className="grid">
        <article className="card">
          <h2>Create request</h2>

          <div className="form">
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Location"
            />

            <select
              value={scanType}
              onChange={(e) => setScanType(Number(e.target.value))}
            >
              {scanTypeOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            <input
              type="number"
              min="1"
              value={requiredScans}
              onChange={(e) => setRequiredScans(Number(e.target.value))}
              placeholder="Required scans"
            />

            <input
              value={paymentEth}
              onChange={(e) => setPaymentEth(e.target.value)}
              placeholder="Payment in ETH"
            />

            <button type="button" onClick={createRequest} disabled={!isConnected || txBusy}>
              {isPending ? 'Submitting...' : 'Create request'}
            </button>
          </div>
        </article>

        <article className="card">
          <h2>Request actions</h2>

          <div className="form">
            <input
              value={requestId}
              onChange={(e) => setRequestId(e.target.value)}
              placeholder="Request ID"
            />

            <input
              value={scanDataUri}
              onChange={(e) => setScanDataUri(e.target.value)}
              placeholder="Scan data URI"
            />

            <div className="button-row">
             <button type="button" onClick={() => refetchRequest()}>Load request</button>
              <button type="button" onClick={acceptRequest} disabled={!isConnected || txBusy}>
                Accept
              </button>
              <button type="button" onClick={submitScan} disabled={!isConnected || txBusy}>
                Submit scan
              </button>
              <button type="button" onClick={requestVerification} disabled={!isConnected || txBusy}>
                Verify
              </button>
              <button type="button" onClick={cancelRequest} disabled={!isConnected || txBusy}>
                Cancel
              </button>
              <button type="button" onClick={withdrawScannerPayment} disabled={!isConnected || txBusy}>
                Withdraw
              </button>
              <button type="button" onClick={revertToOpen} disabled={!isConnected || txBusy}>
                Reopen
              </button>
            </div>
          </div>
        </article>

        <article className="card">
          <h2>Request preview</h2>
          {requestData ? (
            <div className="preview">
              <p><strong>Exists:</strong> {String(requestData.exists)}</p>
              <p><strong>Requestor:</strong> {requestData.requestor}</p>
              <p><strong>Location:</strong> {requestData.location}</p>
              <p><strong>Scan type:</strong> {requestData.scanType.toString()}</p>
              <p><strong>Payment:</strong> {requestData.payment.toString()}</p>
              <p><strong>Scanner:</strong> {requestData.scanner}</p>
              <p><strong>Fulfilled:</strong> {String(requestData.fulfilled)}</p>
              <p><strong>Accepted:</strong> {String(requestData.accepted)}</p>
              <p><strong>Verification:</strong> {requestData.verificationStatus.toString()}</p>
              <p><strong>Scan URI:</strong> {requestData.scanDataUri}</p>
              <p><strong>Required scans:</strong> {requestData.requiredScans.toString()}</p>
              <p><strong>Submissions:</strong> {requestData.submissions.toString()}</p>
            </div>
          ) : (
            <p>Load a request to inspect it.</p>
          )}
        </article>

        <article className="card">
          <h2>Admin / test tools</h2>

          <div className="form">
            <label className="checkbox-row">
              <input
                type="checkbox"
                onClick={setMode}
                onChange={(e) => setTestingMode(e.target.checked)}
              />
              Testing mode
            </label>

            <input
              value={mockTime}
              onChange={(e) => setMockTime(e.target.value)}
              placeholder="Mock time (unix seconds)"
            />

            <button type="button" onClick={setMockTimeOnChain} disabled={!isConnected || txBusy}>
              Set mock time
            </button>
          </div>
        </article>
      </section>

      {hash ? <p className="tx">Tx hash: {hash}</p> : null}
      {isConfirmed ? <p className="tx success">Transaction confirmed.</p> : null}
      {writeError ? <p className="tx error">Transaction failed.</p> : null}

      {!canUseContract ? <p className="tx error">Missing contract address.</p> : null}
    </main>
  )
}

export default App