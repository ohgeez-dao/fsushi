// SPDX-License-Identifier: WTFPL

pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Router02.sol";

library UniswapV2Utils {
    using SafeERC20 for IERC20;

    error InsufficientAmountLP();

    function addLiquidityWithSingleToken(
        address router,
        uint256 amount,
        address[] memory path0,
        address[] memory path1,
        uint256 deadline
    ) internal returns (uint256 amountLP) {
        (address token0, address token1) = (path0[0], path1[0]);
        uint256[] memory amountsOut0 = IUniswapV2Router02(router).swapExactTokensForTokens(
            amount / 2,
            0,
            path0,
            address(this),
            deadline
        );
        uint256[] memory amountsOut1 = IUniswapV2Router02(router).swapExactTokensForTokens(
            amount / 2,
            0,
            path1,
            address(this),
            deadline
        );

        (, , uint256 _amountLP) = IUniswapV2Router02(router).addLiquidity(
            token0,
            token1,
            amountsOut0[amountsOut0.length - 1],
            amountsOut1[amountsOut1.length - 1],
            0,
            0,
            address(this),
            deadline
        );

        uint256 balance0 = IERC20(token0).balanceOf(address(this));
        if (balance0 > 0) {
            IERC20(token0).safeTransfer(msg.sender, balance0);
        }
        uint256 balance1 = IERC20(token1).balanceOf(address(this));
        if (balance1 > 0) {
            IERC20(token1).safeTransfer(msg.sender, balance1);
        }

        return _amountLP;
    }
}
