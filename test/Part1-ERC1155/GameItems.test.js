const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("GameItems ERC-1155", function () {
  let GameItems;
  let gameItems;
  let owner;
  let player1;
  let player2;
  
  const GOLD = 0;
  const WOOD = 1;
  const IRON = 2;
  const LEGENDARY_SWORD = 3;
  const DRAGON_SHIELD = 4;
  
  const BASE_URI = "https://api.gamemetadata.com/items/";
  
  beforeEach(async function () {
    [owner, player1, player2] = await ethers.getSigners();
    
    GameItems = await ethers.getContractFactory("GameItems");
    gameItems = await GameItems.deploy(BASE_URI);
    await gameItems.waitForDeployment();
  });
  
  describe("Deployment", function () {
    it("Should set the correct base URI", async function () {
      expect(await gameItems.uri(GOLD)).to.equal(BASE_URI + "0.json");
    });
    
    it("Should set the correct owner", async function () {
      expect(await gameItems.owner()).to.equal(owner.address);
    });
    
    it("Should have correct crafting recipes", async function () {
      const swordRecipe = await gameItems.getCraftingRequirements(LEGENDARY_SWORD);
      expect(swordRecipe.goldNeeded).to.equal(100);
      expect(swordRecipe.ironNeeded).to.equal(50);
      expect(swordRecipe.woodNeeded).to.equal(0);
      
      const shieldRecipe = await gameItems.getCraftingRequirements(DRAGON_SHIELD);
      expect(shieldRecipe.goldNeeded).to.equal(150);
      expect(shieldRecipe.ironNeeded).to.equal(75);
      expect(shieldRecipe.woodNeeded).to.equal(25);
    });
  });
  
  describe("Minting", function () {
    it("Should mint fungible tokens (single)", async function () {
      await gameItems.mint(player1.address, GOLD, 500, "0x");
      expect(await gameItems.balanceOf(player1.address, GOLD)).to.equal(500);
    });
    
    it("Should mint fungible tokens (batch)", async function () {
      const ids = [GOLD, WOOD, IRON];
      const amounts = [500, 300, 200];
      
      await gameItems.mintBatch(player1.address, ids, amounts, "0x");
      
      expect(await gameItems.balanceOf(player1.address, GOLD)).to.equal(500);
      expect(await gameItems.balanceOf(player1.address, WOOD)).to.equal(300);
      expect(await gameItems.balanceOf(player1.address, IRON)).to.equal(200);
    });
    
    it("Should mint NFTs", async function () {
      await gameItems.mint(player1.address, LEGENDARY_SWORD, 1, "0x");
      expect(await gameItems.balanceOf(player1.address, LEGENDARY_SWORD)).to.equal(1);
    });
    
    it("Should revert minting from non-owner", async function () {
      await expect(
        gameItems.connect(player1).mint(player1.address, GOLD, 100, "0x")
      ).to.be.revertedWithCustomError(gameItems, "OwnableUnauthorizedAccount");
    });
    
    it("Should track total supply correctly", async function () {
      await gameItems.mint(player1.address, GOLD, 500, "0x");
      await gameItems.mint(player2.address, GOLD, 300, "0x");
      
      // Use explicit function signature to avoid ambiguity
      expect(await gameItems["totalSupply(uint256)"](GOLD)).to.equal(800);
    });
  });
  
  describe("Transfers", function () {
    beforeEach(async function () {
      await gameItems.mint(player1.address, GOLD, 500, "0x");
      await gameItems.mintBatch(player1.address, [WOOD, IRON], [300, 200], "0x");
    });
    
    it("Should transfer single token type", async function () {
      await gameItems.connect(player1).safeTransferFrom(
        player1.address, player2.address, GOLD, 100, "0x"
      );
      
      expect(await gameItems.balanceOf(player1.address, GOLD)).to.equal(400);
      expect(await gameItems.balanceOf(player2.address, GOLD)).to.equal(100);
    });
    
    it("Should batch transfer multiple token types", async function () {
      const ids = [GOLD, WOOD];
      const amounts = [100, 50];
      
      await gameItems.connect(player1).safeBatchTransferFrom(
        player1.address, player2.address, ids, amounts, "0x"
      );
      
      expect(await gameItems.balanceOf(player1.address, GOLD)).to.equal(400);
      expect(await gameItems.balanceOf(player1.address, WOOD)).to.equal(250);
      expect(await gameItems.balanceOf(player2.address, GOLD)).to.equal(100);
      expect(await gameItems.balanceOf(player2.address, WOOD)).to.equal(50);
    });
    
    it("Should revert transfer of insufficient balance", async function () {
      await expect(
        gameItems.connect(player1).safeTransferFrom(
          player1.address, player2.address, GOLD, 1000, "0x"
        )
      ).to.be.revertedWithCustomError(gameItems, "ERC1155InsufficientBalance");
    });
  });
  
  describe("Crafting", function () {
    beforeEach(async function () {
      // Give player1 enough resources to craft
      await gameItems.mintBatch(
        player1.address,
        [GOLD, WOOD, IRON],
        [500, 200, 200],
        "0x"
      );
    });
    
    it("Should craft Legendary Sword by burning resources", async function () {
      const initialGold = await gameItems.balanceOf(player1.address, GOLD);
      const initialIron = await gameItems.balanceOf(player1.address, IRON);
      
      await gameItems.connect(player1).craft(LEGENDARY_SWORD);
      
      // Check resources were burned
      expect(await gameItems.balanceOf(player1.address, GOLD)).to.equal(initialGold - 100n);
      expect(await gameItems.balanceOf(player1.address, IRON)).to.equal(initialIron - 50n);
      
      // Check NFT was minted
      expect(await gameItems.balanceOf(player1.address, LEGENDARY_SWORD)).to.equal(1);
      // Use explicit function signature to avoid ambiguity
      expect(await gameItems["totalSupply(uint256)"](LEGENDARY_SWORD)).to.equal(1);
    });
    
    it("Should craft Dragon Shield by burning resources", async function () {
      await gameItems.connect(player1).craft(DRAGON_SHIELD);
      
      expect(await gameItems.balanceOf(player1.address, GOLD)).to.equal(350);
      expect(await gameItems.balanceOf(player1.address, IRON)).to.equal(125);
      expect(await gameItems.balanceOf(player1.address, WOOD)).to.equal(175);
      expect(await gameItems.balanceOf(player1.address, DRAGON_SHIELD)).to.equal(1);
    });
    
    it("Should revert crafting with insufficient resources", async function () {
      // Give player2 only 10 gold (not enough for any craft)
      await gameItems.mint(player2.address, GOLD, 10, "0x");
      
      await expect(
        gameItems.connect(player2).craft(LEGENDARY_SWORD)
      ).to.be.revertedWith("GameItems: Insufficient Gold");
    });
    
    it("Should revert crafting invalid NFT ID", async function () {
      await expect(
        gameItems.connect(player1).craft(99)
      ).to.be.revertedWith("GameItems: Invalid NFT ID");
    });
    
    it("Should emit Crafted and ResourcesBurned events", async function () {
      await expect(gameItems.connect(player1).craft(LEGENDARY_SWORD))
        .to.emit(gameItems, "ResourcesBurned")
        .and.to.emit(gameItems, "Crafted")
        .withArgs(player1.address, LEGENDARY_SWORD, 1);
    });
    
    it("Should allow crafting multiple NFTs", async function () {
      await gameItems.connect(player1).craft(LEGENDARY_SWORD);
      await gameItems.connect(player1).craft(DRAGON_SHIELD);
      
      expect(await gameItems.balanceOf(player1.address, LEGENDARY_SWORD)).to.equal(1);
      expect(await gameItems.balanceOf(player1.address, DRAGON_SHIELD)).to.equal(1);
    });
  });
  
  describe("URI Management", function () {
    it("Should return correct URI for each token type", async function () {
      expect(await gameItems.uri(GOLD)).to.equal(BASE_URI + "0.json");
      expect(await gameItems.uri(WOOD)).to.equal(BASE_URI + "1.json");
      expect(await gameItems.uri(IRON)).to.equal(BASE_URI + "2.json");
      expect(await gameItems.uri(LEGENDARY_SWORD)).to.equal(BASE_URI + "3.json");
      expect(await gameItems.uri(DRAGON_SHIELD)).to.equal(BASE_URI + "4.json");
    });
    
    it("Should allow owner to update base URI", async function () {
      const newBaseURI = "https://new-api.example.com/tokens/";
      await gameItems.setBaseURI(newBaseURI);
      
      expect(await gameItems.uri(GOLD)).to.equal(newBaseURI + "0.json");
    });
    
    it("Should revert URI update from non-owner", async function () {
      await expect(
        gameItems.connect(player1).setBaseURI("https://hack.xyz/")
      ).to.be.revertedWithCustomError(gameItems, "OwnableUnauthorizedAccount");
    });
  });
  
  describe("Edge Cases", function () {
    it("Should handle minting to zero address", async function () {
      await expect(
        gameItems.mint("0x0000000000000000000000000000000000000000", GOLD, 100, "0x")
      ).to.be.revertedWithCustomError(gameItems, "ERC1155InvalidReceiver");
    });
    
    it("Should check existence of token", async function () {
      expect(await gameItems.exists(GOLD)).to.be.false;
      
      await gameItems.mint(player1.address, GOLD, 100, "0x");
      expect(await gameItems.exists(GOLD)).to.be.true;
    });
    
    it("Should handle batch mint with empty arrays", async function () {
      await gameItems.mintBatch(player1.address, [], [], "0x");
      // Should not revert
    });
  });
});
