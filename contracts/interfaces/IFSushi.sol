// SPDX-License-Identifier: WTFPL

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

interface IFSushi is IERC20Metadata {
    function startWeek() external view returns (uint256);

    function totalSupplyDuring(uint256 time) external view returns (uint256);

    function lastCheckpoint() external view returns (uint256);

    function mint(address to, uint256 amount) external;

    function checkpointedTotalSupplyDuring(uint256 week) external returns (uint256);

    function checkpoint() external;
}
