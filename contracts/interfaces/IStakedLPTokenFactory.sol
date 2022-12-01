// SPDX-License-Identifier: WTFPL

pragma solidity ^0.8.0;

interface IStakedLPTokenFactory {
    event CreateStakedLPToken(uint256 indexed pid, address indexed token);

    function masterChef() external view returns (address);

    function predictStakedLPTokenAddress(uint256 pid) external view returns (address token);

    function createStakedLPToken(uint256 pid) external returns (address token);
}
