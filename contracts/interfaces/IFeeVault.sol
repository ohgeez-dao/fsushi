// SPDX-License-Identifier: WTFPL

pragma solidity ^0.8.0;

interface IFeeVault {
    function checkpoint(address token) external;
}
