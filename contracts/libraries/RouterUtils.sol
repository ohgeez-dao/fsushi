// SPDX-License-Identifier: WTFPL

pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Router01.sol";
import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Factory.sol";
import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Pair.sol";

library RouterUtils {
    using SafeERC20 for IERC20;

    error IdenticalAddresses();
    error ZeroAddress();

    function quote(
        address router,
        address weth,
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) internal view returns (uint256 amountOut) {
        address factory = IUniswapV2Router01(router).factory();
        if (tokenIn == weth || tokenOut == weth) {
            (address token0, address token1) = _sortTokens(tokenIn, tokenOut);
            address pair = IUniswapV2Factory(factory).getPair(token0, token1);
            (uint112 reserve0, uint112 reserve1, ) = IUniswapV2Pair(pair).getReserves();
            (uint256 reserveIn, uint256 reserveOut) = token0 == tokenIn ? (reserve0, reserve1) : (reserve1, reserve0);
            return IUniswapV2Router01(router).getAmountOut(amountIn, reserveIn, reserveOut);
        } else {
            address[] memory path = new address[](3);
            path[0] = tokenIn;
            path[1] = weth;
            path[2] = tokenOut;
            uint256[] memory amountsOut = IUniswapV2Router01(router).getAmountsOut(amountIn, path);
            return amountsOut[amountsOut.length - 1];
        }
    }

    function swap(
        address router,
        address weth,
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) internal returns (uint256 amountOut) {
        if (tokenIn == weth) {
            address[] memory path = new address[](2);
            path[0] = weth;
            path[1] = tokenOut;
            return _swap(router, amountIn, path);
        } else if (tokenOut == weth) {
            address[] memory path = new address[](2);
            path[0] = tokenIn;
            path[1] = weth;
            return _swap(router, amountIn, path);
        } else {
            address[] memory path = new address[](3);
            path[0] = tokenIn;
            path[1] = weth;
            path[2] = tokenOut;
            return _swap(router, amountIn, path);
        }
    }

    function mintLPTokens(
        address router,
        address weth,
        address token,
        uint256 amount
    ) internal returns (uint256 amountLP) {
        address[] memory path = new address[](2);
        path[0] = token;
        path[1] = weth;
        uint256 amountWETH = _swap(router, amount / 2, path);

        address factory = IUniswapV2Router01(router).factory();
        address pair = IUniswapV2Factory(factory).getPair(token, weth);
        IERC20(token).safeTransfer(pair, amount / 2);
        IERC20(weth).safeTransfer(pair, amountWETH);
        return IUniswapV2Pair(pair).mint(address(this));
    }

    function burnLPTokens(
        address router,
        address weth,
        address token,
        uint256 amountLP
    ) internal returns (uint256 amount) {
        address factory = IUniswapV2Router01(router).factory();
        address pair = IUniswapV2Factory(factory).getPair(token, weth);
        IUniswapV2Pair(pair).transfer(pair, amountLP);
        (uint256 amount0, uint256 amount1) = IUniswapV2Pair(pair).burn(address(this));
        (address token0, ) = _sortTokens(token, weth);
        (uint256 amountToken, uint256 amountWETH) = token == token0 ? (amount0, amount1) : (amount1, amount0);
        address[] memory path = new address[](2);
        path[0] = weth;
        path[1] = token;
        return amountToken + _swap(router, amountWETH, path);
    }

    function _swap(
        address router,
        uint256 amountIn,
        address[] memory path
    ) private returns (uint256 amountOut) {
        uint256[] memory amounts = IUniswapV2Router01(router).swapExactTokensForTokens(
            amountIn,
            0,
            path,
            address(this),
            block.timestamp
        );
        return amounts[amounts.length - 1];
    }

    function _sortTokens(address tokenA, address tokenB) private pure returns (address token0, address token1) {
        if (tokenA == tokenB) revert IdenticalAddresses();
        (token0, token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        if (token0 == address(0)) revert ZeroAddress();
    }
}
