// SPDX-License-Identifier: BSL-1.1

pragma solidity ^0.8.0;

interface IFSushiController {
    function relativeWeightAt(uint256 pid, uint256 time) external view returns (uint256);
}
