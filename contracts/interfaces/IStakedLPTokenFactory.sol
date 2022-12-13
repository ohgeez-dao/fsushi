// SPDX-License-Identifier: WTFPL

pragma solidity ^0.8.0;

interface IStakedLPTokenFactory {
    event UpdateStrategy(address indexed strategy);
    event CreateStakedLPToken(uint256 indexed pid, address indexed token);

    function router() external view returns (address);

    function masterChef() external view returns (address);

    function strategy() external view returns (address);

    function tokens(uint256 pid) external view returns (address);

    function predictStakedLPTokenAddress(uint256 pid) external view returns (address token);

    function updateStrategy(address _strategy) external;

    function createStakedLPToken(uint256 pid) external returns (address token);
}
