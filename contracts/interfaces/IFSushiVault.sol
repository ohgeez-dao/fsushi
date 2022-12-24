// SPDX-License-Identifier: BSL-1.1

pragma solidity ^0.8.0;

interface IFSushiVault {
    function startWeek() external view returns (uint256);

    function lastDeposit(address account) external view returns (uint256);

    function lockedTotalBalanceDuring(uint256 week) external view returns (uint256);

    function lastCheckpoint() external view returns (uint256);

    function checkpointedLockedTotalBalanceDuring(uint256 week) external returns (uint256);

    function checkpoint() external;
}
