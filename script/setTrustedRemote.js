const { ethers } = require("hardhat");
const fs = require('fs');

// LayerZero Chain IDs for testnets
const LAYERZERO_CHAIN_IDS = {
  sepolia: 10161,
  arbitrumSepolia: 10231,
  bscTestnet: 10102,
};

async function main() {
  const [deployer] = await ethers.getSigners();
  const networkName = hre.network.name;
  
  console.log(`Setting up trusted remotes for network: ${networkName}`);
  console.log(`Deployer: ${deployer.address}`);

  // Load deployment info
  const deploymentPath = `deployments/${networkName}.json`;
  if (!fs.existsSync(deploymentPath)) {
    throw new Error(`Deployment file not found: ${deploymentPath}`);
  }

  const deploymentInfo = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
  console.log(`Contract address: ${deploymentInfo.contractAddress}`);

  // Load all deployment addresses
  const deployments = {};
  const deploymentFiles = fs.readdirSync('deployments').filter(file => file.endsWith('.json'));
  
  for (const file of deploymentFiles) {
    const network = file.replace('.json', '');
    const deployment = JSON.parse(fs.readFileSync(`deployments/${file}`, 'utf8'));
    deployments[network] = deployment;
  }

  console.log("\nAvailable deployments:");
  Object.keys(deployments).forEach(network => {
    console.log(`  ${network}: ${deployments[network].contractAddress}`);
  });

  // Get contract instance
  const GasZipLZ = await ethers.getContractFactory("GasZipLZ");
  const gasZipLZ = GasZipLZ.attach(deploymentInfo.contractAddress);

  // Prepare trusted remotes (exclude current network)
  const remoteChainIds = [];
  const remoteAddresses = [];

  for (const [network, deployment] of Object.entries(deployments)) {
    if (network !== networkName) {
      const chainId = LAYERZERO_CHAIN_IDS[network];
      if (chainId) {
        remoteChainIds.push(chainId);
        remoteAddresses.push(deployment.contractAddress);
        console.log(`Adding trusted remote: ${network} (LZ ID: ${chainId}) -> ${deployment.contractAddress}`);
      }
    }
  }

  if (remoteChainIds.length === 0) {
    console.log("No remote chains to set up. Deploy to more networks first.");
    return;
  }

  // Set trusted remotes
  console.log("\nSetting trusted remotes...");
  const tx = await gasZipLZ.setTrusted(remoteChainIds, remoteAddresses);
  await tx.wait();
  
  console.log(`✅ Trusted remotes set successfully! TX: ${tx.hash}`);

  // Set gas limits for remote chains
  console.log("\nSetting gas limits...");
  const gasLimits = new Array(remoteChainIds.length).fill(30000); // 30k gas limit for all
  const gasLimitTx = await gasZipLZ.setGasLimit(remoteChainIds, gasLimits);
  await gasLimitTx.wait();
  
  console.log(`✅ Gas limits set successfully! TX: ${gasLimitTx.hash}`);

  // Verify setup
  console.log("\n=== Verification ===");
  for (let i = 0; i < remoteChainIds.length; i++) {
    const chainId = remoteChainIds[i];
    const trustedRemote = await gasZipLZ.trustedRemoteLookup(chainId);
    const gasLimit = await gasZipLZ.gasLimitLookup(chainId);
    console.log(`Chain ${chainId}: trusted=${trustedRemote}, gasLimit=${gasLimit}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });