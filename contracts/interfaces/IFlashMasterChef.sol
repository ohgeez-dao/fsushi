// SPDX-License-Identifier: WTFPL

pragma solidity ^0.8.0;

import "./IFlashStrategy.sol";

interface IFlashMasterChef is IFlashStrategy {
    function factory() external view returns (address);

    function flashProtocol() external view returns (address);

    function fToken() external view returns (address);

    function sushi() external view returns (address);

    function slpToken() external view returns (address);

    function initialize(
        address _flashProtocol,
        address _slpTokenFactory,
        uint256 _pid
    ) external;
}
