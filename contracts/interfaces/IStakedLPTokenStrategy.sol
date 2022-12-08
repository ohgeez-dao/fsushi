// SPDX-License-Identifier: WTFPL

pragma solidity ^0.8.17;

interface IStakedLPTokenStrategy {
    function asset() external view returns (address);

    function shareToken() external view returns (address);

    function rewardToken() external view returns (address);

    function totalSupply() external view returns (uint256);

    function balanceOf(address account) external view returns (uint256);

    function claimableTotalRewards() external view returns (uint256);

    function claimableRewardsOf(address account) external view returns (uint256);

    function toAssets(uint256 amountShareToken) external view returns (uint256);

    function toShareTokens(uint256 amountAsset) external view returns (uint256);

    function deposit(uint256 amountAsset, address beneficiary) external returns (uint256 amountShareToken);

    function withdraw(uint256 amountShareToken, address beneficiary) external returns (uint256 claimedAmountRewards);
}
