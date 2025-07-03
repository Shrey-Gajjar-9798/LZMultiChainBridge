const { ethers } = require("hardhat");

// LayerZero endpoint addresses for testnets
const LAYERZERO_ENDPOINTS = {
  sepolia: "0xae92d5aD7583AD66E49A0c67BAd18F6ba52dDDc1",
  arbitrumSepolia: "0x6098e96a28E02f27B1e6BD381f870F1C8Bd169d3",
  bscTestnet: "0x6Fcb97553D41516Cb228ac03FdC8B9a0a9df04A1",
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

  // Deploy GasZipLZ contract
  const GasZipLZ = await ethers.getContractFactory("GasZipLZ");
  const gasZipLZ = await GasZipLZ.deploy(lzEndpoint);
  await gasZipLZ.waitForDeployment();
  
  const contractAddress = await gasZipLZ.getAddress();
  console.log(`GasZipLZ deployed to: ${contractAddress}`);

  // Save deployment info
  const deploymentInfo = {
    network: networkName,
    contractAddress: contractAddress,
    lzEndpoint: lzEndpoint,
    deployer: deployer.address,
    deploymentHash: gasZipLZ.deploymentTransaction().hash
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