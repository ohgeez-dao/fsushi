// SPDX-License-Identifier: WTFPL

pragma solidity ^0.8.17;

library DateUtils {
    uint256 internal constant WEEK = 1 weeks;

    function startOfWeek(uint256 timestamp) internal pure returns (uint256) {
        return ((timestamp) / WEEK) * WEEK;
    }
}
