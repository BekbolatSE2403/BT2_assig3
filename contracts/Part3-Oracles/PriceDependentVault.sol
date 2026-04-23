// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./PriceFeedConsumer.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title PriceDependentVault
 * @dev Vault that accepts ETH deposits and only allows withdrawals when
 *      ETH price is above a configurable threshold
 */
contract PriceDependentVault is Ownable, ReentrancyGuard {
    PriceFeedConsumer public priceFeed;
    
    uint256 public priceThreshold;
    uint256 public constant PRICE_PRECISION = 1e8;
    
    mapping(address => uint256) public deposits;
    uint256 public totalDeposits;
    
    // Events
    event Deposited(address indexed user, uint256 amount, uint256 ethPrice);
    event Withdrawn(address indexed user, uint256 amount, uint256 ethPrice);
    event ThresholdUpdated(uint256 oldThreshold, uint256 newThreshold);
    event WithdrawalBlocked(address indexed user, uint256 currentPrice, uint256 threshold);
    
    constructor(address _priceFeed, uint256 _priceThreshold) Ownable(msg.sender) {
        priceFeed = new PriceFeedConsumer(_priceFeed);
        priceThreshold = _priceThreshold;
    }
    
    /**
     * @dev Deposit ETH into the vault
     */
    function deposit() external payable nonReentrant {
        require(msg.value > 0, "Vault: Deposit amount must be greater than 0");
        
        deposits[msg.sender] += msg.value;
        totalDeposits += msg.value;
        
        (int256 price, ) = priceFeed.getLatestPrice();
        
        emit Deposited(msg.sender, msg.value, uint256(price));
    }
    
    /**
     * @dev Withdraw ETH from the vault (only if price above threshold)
     * @param amount Amount of ETH to withdraw
     */
    function withdraw(uint256 amount) external nonReentrant {
        require(amount > 0, "Vault: Withdraw amount must be greater than 0");
        require(deposits[msg.sender] >= amount, "Vault: Insufficient balance");
        
        (int256 price, ) = priceFeed.getLatestPrice();
        uint256 currentPrice = uint256(price);
        
        require(currentPrice >= priceThreshold, "Vault: ETH price below withdrawal threshold");
        
        deposits[msg.sender] -= amount;
        totalDeposits -= amount;
        
        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "Vault: ETH transfer failed");
        
        emit Withdrawn(msg.sender, amount, currentPrice);
    }
    
    /**
     * @dev Get USD value of user's deposit
     * @param user Address to check
     * @return usdValue Value in USD (8 decimals from Chainlink)
     */
    function getUSDValue(address user) external view returns (uint256) {
        uint256 ethBalance = deposits[user];
        (int256 price, ) = priceFeed.getLatestPrice();
        
        return (ethBalance * uint256(price)) / 1e18;
    }
    
    /**
     * @dev Get USD value of total vault deposits
     */
    function getTotalUSDValue() external view returns (uint256) {
        (int256 price, ) = priceFeed.getLatestPrice();
        return (totalDeposits * uint256(price)) / 1e18;
    }
    
    /**
     * @dev Update the price threshold for withdrawals
     */
    function setPriceThreshold(uint256 newThreshold) external onlyOwner {
        uint256 oldThreshold = priceThreshold;
        priceThreshold = newThreshold;
        emit ThresholdUpdated(oldThreshold, newThreshold);
    }
    
    /**
     * @dev Check if withdrawals are currently allowed
     */
    function isWithdrawalAllowed() external view returns (bool) {
        (int256 price, ) = priceFeed.getLatestPrice();
        return uint256(price) >= priceThreshold;
    }
    
    /**
     * @dev Get current ETH price
     */
    function getCurrentPrice() external view returns (uint256) {
        (int256 price, ) = priceFeed.getLatestPrice();
        return uint256(price);
    }
    
    // Receive function to accept ETH
    receive() external payable {
        deposits[msg.sender] += msg.value;
        totalDeposits += msg.value;
        
        (int256 price, ) = priceFeed.getLatestPrice();
        emit Deposited(msg.sender, msg.value, uint256(price));
    }
}