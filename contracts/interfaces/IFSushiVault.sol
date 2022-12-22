// SPDX-License-Identifier: WTFPL

pragma solidity ^0.8.0;

interface IFSushiVault {
    function startTime() external view returns (uint256);

    function totalAssetsAt(uint256 time) external view returns (uint256);

    function lastCheckpoint() external view returns (uint256);

    function checkpoint() external;
}
