import { createConfig } from "@ponder/core";
import { http } from "viem";
import { CONTRACT_ABI } from "./abi";

// Support multiple addresses via comma separated string
const addresses = (process.env.CONTRACT_ADDRESS || "0x64631f82EE4c071A6B05382435df3b9eB15f8122")
  .split(",")
  .map(a => a.trim() as `0x${string}`);

const deployBlock = process.env.DEPLOY_BLOCK ? parseInt(process.env.DEPLOY_BLOCK) : 48837673;

export default createConfig({
  networks: {
    base: {
      chainId: 8453,
      transport: http(process.env.PONDER_RPC_URL_8453 || process.env.NEXT_PUBLIC_BASE_RPC_URL || "https://mainnet.base.org"),
      maxRequestsPerSecond: 4,
    },
  },
  contracts: {
    MillionEgg: {
      abi: CONTRACT_ABI,
      network: "base",
      address: addresses,
      startBlock: deployBlock,
    },
  },
});
