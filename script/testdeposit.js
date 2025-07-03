const { ethers } = require("hardhat");
const fs = require('fs');

// LayerZero Chain IDs for testnets
const LAYERZERO_CHAIN_IDS = {
  sepolia: 10161,
  arbitrumSepolia: 10231,
  bscTestnet: 10102,
};

// Configuration - modify this to set ETH amounts for each chain
const CHAIN_CONFIG = {
  sourceChainEth: "0.01", // Amount in ETH for the source chain (current network)
  targetChains: {
    arbitrumSepolia: "0.005", // 0.005 ETH
    sepolia: "0.005", // 0.005 ETH
  }
};

// ABI definitions
const lzDepositAbi = [
  {
    inputs: [
      {
        internalType: 'uint256[]',
        name: '_depositParams',
        type: 'uint256[]',
      },
      {
        internalType: 'address',
        name: 'to',
        type: 'address',
      },
    ],
    name: 'deposit',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
];

const estimateFeesAbi = [
  {
    inputs: [
      {
        internalType: 'uint16[]',
        name: '_dstChainIds',
        type: 'uint16[]',
      },
      {
        internalType: 'bytes[]',
        name: '_adapterParams',
        type: 'bytes[]',
      },
    ],
    name: 'estimateFees',
    outputs: [
      {
        internalType: 'uint256[]',
        name: 'nativeFees',
        type: 'uint256[]',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
];

// Define the createAdapterParams function
const createAdapterParams = (gasLimit, nativeAmount, to) => {
  return ethers.solidityPacked(
    ['uint16', 'uint256', 'uint256', 'address'],
    [2, gasLimit, nativeAmount, to]
  );
};

// Define the createOptimizedAdapterParams function
const createOptimizedAdapterParams = (dstChainId, nativeAmount) => {
  return (BigInt(dstChainId) << BigInt(240)) | BigInt(nativeAmount);
};

async function main() {
  const [deployer] = await ethers.getSigners();
  const networkName = hre.network.name;
  
  console.log(`Testing functionality on network: ${networkName}`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance: ${ethers.formatEther(await deployer.provider.getBalance(deployer.address))} ETH`);

  // Load deployment info
  const deploymentPath = `deployments/${networkName}.json`;
  if (!fs.existsSync(deploymentPath)) {
    throw new Error(`Deployment file not found: ${deploymentPath}`);
  }

  const deploymentInfo = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
  const contractAddress = deploymentInfo.contractAddress;
  
  console.log(`Contract address: ${contractAddress}`);

  // Load all deployments to get target chains
  const deployments = {};
  const deploymentFiles = fs.readdirSync('deployments').filter(file => file.endsWith('.json'));
  
  for (const file of deploymentFiles) {
    const network = file.replace('.json', '');
    if (network !== networkName) { // Exclude current network
      const deployment = JSON.parse(fs.readFileSync(`deployments/${file}`, 'utf8'));
      deployments[network] = deployment;
    }
  }

  // Filter target networks based on configuration and available deployments
  const configuredTargetNetworks = Object.keys(CHAIN_CONFIG.targetChains);
  const availableTargetNetworks = Object.keys(deployments);
  const targetNetworks = configuredTargetNetworks.filter(network => 
    availableTargetNetworks.includes(network)
  );

  if (targetNetworks.length === 0) {
    console.log("❌ No target networks found that match both configuration and deployments.");
    console.log(`Configured: ${configuredTargetNetworks.join(', ')}`);
    console.log(`Available: ${availableTargetNetworks.join(', ')}`);
    return;
  }

  console.log(`Target networks: ${targetNetworks.join(', ')}`);

  // Display ETH amounts for each chain
  console.log("\n=== Chain Configuration ===");
  console.log(`Source chain (${networkName}): ${CHAIN_CONFIG.sourceChainEth} ETH`);
  
  for (const targetNetwork of targetNetworks) {
    const ethAmount = CHAIN_CONFIG.targetChains[targetNetwork];
    console.log(`${targetNetwork}: ${ethAmount} ETH`);
  }

  // Prepare parameters
  const lzIds = [];
  const adapterParamsEstimate = [];
  const adapterParamsDeposit = [];
  
  const gasLimit = 30000n;

  for (const targetNetwork of targetNetworks) {
    const lzChainId = LAYERZERO_CHAIN_IDS[targetNetwork];
    if (lzChainId) {
      lzIds.push(lzChainId);
      
      // Get ETH amount for this target network
      const ethAmount = CHAIN_CONFIG.targetChains[targetNetwork];
      const nativeAmount = ethers.parseEther(ethAmount);
      
      // For estimation
      const adapterParamEstimate = createAdapterParams(
        gasLimit,
        nativeAmount,
        '0x0000000000000000000000000000000000000000'
      );
      adapterParamsEstimate.push(adapterParamEstimate);
      
      // For deposit
      const adapterParamDeposit = createOptimizedAdapterParams(lzChainId, nativeAmount);
      adapterParamsDeposit.push(adapterParamDeposit);
    }
  }

  console.log(`\nLayerZero Chain IDs: ${lzIds.join(', ')}`);

  // Get contract instance for fee estimation
  const contract = new ethers.Contract(contractAddress, estimateFeesAbi, deployer);

  // Estimate fees
  console.log("\n=== Estimating Fees ===");
  
  try {
    const fees = await contract.estimateFees(lzIds, adapterParamsEstimate);
    console.log(`Individual fees:`);
    
    let totalFees = 0n;
    for (let i = 0; i < fees.length; i++) {
      console.log(`  ${targetNetworks[i]} (LZ ID: ${lzIds[i]}): ${ethers.formatEther(fees[i])} ETH`);
      totalFees += fees[i];
    }
    
    console.log(`\nTotal fees: ${ethers.formatEther(totalFees)} ETH`);
    
    // Add some buffer for gas price fluctuations
    // const feeWithBuffer = totalFees + (totalFees * 15n / 100n); // 15% buffer
    const feeWithBuffer = totalFees // 0% buffer

    console.log(`Fees with 0% buffer: ${ethers.formatEther(feeWithBuffer)} ETH`);

    // Calculate total cost including source chain amount
    const sourceChainAmount = ethers.parseEther(CHAIN_CONFIG.sourceChainEth);
    const totalCost = feeWithBuffer + sourceChainAmount;
    console.log(`\nTotal cost breakdown:`);
    console.log(`  Source chain amount: ${ethers.formatEther(sourceChainAmount)} ETH`);
    console.log(`  LayerZero fees (with buffer): ${ethers.formatEther(feeWithBuffer)} ETH`);
    console.log(`  Total required: ${ethers.formatEther(totalCost)} ETH`);

    // Check if we have enough balance
    const balance = await deployer.provider.getBalance(deployer.address);
    if (balance < totalCost) {
      console.log(`❌ Insufficient balance. Need: ${ethers.formatEther(totalCost)} ETH, Have: ${ethers.formatEther(balance)} ETH`);
      return;
    }

    // Perform the deposit transaction
    console.log("\n=== Performing Deposit Transaction ===");
    const depositContract = new ethers.Contract(contractAddress, lzDepositAbi, deployer);
    
    console.log(`Sending to chains: ${lzIds.join(', ')}`);
    console.log(`Deposit parameters: ${adapterParamsDeposit.map(p => p.toString()).join(', ')}`);
    console.log(`Transaction value: ${ethers.formatEther(feeWithBuffer)} ETH`);
    
    const tx = await depositContract.deposit(adapterParamsDeposit, deployer.address, {
      value: feeWithBuffer,
      gasLimit: 500000 // Set a reasonable gas limit
    });
    
    console.log(`Transaction sent: ${tx.hash}`);
    console.log("Waiting for confirmation...");
    
    const receipt = await tx.wait();
    console.log(`✅ Transaction confirmed in block: ${receipt.blockNumber}`);
    console.log(`Gas used: ${receipt.gasUsed}`);
    
    // Display summary
    console.log("\n=== Transaction Summary ===");
    console.log(`Source chain (${networkName}): ${CHAIN_CONFIG.sourceChainEth} ETH sent`);
    for (const targetNetwork of targetNetworks) {
      const ethAmount = CHAIN_CONFIG.targetChains[targetNetwork];
      console.log(`${targetNetwork}: ${ethAmount} ETH to be received`);
    }
    
    // Check final balance
    const finalBalance = await deployer.provider.getBalance(deployer.address);
    console.log(`\nFinal balance: ${ethers.formatEther(finalBalance)} ETH`);
    console.log(`Total cost: ${ethers.formatEther(balance - finalBalance)} ETH`);
    
  } catch (error) {
    console.error("❌ Error during execution:", error.message);
    
    // Try to provide more specific error information
    if (error.message.includes("Fee Not Met")) {
      console.log("💡 The fee estimation might have changed. Try running again.");
    } else if (error.message.includes("insufficient funds")) {
      console.log("💡 Insufficient funds in wallet. Please add more ETH.");
    } else if (error.message.includes("trusted remote")) {
      console.log("💡 Trusted remotes might not be set up. Run setupTrusted.js first.");
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });