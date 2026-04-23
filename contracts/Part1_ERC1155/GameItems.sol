// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Supply.sol";
import "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155URIStorage.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/**
 * @title GameItems
 * @dev ERC-1155 contract for gaming assets with crafting functionality
 * 
 * Token IDs:
 * 0 = Gold (Fungible)
 * 1 = Wood (Fungible)
 * 2 = Iron (Fungible)
 * 3 = Legendary Sword (Non-Fungible NFT)
 * 4 = Dragon Shield (Non-Fungible NFT)
 */
contract GameItems is ERC1155, Ownable, ERC1155Supply, ERC1155URIStorage {
    using Strings for uint256;
    
    // Token ID constants for better readability
    uint256 public constant GOLD = 0;
    uint256 public constant WOOD = 1;
    uint256 public constant IRON = 2;
    uint256 public constant LEGENDARY_SWORD = 3;
    uint256 public constant DRAGON_SHIELD = 4;
    
    // Base URI for metadata
    string private _baseURI;
    
    // Crafting recipes: NFT ID => mapping of resource ID => amount required
    mapping(uint256 => mapping(uint256 => uint256)) public craftingRecipes;
    
    // Events
    event Crafted(address indexed player, uint256 indexed nftId, uint256 amount);
    event ResourcesBurned(address indexed player, uint256[] resourceIds, uint256[] amounts);
    
    constructor(string memory baseURI) ERC1155("") Ownable(msg.sender) {
        _baseURI = baseURI;
        
        // Set up crafting recipe for Legendary Sword
        craftingRecipes[LEGENDARY_SWORD][GOLD] = 100;
        craftingRecipes[LEGENDARY_SWORD][IRON] = 50;
        
        // Set up crafting recipe for Dragon Shield
        craftingRecipes[DRAGON_SHIELD][GOLD] = 150;
        craftingRecipes[DRAGON_SHIELD][IRON] = 75;
        craftingRecipes[DRAGON_SHIELD][WOOD] = 25;
    }
    
    /**
     * @dev Sets the base URI for all token types
     */
    function setBaseURI(string memory newBaseURI) external onlyOwner {
        _baseURI = newBaseURI;
    }
    
    /**
     * @dev Returns the URI for a given token ID
     */
    function uri(uint256 tokenId) public view virtual override(ERC1155, ERC1155URIStorage) returns (string memory) {
        return string(abi.encodePacked(_baseURI, tokenId.toString(), ".json"));
    }
    
    /**
     * @dev Mint a single token type
     */
    function mint(address to, uint256 id, uint256 amount, bytes memory data) external onlyOwner {
        _mint(to, id, amount, data);
    }
    
    /**
     * @dev Mint multiple token types at once
     */
    function mintBatch(address to, uint256[] memory ids, uint256[] memory amounts, bytes memory data) external onlyOwner {
        _mintBatch(to, ids, amounts, data);
    }
    
    /**
     * @dev Craft an NFT by burning required resources
     * @param nftId The NFT to craft (must be LEGENDARY_SWORD or DRAGON_SHIELD)
     */
    function craft(uint256 nftId) external {
        require(nftId == LEGENDARY_SWORD || nftId == DRAGON_SHIELD, "GameItems: Invalid NFT ID");
        
        // Check if recipe exists
        uint256 goldRequired = craftingRecipes[nftId][GOLD];
        uint256 ironRequired = craftingRecipes[nftId][IRON];
        uint256 woodRequired = craftingRecipes[nftId][WOOD];
        
        require(goldRequired > 0 || ironRequired > 0 || woodRequired > 0, "GameItems: Recipe not set");
        
        // Check balances
        require(balanceOf(msg.sender, GOLD) >= goldRequired, "GameItems: Insufficient Gold");
        require(balanceOf(msg.sender, IRON) >= ironRequired, "GameItems: Insufficient Iron");
        require(balanceOf(msg.sender, WOOD) >= woodRequired, "GameItems: Insufficient Wood");
        
        // Prepare burn arrays
        uint256[] memory idsToBurn = new uint256[](3);
        uint256[] memory amountsToBurn = new uint256[](3);
        uint256 burnCount = 0;
        
        if (goldRequired > 0) {
            idsToBurn[burnCount] = GOLD;
            amountsToBurn[burnCount] = goldRequired;
            burnCount++;
        }
        if (ironRequired > 0) {
            idsToBurn[burnCount] = IRON;
            amountsToBurn[burnCount] = ironRequired;
            burnCount++;
        }
        if (woodRequired > 0) {
            idsToBurn[burnCount] = WOOD;
            amountsToBurn[burnCount] = woodRequired;
            burnCount++;
        }
        
        // Trim arrays to actual size
        assembly {
            mstore(idsToBurn, burnCount)
            mstore(amountsToBurn, burnCount)
        }
        
        // Burn resources
        _burnBatch(msg.sender, idsToBurn, amountsToBurn);
        emit ResourcesBurned(msg.sender, idsToBurn, amountsToBurn);
        
        // Mint NFT
        _mint(msg.sender, nftId, 1, "");
        emit Crafted(msg.sender, nftId, 1);
    }
    
    /**
     * @dev Override required by Solidity for multiple inheritance
     */
    function _update(address from, address to, uint256[] memory ids, uint256[] memory values)
        internal
        override(ERC1155, ERC1155Supply)
    {
        super._update(from, to, ids, values);
    }
    
    /**
     * @dev Check if an NFT exists (has been minted at least once)
     */
    function exists(uint256 id) public view override(ERC1155Supply) returns (bool) {
        return super.exists(id);
    }
    
    /**
     * @dev Get all resources required for an NFT
     */
    function getCraftingRequirements(uint256 nftId) external view returns (
        uint256 goldNeeded,
        uint256 ironNeeded,
        uint256 woodNeeded
    ) {
        require(nftId == LEGENDARY_SWORD || nftId == DRAGON_SHIELD, "GameItems: Invalid NFT ID");
        return (
            craftingRecipes[nftId][GOLD],
            craftingRecipes[nftId][IRON],
            craftingRecipes[nftId][WOOD]
        );
    }
}
