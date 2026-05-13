import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useEffect, useState, useCallback } from 'react'
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

function shortLocation(location: string) {
  return location.trim().split(/\s+/)[0] || 'Request'
}

function getRevertReason(error: unknown) {
  if (typeof error !== 'object' || error === null) {
    return 'Transaction failed.'
  }

  const e = error as {
    shortMessage?: string
    message?: string
    details?: string
  }

  const text = e.shortMessage ?? e.details ?? e.message ?? 'Transaction failed.'

  const match = text.match(/reason:\s*(.*?)(?:\s*Contract Call:|$)/s)
  return match?.[1]?.trim() ?? text.trim()
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
  verificationRequestId: `0x${string}`
  lastRejected: bigint
  scannerPaid: boolean
}

function App() {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const [location, setLocation] = useState('')
  const [scanType, setScanType] = useState<number>(0)
  const [requiredScans, setRequiredScans] = useState(1)
  const [ethPriceUsd, setEthPriceUsd] = useState<number | null>(null)
  const [paymentEth, setPaymentEth] = useState('0.045')
  const [requestId, setRequestId] = useState('')
  const [availableRequests, setAvailableRequests] = useState<
    Array<{ id: bigint; data: ContractRequest }>
  >([])
  const [loadingRequests, setLoadingRequests] = useState(false)
  const [requestsError, setRequestsError] = useState('')
  const [scanFile, setScanFile] = useState<File | null>(null)
  const [uploadingScan, setUploadingScan] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [actionError, setActionError] = useState('')
  const { writeContract, data: hash, isPending, error: writeError } = useWriteContract()
  const clearStatus = useCallback(() => {setActionError('')}, [])
  // const selectedRequestItem =
  // availableRequests.find((item) => item.id.toString() === requestId) ?? null
  // const otherRequests = availableRequests.filter(
  // (item) => item.id.toString() !== requestId,
// )
  

  function getScanTypeLabel(value: number) {
    return scanTypeOptions.find((opt) => opt.value === value)?.label ?? String(value)
  }

  function getVerificationStatusLabel(value: number) {
    switch (value) {
      case 0:
        return 'NotRequested'
      case 1:
        return 'Pending'
      case 2:
        return 'Approved'
      case 3:
        return 'Rejected'
      case 4:
        return 'Canceled'
      default:
        return String(value)
    }
  }

  async function uploadFileToIpfs(file: File): Promise<string> {
    const formData = new FormData()
    formData.append('file', file)

    const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${import.meta.env.VITE_PINATA_JWT}`,
      },
      body: formData,
    })

    if (!res.ok) {
      throw new Error(`IPFS upload failed: ${res.statusText}`)
    }

    const json = await res.json()
    return `ipfs://${json.IpfsHash}`
  }

  const requestIdValue = (() => {
    try {
      return BigInt(requestId || '0')
    } catch {
      return 0n
    }
  })()

  const hasSelectedRequest = requestId !== ''
  const canUseContract = Boolean(scan4MeContractAddress)
  const viewer = address?.toLowerCase()

  const {
    data: nextRequestIdData,
    isLoading: loadingNextRequestId,
  } = useReadContract({
    address: scan4MeContractAddress,
    abi: scan4MeAbi,
    functionName: 'nextRequestId',
  })

  const nextRequestId = nextRequestIdData as bigint | undefined

  const { data: minPaymentData } = useReadContract({
    address: scan4MeContractAddress,
    abi: scan4MeAbi,
    functionName: 'MIN_PAYMENT',
  })

  const minPayment = minPaymentData as bigint | undefined

  const {
    data: requestDataData,
    refetch: refetchRequest,
  } = useReadContract({
    address: scan4MeContractAddress,
    abi: scan4MeAbi,
    functionName: 'getRequest',
    args: [requestIdValue],
  })

  const requestData = requestDataData as ContractRequest | undefined

  useEffect(() => {
    if (!hasSelectedRequest) return
    void refetchRequest()
  }, [hasSelectedRequest, requestIdValue, refetchRequest])

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

  const loadRequests = useCallback(async () => {
    clearStatus()
    if (!publicClient) {
      setRequestsError('No public client available.')
      return
    }

    if (nextRequestId == null) {
      setRequestsError('nextRequestId not loaded yet.')
      return
    }

    try {
      setLoadingRequests(true)
      setRequestsError('')

      const total = nextRequestId

      if (total === 0n) {
        setAvailableRequests([])
        setRequestId('')
        return
      }

      const ids: bigint[] = []
      for (let id = 0n; id < total; id += 1n) {
        ids.push(id)
      }

      const loaded = await Promise.allSettled(
        ids.map(async (id) => {
          const data = await publicClient.readContract({
            address: scan4MeContractAddress,
            abi: scan4MeAbi,
            functionName: 'getRequest',
            args: [id],
          })

          return { id, data: data as ContractRequest }
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
        .sort((a, b) => Number(b.id - a.id))

      setAvailableRequests(results)
      setRequestId('')
    } catch (err) {
      setRequestsError(
        err instanceof Error ? err.message : 'Failed to load requests.',
      )
    } finally {
      setLoadingRequests(false)
    }
  }, [publicClient, nextRequestId, clearStatus])

  useEffect(() => {
    if (!isConfirmed) return

    const refresh = async () => {
      await refetchRequest()
      await loadRequests()
    }

    void refresh()
  }, [isConfirmed, refetchRequest, loadRequests])

  const selectedRequest = hasSelectedRequest ? requestData : undefined
  const isSelectedRequestAccepted = Boolean(selectedRequest?.accepted)
  const requestor = selectedRequest?.requestor?.toLowerCase()
  const scanner = selectedRequest?.scanner?.toLowerCase()
//   const selectedRequestItem = availableRequests.find(
//   (item) => item.id.toString() === requestId,
// )

  const isViewerRequestor = viewer && requestor && viewer === requestor
  const isViewerScanner = viewer && scanner && viewer === scanner
  const canSeePrivateDetails =
    Boolean(selectedRequest?.accepted) && (isViewerRequestor || isViewerScanner)

  useEffect(() => {
    const loadPrice = async () => {
      try {
        const res = await fetch(
          'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd',
        )
        const json = await res.json()
        setEthPriceUsd(json.ethereum.usd)
      } catch {
        setEthPriceUsd(null)
      }
    }

    void loadPrice()
  }, [])

  function formatUsd(value: number) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(value)
  }

  const createPaymentEth = Number(paymentEth || 0)
  const createPaymentUsd =
    ethPriceUsd != null ? createPaymentEth * ethPriceUsd : null

  const selectedPaymentEth = selectedRequest
    ? Number(formatEther(selectedRequest.payment))
    : 0

  const selectedPaymentUsd =
    ethPriceUsd != null ? selectedPaymentEth * ethPriceUsd : null

  const acceptRequest = async () => {
    clearStatus()
    try {
      setActionError('')
      if (!publicClient || !address) {
        setActionError('No client or wallet available.')
        return
      }

      await publicClient?.simulateContract({
        address: scan4MeContractAddress,
        abi: scan4MeAbi,
        functionName: 'acceptRequest',
        args: [requestIdValue],
        account: address,
      })

      writeContract({
        address: scan4MeContractAddress,
        abi: scan4MeAbi,
        functionName: 'acceptRequest',
        args: [requestIdValue],
      })
    } catch (err) {
      setActionError(getRevertReason(err))
    }
  }

  const submitScan = async () => {
    clearStatus()
    if (!scanFile) {
      setUploadError('Please choose a file first.')
      return
    }

    try {
      setUploadingScan(true)
      setUploadError('')

      const ipfsUri = await uploadFileToIpfs(scanFile)

      writeContract({
        address: scan4MeContractAddress,
        abi: scan4MeAbi,
        functionName: 'submitScan',
        args: [requestIdValue, ipfsUri],
      })
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setUploadingScan(false)
    }
  }

  const requestVerification = () => {
    clearStatus()
    writeContract({
      address: scan4MeContractAddress,
      abi: scan4MeAbi,
      functionName: 'requestVerification',
      args: [requestIdValue],
    })
  }

  const withdrawScannerPayment = () => {
    clearStatus()
    writeContract({
      address: scan4MeContractAddress,
      abi: scan4MeAbi,
      functionName: 'withdrawScannerPayment',
      args: [requestIdValue],
    })
  }

  const revertToOpen = () => {
    clearStatus()
    writeContract({
      address: scan4MeContractAddress,
      abi: scan4MeAbi,
      functionName: 'revertToOpen',
      args: [requestIdValue],
    })
  }

//   function RequestCard({
//   item,
//   selected,
//   onSelect,
//   children,
// }: {
//   item: RequestItemType
//   selected?: boolean
//   onSelect: () => void
//   children?: React.ReactNode
// }) {
//   return (
//     <button
//       type="button"
//       className={`request-item ${selected ? 'request-item-active' : ''}`}
//       onClick={onSelect}
//     >
//       <div className="request-item-top">
//         <strong>Request {shortLocation(item.data.location)}</strong>
//         <span>{item.data.accepted ? 'Accepted' : 'Open'}</span>
//       </div>

//       <div className="request-item-meta">
//         <span>{item.data.location || 'No location set'}</span>
//         <span>Scans: {item.data.requiredScans.toString()}</span>
//         <span>Submissions: {item.data.submissions.toString()}</span>
//       </div>

//       {children ? <div className="request-item-actions">{children}</div> : null}
//     </button>
//   )
// }

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
              {loadingNextRequestId
                ? 'Loading...'
                : nextRequestId?.toString() ?? '0'}
            </span>
          </div>

          <div className="stat">
            <strong>Min payment: </strong>
            <span>
              {minPayment ? `${formatEther(minPayment)} ETH` : 'Loading...'}
            </span>
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
              <p className="tx">
                Estimated payment: {createPaymentEth.toFixed(4)} ETH
                {createPaymentUsd != null ? ` (${formatUsd(createPaymentUsd)})` : ''}
              </p>
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
            {actionError ? <p className="tx error">{actionError}</p> : null}
            {writeError ? <p className="tx error">{getRevertReason(writeError)}</p> : null}
            {availableRequests.length > 0 ? (
              <div className="request-list">
                {availableRequests.map((item) => {
                  const selected = requestId === item.id.toString()

                  return (
                    <button
                      key={item.id.toString()}
                      type="button"
                      className={`request-item ${selected ? 'request-item-active' : ''
                        }`}
                      onClick={() => setRequestId(item.id.toString())}
                    >
                      <div className="request-item-top">
                        <strong>Request {shortLocation(item.data.location)}</strong>
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
                      <span className="field-label">Upload scan file</span>
                      <input
                        className="field-control"
                        type="file"
                        accept="image/*,video/*,.las,.laz,.ply,.pcd,.e57,.obj,.glb,.gltf,.zip"
                        onChange={(e) => setScanFile(e.target.files?.[0] ?? null)}
                      />
                    </label>

                    {scanFile ? (
                      <p className="tx">Selected file: {scanFile.name}</p>
                    ) : null}

                    {uploadError ? <p className="tx error">{uploadError}</p> : null}

                    <div className="button-row">
                      <button
                        type="button"
                        onClick={submitScan}
                        disabled={!isConnected || txBusy || uploadingScan || !scanFile}
                      >
                        {uploadingScan ? 'Uploading...' : 'Submit scan'}
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
                <strong>Location:</strong> {selectedRequest.location}
              </p>
              <p>
                <strong>Scan type:</strong> {getScanTypeLabel(selectedRequest.scanType)}
              </p>
              <p>
                <strong>Number of Scans: </strong>{selectedRequest.requiredScans.toString()}
              </p>
              <p>
                <strong>Payment:</strong> {selectedPaymentEth.toFixed(4)} ETH
                {selectedPaymentUsd != null ? ` (${formatUsd(selectedPaymentUsd)})` : ''}
              </p>
              <p>
                <strong>Accepted:</strong> {String(selectedRequest.accepted)}
              </p>

              {canSeePrivateDetails ? (
                <>
                  <p>
                    <strong>Fulfilled:</strong> {String(selectedRequest.fulfilled)}
                  </p>
                  <p>
                    <strong>Verification:</strong>{' '}
                    {getVerificationStatusLabel(selectedRequest.verificationStatus)}
                  </p>
                  <p>
                    <strong>Scan URI:</strong> {selectedRequest.scanDataUri || '—'}
                  </p>
                  <p>
                    <strong>Submissions:</strong> {selectedRequest.submissions.toString()}
                  </p>
                  <p>
                    <strong>Scanner paid:</strong> {String(selectedRequest.scannerPaid)}
                  </p>
                </>
              ) : null}
            </div>
          ) : (
            <p>Select a loaded request to inspect it.</p>
          )}
        </article>
      </section>

      {hash || isConfirmed || writeError || !canUseContract ? (
        <section className="card status-card">
          <h2>Status</h2>

          {hash ? <p className="tx">Tx hash: {hash}</p> : null}
          {isConfirmed ? <p className="tx success">Transaction confirmed.</p> : null}
          {writeError ? (
            <p className="tx error">
              {getRevertReason(writeError)}
            </p>
          ) : null}
          {!canUseContract ? (
            <p className="tx error">Missing contract address.</p>
          ) : null}
        </section>
      ) : null}
    </main>
  )
}


export default App