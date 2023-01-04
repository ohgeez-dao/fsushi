// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

interface IFSushiRestaurant {
    function startWeek() external view returns (uint256);

    function totalAssetsDuring(uint256 week) external view returns (uint256);

    function userAssetsDuring(address account, uint256 week) external view returns (uint256);

    function lastCheckpoint() external view returns (uint256);

    function lastUserCheckpoint(address account) external view returns (uint256);

    function checkpointedTotalAssetsDuring(uint256 week) external returns (uint256);

    function checkpointedUserAssetsDuring(address account, uint256 week) external returns (uint256);

    function checkpoint() external;

    function userCheckpoint(address account) external;
}
