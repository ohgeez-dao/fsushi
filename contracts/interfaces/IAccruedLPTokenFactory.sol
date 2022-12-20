// SPDX-License-Identifier: WTFPL

pragma solidity ^0.8.0;

interface IAccruedLPTokenFactory {
    error InvalidAddress();
    error TokenCreated();

    event UpdateVault(address indexed vault);
    event CreateAccruedLPToken(uint256 indexed pid, address indexed token);

    function router() external view returns (address);

    function masterChef() external view returns (address);

    function yieldVault() external view returns (address);

    function getAccruedLPToken(uint256 pid) external view returns (address);

    function predictAccruedLPTokenAddress(uint256 pid) external view returns (address token);

    function updateYieldVault(address vault) external;

    function createAccruedLPToken(uint256 pid) external returns (address token);
}
