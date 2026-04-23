const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ERC-4626 Vault", function () {
  let MockERC20;
  let Vault;
  let asset;
  let vault;
  let owner;
  let user1;
  let user2;
  
  const ASSET_NAME = "Test Token";
  const ASSET_SYMBOL = "TEST";
  const ASSET_DECIMALS = 18;
  const VAULT_NAME = "Test Vault";
  const VAULT_SYMBOL = "vTEST";
  
  const ONE_TOKEN = ethers.parseEther("1");
  const TEN_TOKENS = ethers.parseEther("10");
  const HUNDRED_TOKENS = ethers.parseEther("100");
  
  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();
    
    // Deploy mock asset token
    MockERC20 = await ethers.getContractFactory("MockERC20");
    asset = await MockERC20.deploy(ASSET_NAME, ASSET_SYMBOL, ASSET_DECIMALS);
    await asset.waitForDeployment();
    
    // Mint tokens to users BEFORE transferring ownership
    await asset.mint(user1.address, HUNDRED_TOKENS);
    await asset.mint(user2.address, HUNDRED_TOKENS);
    
    // Deploy vault
    Vault = await ethers.getContractFactory("Vault");
    vault = await Vault.deploy(asset.target, VAULT_NAME, VAULT_SYMBOL);
    await vault.waitForDeployment();
    
    // Transfer ownership of asset to vault (so vault can mint yield)
    await asset.transferOwnership(vault.target);
    
    // Approve vault to spend user tokens
    await asset.connect(user1).approve(vault.target, ethers.MaxUint256);
    await asset.connect(user2).approve(vault.target, ethers.MaxUint256);
  });
  
  describe("Deployment", function () {
    it("Should set correct asset and metadata", async function () {
      expect(await vault.asset()).to.equal(asset.target);
      expect(await vault.name()).to.equal(VAULT_NAME);
      expect(await vault.symbol()).to.equal(VAULT_SYMBOL);
    });
    
    it("Should set initial yield rate correctly", async function () {
      expect(await vault.yieldRate()).to.equal(100);
    });
  });
  
  describe("Deposit", function () {
    it("Should deposit assets and receive shares", async function () {
      const depositAmount = TEN_TOKENS;
      await vault.connect(user1).deposit(depositAmount, user1.address);
      expect(await vault.balanceOf(user1.address)).to.equal(depositAmount);
      expect(await vault.totalSupply()).to.equal(depositAmount);
      expect(await asset.balanceOf(vault.target)).to.equal(depositAmount);
    });
    
    it("Should preview deposit correctly", async function () {
      const depositAmount = TEN_TOKENS;
      const expectedShares = await vault.previewDeposit(depositAmount);
      await vault.connect(user1).deposit(depositAmount, user1.address);
      expect(await vault.balanceOf(user1.address)).to.equal(expectedShares);
    });
    
    it("Should handle multiple deposits", async function () {
      await vault.connect(user1).deposit(TEN_TOKENS, user1.address);
      await vault.connect(user2).deposit(TEN_TOKENS, user2.address);
      expect(await vault.balanceOf(user1.address)).to.equal(TEN_TOKENS);
      expect(await vault.balanceOf(user2.address)).to.equal(TEN_TOKENS);
    });
  });
  
  describe("Withdraw", function () {
    beforeEach(async function () {
      await vault.connect(user1).deposit(TEN_TOKENS, user1.address);
    });
    
    it("Should withdraw assets by burning shares", async function () {
      const withdrawAmount = ONE_TOKEN;
      await vault.connect(user1).withdraw(withdrawAmount, user1.address, user1.address);
      expect(await vault.balanceOf(user1.address)).to.equal(TEN_TOKENS - withdrawAmount);
    });
    
    it("Should preview withdraw correctly", async function () {
      const withdrawAmount = ONE_TOKEN;
      const expectedShares = await vault.previewWithdraw(withdrawAmount);
      const initialShares = await vault.balanceOf(user1.address);
      await vault.connect(user1).withdraw(withdrawAmount, user1.address, user1.address);
      expect(await vault.balanceOf(user1.address)).to.equal(initialShares - expectedShares);
    });
    
    it("Should revert withdrawal exceeding balance", async function () {
      const tooMuch = ethers.parseEther("1000");
      await expect(
        vault.connect(user1).withdraw(tooMuch, user1.address, user1.address)
      ).to.be.revertedWithCustomError(vault, "ERC4626ExceededMaxWithdraw");
    });
  });
  
  describe("Mint", function () {
    it("Should mint shares by depositing assets", async function () {
      const sharesToMint = TEN_TOKENS;
      const assetsRequired = await vault.previewMint(sharesToMint);
      await vault.connect(user1).mint(sharesToMint, user1.address);
      expect(await vault.balanceOf(user1.address)).to.equal(sharesToMint);
      expect(await asset.balanceOf(vault.target)).to.equal(assetsRequired);
    });
  });
  
  describe("Redeem", function () {
    beforeEach(async function () {
      await vault.connect(user1).deposit(TEN_TOKENS, user1.address);
    });
    
    it("Should redeem shares for assets", async function () {
      const sharesToRedeem = ONE_TOKEN;
      const expectedAssets = await vault.previewRedeem(sharesToRedeem);
      const initialAssetBalance = await asset.balanceOf(user1.address);
      await vault.connect(user1).redeem(sharesToRedeem, user1.address, user1.address);
      expect(await vault.balanceOf(user1.address)).to.equal(TEN_TOKENS - sharesToRedeem);
      expect(await asset.balanceOf(user1.address)).to.equal(initialAssetBalance + expectedAssets);
    });
  });
  
  describe("Harvest (Yield Generation)", function () {
    beforeEach(async function () {
      await vault.connect(user1).deposit(TEN_TOKENS, user1.address);
    });
    
    it("Should generate yield and increase share price", async function () {
      const initialSharePrice = await vault.sharePrice();
      await vault.connect(owner).harvest();
      const newSharePrice = await vault.sharePrice();
      expect(newSharePrice).to.be.gt(initialSharePrice);
    });
    
    it("Should calculate 1% yield correctly", async function () {
      await vault.connect(owner).harvest();
      const expectedYield = TEN_TOKENS * 100n / 10000n;
      const totalAfterHarvest = await vault.totalAssets();
      expect(totalAfterHarvest).to.equal(TEN_TOKENS + expectedYield);
    });
    
    it("Should emit Harvest event", async function () {
      const totalBeforeHarvest = await vault.totalAssets();
      const expectedYield = totalBeforeHarvest * 100n / 10000n;
      const totalAfterHarvest = totalBeforeHarvest + expectedYield;
      
      await expect(vault.connect(owner).harvest())
        .to.emit(vault, "Harvest")
        .withArgs(expectedYield, totalAfterHarvest);
    });
    
    it("Should not allow non-owner to harvest", async function () {
      await expect(
        vault.connect(user1).harvest()
      ).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
    });
  });
  
  describe("Conversions", function () {
    beforeEach(async function () {
      await vault.connect(user1).deposit(TEN_TOKENS, user1.address);
    });
    
    it("Should convert assets to shares correctly", async function () {
      const assets = ONE_TOKEN;
      const expectedShares = await vault.convertToShares(assets);
      expect(expectedShares).to.be.lte(assets);
    });
    
    it("Should convert shares to assets correctly", async function () {
      const shares = ONE_TOKEN;
      const expectedAssets = await vault.convertToAssets(shares);
      expect(expectedAssets).to.be.gte(shares);
    });
    
    it("Should handle rounding properly after harvest", async function () {
      await vault.connect(owner).harvest();
      
      const sharesFromAssets = await vault.convertToShares(ONE_TOKEN);
      const assetsFromShares = await vault.convertToAssets(ONE_TOKEN);
      
      expect(assetsFromShares).to.be.gt(ONE_TOKEN);
      expect(sharesFromAssets).to.be.lt(ONE_TOKEN);
    });
  });
  
  describe("Max Functions", function () {
    it("Should return max deposit (unlimited)", async function () {
      expect(await vault.maxDeposit(user1.address)).to.equal(ethers.MaxUint256);
    });
    
    it("Should return max mint (unlimited)", async function () {
      expect(await vault.maxMint(user1.address)).to.equal(ethers.MaxUint256);
    });
    
    it("Should return max withdraw based on user shares", async function () {
      await vault.connect(user1).deposit(TEN_TOKENS, user1.address);
      const maxWithdraw = await vault.maxWithdraw(user1.address);
      expect(maxWithdraw).to.equal(TEN_TOKENS);
    });
    
    it("Should return max redeem based on user shares", async function () {
      await vault.connect(user1).deposit(TEN_TOKENS, user1.address);
      const maxRedeem = await vault.maxRedeem(user1.address);
      expect(maxRedeem).to.equal(TEN_TOKENS);
    });
  });
  
  describe("Yield Rate Management", function () {
    it("Should allow owner to update yield rate", async function () {
      await vault.setYieldRate(200);
      expect(await vault.yieldRate()).to.equal(200);
    });
    
    it("Should emit event when yield rate is updated", async function () {
      await expect(vault.setYieldRate(200))
        .to.emit(vault, "YieldRateUpdated")
        .withArgs(100, 200);
    });
    
    it("Should not exceed max yield rate", async function () {
      await expect(
        vault.setYieldRate(2000)
      ).to.be.revertedWith("Vault: Rate too high");
    });
    
    it("Should not allow non-owner to update yield rate", async function () {
      await expect(
        vault.connect(user1).setYieldRate(200)
      ).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
    });
  });
  
  describe("Edge Cases", function () {
    it("Should handle zero deposit", async function () {
      await vault.connect(user1).deposit(0, user1.address);
      expect(await vault.balanceOf(user1.address)).to.equal(0);
    });
    
    it("Should handle empty vault share price", async function () {
      expect(await vault.sharePrice()).to.equal(ethers.parseEther("1"));
    });
    
    it("Should handle withdrawal to different address", async function () {
      await vault.connect(user1).deposit(TEN_TOKENS, user1.address);
      const user2InitialBalance = await asset.balanceOf(user2.address);
      await vault.connect(user1).withdraw(ONE_TOKEN, user2.address, user1.address);
      expect(await asset.balanceOf(user2.address)).to.equal(user2InitialBalance + ONE_TOKEN);
    });
    
    it("Should handle multiple harvests correctly", async function () {
      await vault.connect(user1).deposit(TEN_TOKENS, user1.address);
      
      await vault.connect(owner).harvest();
      const afterFirstHarvest = await vault.totalAssets();
      
      await vault.connect(owner).harvest();
      const afterSecondHarvest = await vault.totalAssets();
      
      expect(afterSecondHarvest).to.be.gt(afterFirstHarvest);
    });
  });
});