// SPDX-License-Identifier: WTFPL

pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IStakedLPTokenStrategy.sol";
import "./interfaces/IStakedLPTokenFactory.sol";
import "./interfaces/ISushiBar.sol";

contract SushiBarStrategy is IStakedLPTokenStrategy {
    using SafeERC20 for IERC20;

    address internal immutable _sushi;
    address internal immutable _sushiBar;

    uint256 public override totalSupply;
    mapping(address => uint256) public override balanceOf;
    mapping(address => uint256) internal _claimedRewardsOf;

    constructor(address sushi, address sushiBar) {
        _sushi = sushi;
        _sushiBar = sushiBar;

        approveMax();
    }

    function asset() external view override returns (address) {
        return _sushi;
    }

    function shareToken() external view override returns (address) {
        return _sushiBar;
    }

    function rewardToken() external view override returns (address) {
        return _sushi;
    }

    function claimableTotalRewards() external view override returns (uint256) {
        return toAssets(totalSupply);
    }

    function claimableRewardsOf(address account) external view override returns (uint256) {
        return toAssets(balanceOf[account]);
    }

    function toAssets(uint256 amountSushiBar) public view override returns (uint256) {
        uint256 totalSushiBar = ISushiBar(_sushiBar).totalSupply();
        if (totalSushiBar == 0) return amountSushiBar;
        return (IERC20(_sushi).balanceOf(address(_sushiBar)) * amountSushiBar) / totalSushiBar;
    }

    function toShares(uint256 amountSushi) external view override returns (uint256) {
        uint256 totalSushiBar = ISushiBar(_sushiBar).totalSupply();
        uint256 balance = IERC20(_sushi).balanceOf(_sushiBar);
        if (totalSushiBar == 0 || balance == 0) return amountSushi;
        return (amountSushi * totalSushiBar) / balance;
    }

    function approveMax() public {
        IERC20(_sushi).approve(_sushiBar, type(uint256).max);
    }

    function deposit(uint256 amountSushi, address beneficiary) external returns (uint256 amountSushiBar) {
        IERC20(_sushi).safeTransferFrom(msg.sender, address(this), amountSushi);
        ISushiBar(_sushiBar).enter(amountSushi);

        uint256 balanceSushiBar = IERC20(_sushiBar).balanceOf(address(this));
        amountSushiBar = balanceSushiBar - totalSupply;
        balanceOf[beneficiary] += amountSushiBar;
        unchecked {
            totalSupply = balanceSushiBar;
        }
    }

    function withdraw(uint256 amountSushiBar, address beneficiary) external returns (uint256 claimedAmountSushi) {
        ISushiBar(_sushiBar).leave(amountSushiBar);

        balanceOf[msg.sender] -= amountSushiBar;
        unchecked {
            totalSupply -= amountSushiBar;
        }

        claimedAmountSushi = IERC20(_sushi).balanceOf(address(this));
        _claimedRewardsOf[msg.sender] += claimedAmountSushi;

        IERC20(_sushi).safeTransfer(beneficiary, claimedAmountSushi);
    }
}
