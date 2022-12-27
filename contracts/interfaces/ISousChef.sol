// SPDX-License-Identifier: BSL-1.1

pragma solidity ^0.8.0;

interface ISousChef {
    error TooEarly();
    error InvalidPid();
    error InvalidFSushiVault();
    error InvalidFSushiKitchen();
    error NoClaimableRewards();

    event UpdateFSushiVault(address indexed fSushiVault);
    event UpdateFSushiKitchen(address indexed fSushiKitchen);
    event Deposit(uint256 indexed pid, uint256 amount, address indexed beneficiary);
    event Withdraw(uint256 indexed pid, uint256 amount, address indexed beneficiary);
    event Checkpoint(uint256 indexed pid);
    event UserCheckpoint(uint256 indexed pid, address indexed account);
    event UpdateWorkingBalance(
        uint256 indexed pid,
        address indexed account,
        uint256 workingBalance,
        uint256 workingSupply
    );
    event ClaimRewards(uint256 indexed pid, address indexed account, address indexed beneficiary, uint256 amount);

    function BONUS_MULTIPLIER() external view returns (uint256);

    function REWARDS_FOR_INITIAL_WEEK() external view returns (uint256);

    function fSushi() external view returns (address);

    function flashStrategyFactory() external view returns (address);

    function startWeek() external view returns (uint256);

    function vault() external view returns (address);

    function kitchen() external view returns (address);

    function weeklyRewards(uint256 time) external view returns (uint256);

    function totalSupply(uint256 pid) external view returns (uint256);

    function workingSupply(uint256 pid) external view returns (uint256);

    function points(uint256 pid, uint256 time) external view returns (uint256);

    function lastCheckpoint(uint256 pid) external view returns (uint256 time);

    function balanceOf(uint256 pid, address account) external view returns (uint256);

    function workingBalanceOf(uint256 pid, address account) external view returns (uint256);

    function userPoints(
        uint256 pid,
        address account,
        uint256 time
    ) external view returns (uint256);

    function userLastCheckpoint(uint256 pid, address account) external view returns (uint256 time);

    function claimedRewards(uint256 pid, address account) external view returns (uint256);

    function nextClaimableWeek(uint256 pid, address account) external view returns (uint256);

    function updateFSushiVault(address _fSushiVault) external;

    function updateFSushiKitchen(address _fSushiKitchen) external;

    function deposit(
        uint256 pid,
        uint256 amount,
        address beneficiary
    ) external;

    function withdraw(
        uint256 pid,
        uint256 amount,
        address beneficiary
    ) external;

    function claimRewards(uint256 pid, address beneficiary) external;

    function checkpoint(uint256 pid) external;

    function userCheckpoint(uint256 pid, address account) external;
}
