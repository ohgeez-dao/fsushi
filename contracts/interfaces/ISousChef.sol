// SPDX-License-Identifier: WTFPL

pragma solidity ^0.8.0;

import "./IFlashStrategy.sol";

interface ISousChef is IFlashStrategy {
    error Forbidden();
    error InvalidFlashProtocol();
    error InvalidVault();
    error AmountTooLow();
    error InsufficientYield();
    error InsufficientTotalSupply();

    function factory() external view returns (address);

    function flashProtocol() external view returns (address);

    function fToken() external view returns (address);

    function sushi() external view returns (address);

    function alpToken() external view returns (address);

    function initialize(
        address _flashProtocol,
        address _alpTokenFactory,
        uint256 _pid
    ) external;
}
