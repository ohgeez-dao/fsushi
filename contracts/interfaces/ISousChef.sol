// SPDX-License-Identifier: WTFPL

pragma solidity ^0.8.0;

interface ISousChef {
    error TooEarly();
    error InvalidPid();
    error InvalidFSushiLocker();
    error InvalidFSushiController();
    error NoClaimableRewards();

    event UpdateFSushiLocker(address indexed fSushiLocker);
    event UpdateFSushiController(address indexed fSushiController);
    event Deposit(uint256 indexed pid, uint256 amount, address indexed beneficiary);
    event AllocateRewards(
        uint256 indexed pid,
        address indexed account,
        uint256 lastCheckpoint,
        uint256 allocatedRewards
    );
    event ClaimRewards(uint256 indexed pid, address indexed account, uint256 lastCheckpoint, uint256 amount);

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

    function claimRewards(uint256 pid) external;

    function checkpoint(uint256 pid) external returns (uint256 _lastCheckpointTime);

    function userCheckpoint(uint256 pid, address account) external returns (uint256);
}
