import "dotenv/config"
import hre from "hardhat"
import { createWalletClient, http, createPublicClient } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { sepolia } from "viem/chains"

async function main() {
    const rpcUrl = process.env.SEPOLIA_RPC_URL
    const privateKey = process.env.PRIVATE_KEY
    const functionsRouter = process.env.FUNCTIONS_ROUTER
    const donId = process.env.DON_ID
    const subscriptionId = process.env.SUBSCRIPTION_ID

    if (!rpcUrl || !privateKey || !functionsRouter || !donId || !subscriptionId) {
        throw new Error("Missing one or more required .env values")
    }

    const normalizedPrivateKey = privateKey.startsWith("0x")
        ? privateKey
        : `0x${privateKey}`

    const account = privateKeyToAccount(normalizedPrivateKey as `0x${string}`)

    const artifact = await hre.artifacts.readArtifact("Scan4MeMarketplace")

    const walletClient = createWalletClient({
        account,
        chain: sepolia,
        transport: http(rpcUrl),
    })

    const publicClient = createPublicClient({
        chain: sepolia,
        transport: http(rpcUrl),
    })

    const bytecode = artifact.bytecode.startsWith("0x")
        ? artifact.bytecode
        : `0x${artifact.bytecode}`

    const hash = await walletClient.deployContract({
        abi: artifact.abi,
        bytecode: bytecode as `0x${string}`,
        args: [functionsRouter, donId, Number(subscriptionId)],
    })

    console.log("Deployment tx hash:", hash)

    const receipt = await publicClient.waitForTransactionReceipt({ hash })
    console.log("Contract deployed at:", receipt.contractAddress)
}

main().catch((error) => {
    console.error(error)
    process.exitCode = 1
})