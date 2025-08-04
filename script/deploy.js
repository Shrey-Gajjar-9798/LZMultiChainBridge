const { ethers } = require("hardhat");

// LayerZero endpoint addresses for testnets
const LAYERZERO_ENDPOINTS = {
  sepolia: "0xae92d5aD7583AD66E49A0c67BAd18F6ba52dDDc1",
  arbitrumSepolia: "0x6098e96a28E02f27B1e6BD381f870F1C8Bd169d3",
  bscTestnet: "0x6Fcb97553D41516Cb228ac03FdC8B9a0a9df04A1",
  polygonAmoy: "0x55370E0fBB5f5b8dAeD978BA1c075a499eB107B8",
  opSepolia: "0x55370E0fBB5f5b8dAeD978BA1c075a499eB107B8",
  baseSepolia: "0x55370E0fBB5f5b8dAeD978BA1c075a499eB107B8",
  avalancheFuji:"0x93f54D755A063cE7bB9e6Ac47Eccc8e33411d706",
  zkSyncSepolia: "0x99b6359ce8E0eBdC27eBeDb76FE28F29303E78fF"
};

async function main() {
  const [deployer] = await ethers.getSigners();
  const networkName = hre.network.name;
  
  console.log(`Deploying contracts with account: ${deployer.address}`);
  console.log(`Network: ${networkName}`);
  console.log(`Account balance: ${ethers.formatEther(await deployer.provider.getBalance(deployer.address))} ETH`);

  const lzEndpoint = LAYERZERO_ENDPOINTS[networkName];
  if (!lzEndpoint) {
    throw new Error(`LayerZero endpoint not found for network: ${networkName}`);
  }

  console.log(`Using LayerZero endpoint: ${lzEndpoint}`);

  // Deploy LZRefuel contract
  const LZRefuel = await ethers.getContractFactory("LZRefuel");
  const lzRefuel = await LZRefuel.deploy(lzEndpoint);
  await lzRefuel.waitForDeployment();

  const contractAddress = await lzRefuel.getAddress();
  console.log(`LZRefuel deployed to: ${contractAddress}`);

  // Save deployment info
  const deploymentInfo = {
    network: networkName,
    contractAddress: contractAddress,
    lzEndpoint: lzEndpoint,
    deployer: deployer.address,
    deploymentHash: lzRefuel.deploymentTransaction().hash
  };

  console.log("\n=== Deployment Summary ===");
  console.log(JSON.stringify(deploymentInfo, null, 2));
  
  // Save to file
  const fs = require('fs');
  const deploymentPath = `deployments/${networkName}.json`;
  
  // Create deployments directory if it doesn't exist
  if (!fs.existsSync('deployments')) {
    fs.mkdirSync('deployments');
  }
  
  fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));
  console.log(`\nDeployment info saved to: ${deploymentPath}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });