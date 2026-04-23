const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();
  
  console.log("Deploying contracts with account:", deployer.address);
  console.log("Network:", await ethers.provider.getNetwork());
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");
  
  // ============================================
  // Deploy GameItems (ERC-1155)
  // ============================================
  console.log("\n📦 Deploying GameItems...");
  const GameItems = await ethers.getContractFactory("GameItems");
  const gameItems = await GameItems.deploy("https://metadata.gamestudio.io/items/");
  await gameItems.waitForDeployment();
  const gameItemsAddress = await gameItems.getAddress();
  console.log("✅ GameItems deployed to:", gameItemsAddress);
  
  // ============================================
  // Deploy MockERC20 (for Vault)
  // ============================================
  console.log("\n📦 Deploying MockERC20...");
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const mockToken = await MockERC20.deploy("Test Token", "TEST", 18);
  await mockToken.waitForDeployment();
  const mockTokenAddress = await mockToken.getAddress();
  console.log("✅ MockERC20 deployed to:", mockTokenAddress);
  
  // ============================================
  // Deploy Vault (ERC-4626)
  // ============================================
  console.log("\n📦 Deploying Vault...");
  const Vault = await ethers.getContractFactory("Vault");
  const vault = await Vault.deploy(mockTokenAddress, "Test Vault", "vTEST");
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log("✅ Vault deployed to:", vaultAddress);
  
  // ============================================
  // Execute Test Transactions
  // ============================================
  console.log("\n📝 Executing test transactions...");
  const txHashes = [];
  
  // 1. Mint some test tokens
  console.log("\n1️⃣ Minting test tokens...");
  const mintAmount = ethers.parseEther("1000");
  let tx = await mockToken.mint(deployer.address, mintAmount);
  await tx.wait();
  txHashes.push({ operation: "Mint Tokens", hash: tx.hash });
  console.log("   ✅ Minted 1000 TEST tokens");
  
  // 2. Approve vault
  console.log("\n2️⃣ Approving vault...");
  tx = await mockToken.approve(vaultAddress, ethers.MaxUint256);
  await tx.wait();
  txHashes.push({ operation: "Approve Vault", hash: tx.hash });
  console.log("   ✅ Approved vault to spend TEST tokens");
  
  // 3. Deposit into vault
  console.log("\n3️⃣ Depositing into vault...");
  const depositAmount = ethers.parseEther("100");
  tx = await vault.deposit(depositAmount, deployer.address);
  await tx.wait();
  txHashes.push({ operation: "Deposit to Vault", hash: tx.hash });
  console.log("   ✅ Deposited 100 TEST tokens");
  
  // 4. Mint game items
  console.log("\n4️⃣ Minting game items...");
  const GOLD = 0;
  const WOOD = 1;
  const IRON = 2;
  const ids = [GOLD, WOOD, IRON];
  const amounts = [1000, 500, 250];
  tx = await gameItems.mintBatch(deployer.address, ids, amounts, "0x");
  await tx.wait();
  txHashes.push({ operation: "Mint Game Items", hash: tx.hash });
  console.log("   ✅ Minted Gold, Wood, and Iron");
  
  // 5. Craft NFT
  console.log("\n5️⃣ Crafting Legendary Sword...");
  const LEGENDARY_SWORD = 3;
  tx = await gameItems.craft(LEGENDARY_SWORD);
  await tx.wait();
  txHashes.push({ operation: "Craft NFT", hash: tx.hash });
  console.log("   ✅ Crafted Legendary Sword");
  
  // ============================================
  // Save Deployment Info
  // ============================================
  const deploymentInfo = {
    network: "arbitrumSepolia",
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {
      gameItems: gameItemsAddress,
      mockToken: mockTokenAddress,
      vault: vaultAddress
    },
    transactions: txHashes
  };
  
  const deployPath = path.join(__dirname, "../../deployments");
  if (!fs.existsSync(deployPath)) {
    fs.mkdirSync(deployPath, { recursive: true });
  }
  
  fs.writeFileSync(
    path.join(deployPath, "arbitrum-sepolia.json"),
    JSON.stringify(deploymentInfo, null, 2)
  );
  
  console.log("\n📄 Deployment info saved to deployments/arbitrum-sepolia.json");
  
  // ============================================
  // Summary
  // ============================================
  console.log("\n" + "=".repeat(60));
  console.log("🎉 DEPLOYMENT COMPLETE");
  console.log("=".repeat(60));
  console.log("\nContract Addresses:");
  console.log("  GameItems:", gameItemsAddress);
  console.log("  MockERC20:", mockTokenAddress);
  console.log("  Vault:    ", vaultAddress);
  console.log("\nTransactions Executed:", txHashes.length);
  console.log("\nVerify contracts with:");
  console.log(`  npx hardhat verify --network arbitrumSepolia ${gameItemsAddress} "https://metadata.gamestudio.io/items/"`);
  console.log(`  npx hardhat verify --network arbitrumSepolia ${mockTokenAddress} "Test Token" "TEST" 18`);
  console.log(`  npx hardhat verify --network arbitrumSepolia ${vaultAddress} ${mockTokenAddress} "Test Vault" "vTEST"`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });