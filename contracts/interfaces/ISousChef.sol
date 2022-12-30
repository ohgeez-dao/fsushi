// SPDX-License-Identifier: BSL-1.1

pragma solidity ^0.8.0;

interface ISousChef {
    error FSushiBillCreated();
    error InvalidPid();
    error InvalidFSushiVault();
    error InvalidFSushiKitchen();
    error Forbidden();

    event UpdateFSushiVault(address indexed fSushiVault);
    event UpdateFSushiKitchen(address indexed fSushiKitchen);
    event CreateFSushiBill(uint256 indexed pid, address indexed bill);
    event Checkpoint();

    function BONUS_MULTIPLIER() external view returns (uint256);

    function REWARDS_FOR_INITIAL_WEEK() external view returns (uint256);

    function fSushi() external view returns (address);

    function flashStrategyFactory() external view returns (address);

    function startWeek() external view returns (uint256);

    function vault() external view returns (address);

    function kitchen() external view returns (address);

    function getFSushiBill(uint256 pid) external view returns (address);

    function weeklyRewards(uint256 week) external view returns (uint256);

    function lastCheckpoint() external view returns (uint256);

    function predictFSushiBillAddress(uint256 pid) external view returns (address bill);

    function updateFSushiVault(address _fSushiVault) external;

    function updateFSushiKitchen(address _fSushiKitchen) external;

    function createFSushiBill(uint256 pid) external returns (address strategy);

    function checkpoint() external;

    function mintFSushi(
        uint256 pid,
        address to,
        uint256 amount
    ) external;
}
