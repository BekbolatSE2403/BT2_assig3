const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  
  console.log("Deploying Oracle contracts with account:", deployer.address);
  console.log("Network:", await ethers.provider.getNetwork());
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");
  
  // Real Chainlink ETH/USD Price Feed on Arbitrum Sepolia
  const ETH_USD_PRICE_FEED = "0xd30e2101a97dcbAeBCBC04F14C3f624E67A35165";
  
  // Price threshold: $2500 (with 8 decimals = 250000000000)
  const PRICE_THRESHOLD = 2500_00000000;
  
  // Deploy PriceFeedConsumer
  console.log("\n📦 Deploying PriceFeedConsumer...");
  const PriceFeedConsumer = await ethers.getContractFactory("PriceFeedConsumer");
  const priceFeedConsumer = await PriceFeedConsumer.deploy(ETH_USD_PRICE_FEED);
  await priceFeedConsumer.waitForDeployment();
  const consumerAddress = await priceFeedConsumer.getAddress();
  console.log("✅ PriceFeedConsumer deployed to:", consumerAddress);
  
  // Deploy PriceDependentVault
  console.log("\n📦 Deploying PriceDependentVault...");
  const PriceDependentVault = await ethers.getContractFactory("PriceDependentVault");
  const priceDependentVault = await PriceDependentVault.deploy(ETH_USD_PRICE_FEED, PRICE_THRESHOLD);
  await priceDependentVault.waitForDeployment();
  const vaultAddress = await priceDependentVault.getAddress();
  console.log("✅ PriceDependentVault deployed to:", vaultAddress);
  
  // Read real price feed
  console.log("\n📊 Reading real Chainlink price feed...");
  
  const [price, timestamp] = await priceFeedConsumer.getLatestPrice();
  console.log("ETH/USD Price:", ethers.formatUnits(price, 8), "USD");
  console.log("Last Updated:", new Date(Number(timestamp) * 1000).toLocaleString());
  
  const decimals = await priceFeedConsumer.getDecimals();
  console.log("Price Feed Decimals:", decimals.toString());
  
  const normalizedPrice = await priceFeedConsumer.getNormalizedPrice();
  console.log("Normalized Price (18 decimals):", ethers.formatEther(normalizedPrice));
  
  // Check if price is stale
  const isStale = await priceFeedConsumer.isPriceStale();
  console.log("Is Price Stale?:", isStale);
  
  // Test deposit and USD value calculation
  console.log("\n💰 Testing deposit and USD value...");
  const depositAmount = ethers.parseEther("0.01");
  const tx = await priceDependentVault.deposit({ value: depositAmount });
  await tx.wait();
  
  const usdValue = await priceDependentVault.getUSDValue(deployer.address);
  console.log("Deposited:", ethers.formatEther(depositAmount), "ETH");
  console.log("USD Value:", ethers.formatUnits(usdValue, 8), "USD");
  
  // Check if withdrawal is allowed
  const withdrawalAllowed = await priceDependentVault.isWithdrawalAllowed();
  console.log("Withdrawal Allowed?:", withdrawalAllowed);
  
  // Save deployment info
  const fs = require("fs");
  const path = require("path");
  const deploymentInfo = {
    network: "arbitrumSepolia",
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    priceFeed: ETH_USD_PRICE_FEED,
    contracts: {
      priceFeedConsumer: consumerAddress,
      priceDependentVault: vaultAddress
    },
    priceData: {
      ethUsdPrice: price.toString(),
      decimals: decimals.toString(),
      lastUpdated: timestamp.toString(),
      isStale: isStale
    },
    testDeposit: {
      amount: depositAmount.toString(),
      usdValue: usdValue.toString(),
      withdrawalAllowed: withdrawalAllowed
    }
  };
  
  const deployPath = path.join(__dirname, "../../deployments");
  if (!fs.existsSync(deployPath)) {
    fs.mkdirSync(deployPath, { recursive: true });
  }
  
  fs.writeFileSync(
    path.join(deployPath, "oracle-arbitrum-sepolia.json"),
    JSON.stringify(deploymentInfo, null, 2)
  );
  
  console.log("\n📄 Deployment info saved to deployments/oracle-arbitrum-sepolia.json");
  
  console.log("\n" + "=".repeat(60));
  console.log("✅ ORACLE DEPLOYMENT COMPLETE");
  console.log("=".repeat(60));
  console.log("\nContract Addresses:");
  console.log("  PriceFeedConsumer:  ", consumerAddress);
  console.log("  PriceDependentVault:", vaultAddress);
  console.log("\nVerify contracts:");
  console.log(`  npx hardhat verify --network arbitrumSepolia ${consumerAddress} ${ETH_USD_PRICE_FEED}`);
  console.log(`  npx hardhat verify --network arbitrumSepolia ${vaultAddress} ${ETH_USD_PRICE_FEED} ${PRICE_THRESHOLD}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
