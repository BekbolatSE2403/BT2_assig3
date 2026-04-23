// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

/**
 * @title MockAggregator
 * @dev Mock Chainlink price feed for testing purposes
 */
contract MockAggregator is AggregatorV3Interface {
    int256 private _price;
    uint8 private _decimals;
    uint256 private _updatedAt;
    uint80 private _roundId;
    
    constructor(uint8 decimals_, int256 initialPrice) {
        _decimals = decimals_;
        _price = initialPrice;
        _updatedAt = block.timestamp;
        _roundId = 1;
    }
    
    function setPrice(int256 newPrice) external {
        _price = newPrice;
        _updatedAt = block.timestamp;
        _roundId++;
    }
    
    function setDecimals(uint8 newDecimals) external {
        _decimals = newDecimals;
    }
    
    function setTimestamp(uint256 timestamp) external {
        _updatedAt = timestamp;
    }
    
    function decimals() external view override returns (uint8) {
        return _decimals;
    }
    
    function description() external pure override returns (string memory) {
        return "Mock ETH/USD Price Feed";
    }
    
    function version() external pure override returns (uint256) {
        return 1;
    }
    
    function getRoundData(uint80 _roundId_) external view override
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        roundId = _roundId_;
        answer = _price;
        startedAt = _updatedAt;
        updatedAt = _updatedAt;
        answeredInRound = _roundId_;
    }
    
    function latestRoundData() external view override
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        roundId = _roundId;
        answer = _price;
        startedAt = _updatedAt;
        updatedAt = _updatedAt;
        answeredInRound = _roundId;
    }
}