// SPDX-License-Identifier: WTFPL

pragma solidity ^0.8.0;

interface IFSushiLocker {
    function circulatingSupply(uint256 time) external view returns (uint256);
}
