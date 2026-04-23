// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

interface IMintableERC20 {
    function mint(address to, uint256 amount) external;
}

/**
 * @title Vault
 * @dev ERC-4626 Tokenized Vault that accepts deposits and generates yield
 */
contract Vault is ERC4626, Ownable {
    using Math for uint256;
    
    uint256 public yieldRate = 100; // 1% yield per harvest (basis points, 100 = 1%)
    uint256 public constant MAX_YIELD_RATE = 1000; // Max 10%
    
    event Harvest(uint256 yieldAmount, uint256 totalAssetsAfter);
    event YieldRateUpdated(uint256 oldRate, uint256 newRate);
    
    constructor(
        IERC20 asset,
        string memory name,
        string memory symbol
    ) ERC4626(asset) ERC20(name, symbol) Ownable(msg.sender) {}
    
    /**
     * @dev Simulates yield generation by minting new underlying tokens
     */
    function harvest() external onlyOwner {
        uint256 total = totalAssets();
        uint256 yield = total.mulDiv(yieldRate, 10000, Math.Rounding.Floor);
        
        require(yield > 0, "Vault: Yield too small");
        
        // Simulate yield by minting tokens to the vault
        IMintableERC20(address(asset())).mint(address(this), yield);
        
        emit Harvest(yield, totalAssets());
    }
    
    /**
     * @dev Updates the yield rate (basis points)
     */
    function setYieldRate(uint256 newRate) external onlyOwner {
        require(newRate <= MAX_YIELD_RATE, "Vault: Rate too high");
        uint256 oldRate = yieldRate;
        yieldRate = newRate;
        emit YieldRateUpdated(oldRate, newRate);
    }
    
    /**
     * @dev Override to ensure proper rounding
     */
    function _convertToShares(
        uint256 assets,
        Math.Rounding rounding
    ) internal view virtual override returns (uint256 shares) {
        uint256 supply = totalSupply();
        return 
            (assets == 0 || supply == 0)
                ? assets
                : assets.mulDiv(supply, totalAssets(), rounding);
    }
    
    /**
     * @dev Override to ensure proper rounding
     */
    function _convertToAssets(
        uint256 shares,
        Math.Rounding rounding
    ) internal view virtual override returns (uint256 assets) {
        uint256 supply = totalSupply();
        return 
            (supply == 0)
                ? shares
                : shares.mulDiv(totalAssets(), supply, rounding);
    }
    
    /**
     * @dev Preview deposit with rounding down (shares to receive)
     */
    function previewDeposit(uint256 assets) public view virtual override returns (uint256) {
        return _convertToShares(assets, Math.Rounding.Floor);
    }
    
    /**
     * @dev Preview mint with rounding up (assets needed)
     */
    function previewMint(uint256 shares) public view virtual override returns (uint256) {
        return _convertToAssets(shares, Math.Rounding.Ceil);
    }
    
    /**
     * @dev Preview withdraw with rounding up (shares to burn)
     */
    function previewWithdraw(uint256 assets) public view virtual override returns (uint256) {
        return _convertToShares(assets, Math.Rounding.Ceil);
    }
    
    /**
     * @dev Preview redeem with rounding down (assets to receive)
     */
    function previewRedeem(uint256 shares) public view virtual override returns (uint256) {
        return _convertToAssets(shares, Math.Rounding.Floor);
    }
    
    /**
     * @dev Get total assets in vault (underlying + any yield)
     */
    function totalAssets() public view virtual override returns (uint256) {
        return IERC20(asset()).balanceOf(address(this));
    }
    
    /**
     * @dev Convenience function to get share price (assets per share)
     */
    function sharePrice() external view returns (uint256) {
        uint256 supply = totalSupply();
        return supply == 0 ? 1e18 : totalAssets().mulDiv(1e18, supply, Math.Rounding.Floor);
    }
    
    /**
     * @dev Maximum deposit (no limit)
     */
    function maxDeposit(address) public view virtual override returns (uint256) {
        return type(uint256).max;
    }
    
    /**
     * @dev Maximum mint (no limit)
     */
    function maxMint(address) public view virtual override returns (uint256) {
        return type(uint256).max;
    }
    
    /**
     * @dev Maximum withdraw (limited by user's balance)
     */
    function maxWithdraw(address owner) public view virtual override returns (uint256) {
        return _convertToAssets(balanceOf(owner), Math.Rounding.Floor);
    }
    
    /**
     * @dev Maximum redeem (limited by user's share balance)
     */
    function maxRedeem(address owner) public view virtual override returns (uint256) {
        return balanceOf(owner);
    }
}
