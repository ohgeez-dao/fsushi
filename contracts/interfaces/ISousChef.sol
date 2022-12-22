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

    function WEEK() external view returns (uint256);

    function BONUS_MULTIPLIER() external view returns (uint256);

    function INITIAL_REWARDS_IN_WEEK() external view returns (uint256);

    function fSushi() external view returns (address);

    function flashStrategyFactory() external view returns (address);

    function startTime() external view returns (uint256);

    function locker() external view returns (address);

    function controller() external view returns (address);

    function rewardsInWeek(uint256 time) external view returns (uint256);

    function allocatedRewards(uint256 pid, address account) external view returns (uint256);

    function claimedRewards(uint256 pid, address account) external view returns (uint256);

    function checkpoints(uint256 pid, uint256 index) external view returns (uint256 amount, uint256 timestamp);

    function checkpointsLength(uint256 pid) external view returns (uint256);

    function points(uint256 pid, uint256 time) external view returns (uint256);

    function lastCheckpoint(uint256 pid) external view returns (uint256 time);

    function userCheckpoints(
        uint256 pid,
        address account,
        uint256 index
    ) external view returns (uint256 amount, uint256 timestamp);

    function userPoints(
        uint256 pid,
        address account,
        uint256 time
    ) external view returns (uint256);

    function userLastCheckpoint(uint256 pid, address account) external view returns (uint256 time);

    function userCheckpointsLength(uint256 pid, address account) external view returns (uint256);

    function updateFSushiLocker(address _fSushiLocker) external;

    function updateFSushiController(address _fSushiController) external;

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
