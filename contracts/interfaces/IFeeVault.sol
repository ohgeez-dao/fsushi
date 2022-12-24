// SPDX-License-Identifier: BSL-1.1

pragma solidity ^0.8.0;

interface IFeeVault {
    function checkpoint(address token) external;
}
