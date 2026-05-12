import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useEffect, useState } from 'react'
import {
  useAccount,
  usePublicClient,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from 'wagmi'
import { formatEther, parseEther } from 'viem'
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

type ContractRequest = {
  exists: boolean
  requestor: `0x${string}`
  location: string
  scanType: number
  payment: bigint
  scanner: `0x${string}`
  fulfilled: boolean
  accepted: boolean
  verificationStatus: number
  scanDataUri: string
  requiredScans: bigint
  submissions: bigint
  scannerPaid: boolean
}

function App() {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()

  const [location, setLocation] = useState('')
  const [scanType, setScanType] = useState<number>(0)
  const [requiredScans, setRequiredScans] = useState(1)
  const [paymentEth, setPaymentEth] = useState('0.01')

  const [requestId, setRequestId] = useState('')
  const [scanDataUri, setScanDataUri] = useState('')

  const [availableRequests, setAvailableRequests] = useState<
    Array<{ id: bigint; data: ContractRequest }>
  >([])
  const [loadingRequests, setLoadingRequests] = useState(false)
  const [requestsError, setRequestsError] = useState('')

  const requestIdValue = (() => {
    try {
      return BigInt(requestId || '0')
    } catch {
      return 0n
    }
  })()

  const hasSelectedRequest = requestId !== ''
  const canUseContract = Boolean(scan4MeContractAddress)

  const {
    data: nextRequestId,
    isLoading: loadingNextRequestId,
  } = useReadContract({
    address: scan4MeContractAddress,
    abi: scan4MeAbi,
    functionName: 'nextRequestId',
  })

  const { data: minPayment } = useReadContract({
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
    args: [requestIdValue],
  })

  useEffect(() => {
    if (!hasSelectedRequest) return
    if (!requestData) return

    void refetchRequest()
  }, [hasSelectedRequest, requestData, refetchRequest])

  const { writeContract, data: hash, isPending, error: writeError } =
    useWriteContract()

  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({ hash })

  const txBusy = isPending || isConfirming

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

  const loadRequests = async () => {
    if (!publicClient || nextRequestId == null) return

    setLoadingRequests(true)
    setRequestsError('')

    try {
      const total = BigInt(nextRequestId.toString())

      if (total === 0n) {
        setAvailableRequests([])
        setRequestId('')
        return
      }

      const readRequest = async (id: bigint) => {
        const data = await publicClient.readContract({
          address: scan4MeContractAddress,
          abi: scan4MeAbi,
          functionName: 'requests',
          args: [id],
        })

        return data as unknown as ContractRequest
      }

      // Guard for contracts that start IDs at 1 instead of 0.
      const firstZero = await readRequest(0n).catch(() => null)
      const firstOne = total > 0n ? await readRequest(1n).catch(() => null) : null

      const oneBased = !firstZero?.exists && Boolean(firstOne?.exists)
      const startId = oneBased ? 1n : 0n
      const endId = oneBased ? total : total - 1n

      if (endId < startId) {
        setAvailableRequests([])
        setRequestId('')
        return
      }

      const ids: bigint[] = []
      for (let id = startId; id <= endId; id += 1n) {
        ids.push(id)
      }

      const loaded = await Promise.allSettled(
        ids.map(async (id) => {
          const data = await readRequest(id)
          return { id, data }
        }),
      )

      const results = loaded
        .filter(
          (
            result,
          ): result is PromiseFulfilledResult<{
            id: bigint
            data: ContractRequest
          }> => result.status === 'fulfilled',
        )
        .map((result) => result.value)
        .filter((item) => item.data.exists)

      setAvailableRequests(results)
      setRequestId('')
    } catch (err) {
      setRequestsError(
        err instanceof Error ? err.message : 'Failed to load requests.',
      )
    } finally {
      setLoadingRequests(false)
    }
  }

  const selectedRequest = hasSelectedRequest ? requestData : undefined
  const isSelectedRequestAccepted = Boolean(selectedRequest?.accepted)

  const acceptRequest = () => {
    writeContract({
      address: scan4MeContractAddress,
      abi: scan4MeAbi,
      functionName: 'acceptRequest',
      args: [requestIdValue],
    })
  }

  const submitScan = () => {
    if (!scanDataUri) return

    writeContract({
      address: scan4MeContractAddress,
      abi: scan4MeAbi,
      functionName: 'submitScan',
      args: [requestIdValue, scanDataUri],
    })
  }

  const requestVerification = () => {
    writeContract({
      address: scan4MeContractAddress,
      abi: scan4MeAbi,
      functionName: 'requestVerification',
      args: [requestIdValue],
    })
  }

  const withdrawScannerPayment = () => {
    writeContract({
      address: scan4MeContractAddress,
      abi: scan4MeAbi,
      functionName: 'withdrawScannerPayment',
      args: [requestIdValue],
    })
  }

  const revertToOpen = () => {
    writeContract({
      address: scan4MeContractAddress,
      abi: scan4MeAbi,
      functionName: 'revertToOpen',
      args: [requestIdValue],
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
            <strong>Next request ID: </strong>
            <span>
              {loadingNextRequestId ? 'Loading...' : nextRequestId?.toString() ?? '0'}
            </span>
          </div>

          <div className="stat">
            <strong>Min payment: </strong>
            <span>{minPayment ? `${formatEther(minPayment)} ETH` : 'Loading...'}</span>
          </div>
        </aside>
      </section>

      <section className="grid">
        <article className="card">
          <h2>Create request</h2>

          <div className="form">
            <label className="field">
              <span className="field-label">Location Desired</span>
              <input
                className="field-control"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </label>

            <label className="field">
              <span className="field-label">Scan type</span>
              <select
                className="field-control"
                value={scanType}
                onChange={(e) => setScanType(Number(e.target.value))}
              >
                {scanTypeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="field-label">How many scans required?</span>
              <input
                className="field-control"
                type="number"
                min="1"
                value={requiredScans}
                onChange={(e) => setRequiredScans(Number(e.target.value))}
              />
            </label>

            <label className="field">
              <span className="field-label">Payment in ETH</span>
              <input
                className="field-control"
                value={paymentEth}
                onChange={(e) => setPaymentEth(e.target.value)}
              />
            </label>

            <button
              type="button"
              onClick={createRequest}
              disabled={!isConnected || txBusy}
            >
              {isPending ? 'Submitting...' : 'Create request'}
            </button>
          </div>
        </article>

        <article className="card">
          <h2>Request actions</h2>

          <div className="form">
            <button
              type="button"
              onClick={loadRequests}
              disabled={!isConnected || loadingRequests}
            >
              {loadingRequests ? 'Loading requests...' : 'Load requests'}
            </button>

            {requestsError ? <p className="tx error">{requestsError}</p> : null}

            {availableRequests.length > 0 ? (
              <div className="request-list">
                {availableRequests.map((item) => {
                  const selected = requestId === item.id.toString()

                  return (
                    <button
                      key={item.id.toString()}
                      type="button"
                      className={`request-item ${selected ? 'request-item-active' : ''}`}
                      onClick={() => setRequestId(item.id.toString())}
                    >
                      <div className="request-item-top">
                        <strong>Request #{item.id.toString()}</strong>
                        <span>{item.data.accepted ? 'Accepted' : 'Open'}</span>
                      </div>
                      <div className="request-item-meta">
                        <span>{item.data.location || 'No location set'}</span>
                        <span>Scans: {item.data.requiredScans.toString()}</span>
                        <span>Submissions: {item.data.submissions.toString()}</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            ) : null}

            {hasSelectedRequest ? (
              <>
                {!isSelectedRequestAccepted ? (
                  <div className="button-row">
                    <button
                      type="button"
                      onClick={acceptRequest}
                      disabled={!isConnected || txBusy}
                    >
                      Accept request
                    </button>

                    <button
                      type="button"
                      onClick={() => setRequestId('')}
                      disabled={txBusy}
                    >
                      Back to list
                    </button>
                  </div>
                ) : (
                  <>
                    <label className="field">
                      <span className="field-label">Scan data URI</span>
                      <input
                        className="field-control"
                        value={scanDataUri}
                        onChange={(e) => setScanDataUri(e.target.value)}
                        placeholder="ipfs://... or data URI"
                      />
                    </label>

                    <div className="button-row">
                      <button
                        type="button"
                        onClick={submitScan}
                        disabled={!isConnected || txBusy || !scanDataUri}
                      >
                        Submit scan
                      </button>
                      <button
                        type="button"
                        onClick={requestVerification}
                        disabled={!isConnected || txBusy}
                      >
                        Verify
                      </button>
                      <button
                        type="button"
                        onClick={withdrawScannerPayment}
                        disabled={!isConnected || txBusy}
                      >
                        Withdraw
                      </button>
                      <button
                        type="button"
                        onClick={revertToOpen}
                        disabled={!isConnected || txBusy}
                      >
                        Reopen
                      </button>
                      <button
                        type="button"
                        onClick={() => setRequestId('')}
                        disabled={txBusy}
                      >
                        Back to list
                      </button>
                    </div>
                  </>
                )}
              </>
            ) : (
              <p className="tx">Load requests, then click one request to continue.</p>
            )}
          </div>
        </article>

        <article className="card">
          <h2>Request preview</h2>
          {selectedRequest ? (
            <div className="preview">
              <p>
                <strong>Exists:</strong> {String(selectedRequest.exists)}
              </p>
              <p>
                <strong>Requestor:</strong> {selectedRequest.requestor}
              </p>
              <p>
                <strong>Location:</strong> {selectedRequest.location}
              </p>
              <p>
                <strong>Scan type:</strong> {selectedRequest.scanType.toString()}
              </p>
              <p>
                <strong>Payment:</strong> {selectedRequest.payment.toString()}
              </p>
              <p>
                <strong>Scanner:</strong> {selectedRequest.scanner}
              </p>
              <p>
                <strong>Fulfilled:</strong> {String(selectedRequest.fulfilled)}
              </p>
              <p>
                <strong>Accepted:</strong> {String(selectedRequest.accepted)}
              </p>
              <p>
                <strong>Verification:</strong>{' '}
                {selectedRequest.verificationStatus.toString()}
              </p>
              <p>
                <strong>Scan URI:</strong> {selectedRequest.scanDataUri || '—'}
              </p>
              <p>
                <strong>Required scans:</strong>{' '}
                {selectedRequest.requiredScans.toString()}
              </p>
              <p>
                <strong>Submissions:</strong>{' '}
                {selectedRequest.submissions.toString()}
              </p>
              <p>
                <strong>Scanner paid:</strong> {String(selectedRequest.scannerPaid)}
              </p>
            </div>
          ) : (
            <p>Select a loaded request to inspect it.</p>
          )}
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