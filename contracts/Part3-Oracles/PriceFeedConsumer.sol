// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

/**
 * @title PriceFeedConsumer
 * @dev Contract that consumes Chainlink price feeds with stale data protection
 */
contract PriceFeedConsumer {
    AggregatorV3Interface internal priceFeed;
    uint256 public constant STALENESS_THRESHOLD = 1 hours;
    
    // Events
    event PriceUpdated(int256 price, uint256 timestamp);
    event StalePriceDetected(uint256 lastUpdate, uint256 threshold);
    
    constructor(address _priceFeed) {
        priceFeed = AggregatorV3Interface(_priceFeed);
    }
    
    /**
     * @dev Get the latest ETH/USD price with proper decimal handling
     * @return price The price in 8 decimals (Chainlink standard)
     * @return timestamp When the price was last updated
     */
    function getLatestPrice() public view returns (int256 price, uint256 timestamp) {
        (
            /* uint80 roundId */,
            int256 answer,
            /* uint256 startedAt */,
            uint256 updatedAt,
            /* uint80 answeredInRound */
        ) = priceFeed.latestRoundData();
        
        require(updatedAt > 0, "PriceFeed: Round not complete");
        require(
            block.timestamp - updatedAt <= STALENESS_THRESHOLD,
            "PriceFeed: Stale price data"
        );
        
        return (answer, updatedAt);
    }
    
    /**
     * @dev Get price with custom staleness threshold
     * @param maxStaleness Maximum age of price data in seconds
     */
    function getLatestPriceWithThreshold(uint256 maxStaleness) 
        public 
        view 
        returns (int256 price, uint256 timestamp) 
    {
        (
            /* uint80 roundId */,
            int256 answer,
            /* uint256 startedAt */,
            uint256 updatedAt,
            /* uint80 answeredInRound */
        ) = priceFeed.latestRoundData();
        
        require(updatedAt > 0, "PriceFeed: Round not complete");
        require(
            block.timestamp - updatedAt <= maxStaleness,
            "PriceFeed: Stale price data"
        );
        
        return (answer, updatedAt);
    }
    
    /**
     * @dev Get the price feed decimals
     */
    function getDecimals() public view returns (uint8) {
        return priceFeed.decimals();
    }
    
    /**
     * @dev Get price normalized to 18 decimals (for ETH calculations)
     * @return normalizedPrice Price with 18 decimals
     */
    function getNormalizedPrice() public view returns (uint256 normalizedPrice) {
        (int256 price, ) = getLatestPrice();
        uint8 feedDecimals = priceFeed.decimals();
        
        if (feedDecimals < 18) {
            normalizedPrice = uint256(price) * 10 ** (18 - feedDecimals);
        } else if (feedDecimals > 18) {
            normalizedPrice = uint256(price) / 10 ** (feedDecimals - 18);
        } else {
            normalizedPrice = uint256(price);
        }
    }
    
    /**
     * @dev Check if price feed is stale
     */
    function isPriceStale() public view returns (bool) {
        (, , , uint256 updatedAt, ) = priceFeed.latestRoundData();
        return block.timestamp - updatedAt > STALENESS_THRESHOLD;
    }
}