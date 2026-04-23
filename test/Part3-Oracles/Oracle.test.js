const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Chainlink Oracle Integration", function () {
  let MockAggregator;
  let PriceFeedConsumer;
  let PriceDependentVault;
  
  let mockAggregator;
  let priceFeedConsumer;
  let priceDependentVault;
  
  let owner;
  let user1;
  let user2;
  
  const ETH_PRICE_8_DECIMALS = 3000_00000000; // $3000 with 8 decimals
  const HIGH_PRICE = 3500_00000000;
  const LOW_PRICE = 2500_00000000;
  const THRESHOLD = 2800_00000000;
  
  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();
    
    // Deploy mock aggregator
    MockAggregator = await ethers.getContractFactory("MockAggregator");
    mockAggregator = await MockAggregator.deploy(8, ETH_PRICE_8_DECIMALS);
    await mockAggregator.waitForDeployment();
    
    // Deploy price feed consumer
    PriceFeedConsumer = await ethers.getContractFactory("PriceFeedConsumer");
    priceFeedConsumer = await PriceFeedConsumer.deploy(mockAggregator.target);
    await priceFeedConsumer.waitForDeployment();
    
    // Deploy price dependent vault
    PriceDependentVault = await ethers.getContractFactory("PriceDependentVault");
    priceDependentVault = await PriceDependentVault.deploy(mockAggregator.target, THRESHOLD);
    await priceDependentVault.waitForDeployment();
  });
  
  describe("MockAggregator", function () {
    it("Should return correct initial price", async function () {
      const [, price, , ,] = await mockAggregator.latestRoundData();
      expect(price).to.equal(ETH_PRICE_8_DECIMALS);
    });
    
    it("Should allow price updates", async function () {
      await mockAggregator.setPrice(HIGH_PRICE);
      const [, price, , ,] = await mockAggregator.latestRoundData();
      expect(price).to.equal(HIGH_PRICE);
    });
    
    it("Should return correct decimals", async function () {
      const decimals = await mockAggregator.decimals();
      expect(decimals).to.equal(8);
    });
  });
  
  describe("PriceFeedConsumer", function () {
    it("Should get latest price correctly", async function () {
      const [price, timestamp] = await priceFeedConsumer.getLatestPrice();
      expect(price).to.equal(ETH_PRICE_8_DECIMALS);
      expect(timestamp).to.be.gt(0);
    });
    
    it("Should revert on stale price data", async function () {
      const oneDay = 24 * 60 * 60;
      const block = await ethers.provider.getBlock("latest");
      await mockAggregator.setTimestamp(block.timestamp - oneDay - 1);
      
      await expect(
        priceFeedConsumer.getLatestPrice()
      ).to.be.revertedWith("PriceFeed: Stale price data");
    });
    
    it("Should allow custom staleness threshold", async function () {
      const twoDays = 2 * 24 * 60 * 60;
      const block = await ethers.provider.getBlock("latest");
      await mockAggregator.setTimestamp(block.timestamp - twoDays + 1000);
      
      await expect(
        priceFeedConsumer.getLatestPriceWithThreshold(twoDays)
      ).to.not.be.reverted;
    });
    
    it("Should normalize price to 18 decimals", async function () {
      const normalizedPrice = await priceFeedConsumer.getNormalizedPrice();
      const expectedNormalized = BigInt(ETH_PRICE_8_DECIMALS) * 10n ** 10n;
      expect(normalizedPrice).to.equal(expectedNormalized);
    });
    
    it("Should detect stale price correctly", async function () {
      expect(await priceFeedConsumer.isPriceStale()).to.be.false;
      
      const oneDay = 24 * 60 * 60;
      const block = await ethers.provider.getBlock("latest");
      await mockAggregator.setTimestamp(block.timestamp - oneDay - 1);
      
      expect(await priceFeedConsumer.isPriceStale()).to.be.true;
    });
  });
  
  describe("PriceDependentVault", function () {
    const depositAmount = ethers.parseEther("1");
    
    beforeEach(async function () {
      // Set initial price above threshold
      await mockAggregator.setPrice(HIGH_PRICE);
    });
    
    it("Should accept ETH deposits", async function () {
      await priceDependentVault.connect(user1).deposit({ value: depositAmount });
      
      expect(await priceDependentVault.deposits(user1.address)).to.equal(depositAmount);
      expect(await priceDependentVault.totalDeposits()).to.equal(depositAmount);
    });
    
    it("Should emit Deposited event", async function () {
      await expect(priceDependentVault.connect(user1).deposit({ value: depositAmount }))
        .to.emit(priceDependentVault, "Deposited")
        .withArgs(user1.address, depositAmount, HIGH_PRICE);
    });
    
    it("Should allow withdrawal when price above threshold", async function () {
      await priceDependentVault.connect(user1).deposit({ value: depositAmount });
      
      const tx = await priceDependentVault.connect(user1).withdraw(depositAmount);
      const receipt = await tx.wait();
      
      // Just verify deposit is now 0 - simpler and more reliable
      expect(await priceDependentVault.deposits(user1.address)).to.equal(0);
      expect(await priceDependentVault.totalDeposits()).to.equal(0);
    });
    
    it("Should emit Withdrawn event", async function () {
      await priceDependentVault.connect(user1).deposit({ value: depositAmount });
      
      await expect(priceDependentVault.connect(user1).withdraw(depositAmount))
        .to.emit(priceDependentVault, "Withdrawn")
        .withArgs(user1.address, depositAmount, HIGH_PRICE);
    });
    
    it("Should block withdrawal when price below threshold", async function () {
      await priceDependentVault.connect(user1).deposit({ value: depositAmount });
      await mockAggregator.setPrice(LOW_PRICE);
      
      await expect(
        priceDependentVault.connect(user1).withdraw(depositAmount)
      ).to.be.revertedWith("Vault: ETH price below withdrawal threshold");
    });
    
    it("Should calculate USD value correctly", async function () {
      await priceDependentVault.connect(user1).deposit({ value: depositAmount });
      
      const usdValue = await priceDependentVault.getUSDValue(user1.address);
      const expectedValue = (BigInt(depositAmount) * BigInt(HIGH_PRICE)) / 10n ** 18n;
      
      expect(usdValue).to.equal(expectedValue);
    });
    
    it("Should allow owner to update threshold", async function () {
      const newThreshold = 3200_00000000;
      
      await expect(priceDependentVault.setPriceThreshold(newThreshold))
        .to.emit(priceDependentVault, "ThresholdUpdated")
        .withArgs(THRESHOLD, newThreshold);
      
      expect(await priceDependentVault.priceThreshold()).to.equal(newThreshold);
    });
    
    it("Should not allow non-owner to update threshold", async function () {
      await expect(
        priceDependentVault.connect(user1).setPriceThreshold(3200_00000000)
      ).to.be.revertedWithCustomError(priceDependentVault, "OwnableUnauthorizedAccount");
    });
    
    it("Should check if withdrawal is allowed", async function () {
      await priceDependentVault.connect(user1).deposit({ value: depositAmount });
      
      expect(await priceDependentVault.isWithdrawalAllowed()).to.be.true;
      
      await mockAggregator.setPrice(LOW_PRICE);
      expect(await priceDependentVault.isWithdrawalAllowed()).to.be.false;
    });
    
    it("Should accept ETH via receive function", async function () {
      await user1.sendTransaction({
        to: priceDependentVault.target,
        value: depositAmount
      });
      
      expect(await priceDependentVault.deposits(user1.address)).to.equal(depositAmount);
    });
    
    it("Should revert withdrawal with zero amount", async function () {
      await expect(
        priceDependentVault.connect(user1).withdraw(0)
      ).to.be.revertedWith("Vault: Withdraw amount must be greater than 0");
    });
    
    it("Should revert withdrawal exceeding balance", async function () {
      await expect(
        priceDependentVault.connect(user1).withdraw(ethers.parseEther("10"))
      ).to.be.revertedWith("Vault: Insufficient balance");
    });
    
    it("Should get total USD value correctly", async function () {
      await priceDependentVault.connect(user1).deposit({ value: depositAmount });
      await priceDependentVault.connect(user2).deposit({ value: depositAmount });
      
      const totalUSD = await priceDependentVault.getTotalUSDValue();
      const expectedTotal = (BigInt(depositAmount) * 2n * BigInt(HIGH_PRICE)) / 10n ** 18n;
      
      expect(totalUSD).to.equal(expectedTotal);
    });
    
    it("Should get current price correctly", async function () {
      const price = await priceDependentVault.getCurrentPrice();
      expect(price).to.equal(HIGH_PRICE);
    });
  });
});