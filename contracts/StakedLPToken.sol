// SPDX-License-Identifier: WTFPL

pragma solidity ^0.8.17;

import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Pair.sol";
import "./interfaces/IStakedLPTokenFactory.sol";
import "./interfaces/IMasterChef.sol";
import "./base/BaseERC20.sol";

contract StakedLPToken is BaseERC20 {
    address public factory;
    address public masterChef;
    address public lpToken;
    address public token0;
    address public token1;

    function initialize(uint256 pid) external initializer {
        factory = msg.sender;
        address _masterChef = IStakedLPTokenFactory(factory).masterChef();
        (address _lpToken, , , ) = IMasterChef(_masterChef).poolInfo(pid);
        address _token0 = IUniswapV2Pair(_lpToken).token0();
        address _token1 = IUniswapV2Pair(_lpToken).token1();
        masterChef = _masterChef;
        lpToken = _lpToken;
        token0 = _token0;
        token1 = _token1;

        ERC20Permit_initialize(
            string.concat("Staked LP Token: ", IERC20Metadata(_token0).name(), "-", IERC20Metadata(_token1).name()),
            string.concat("SLP:", IERC20Metadata(_token0).symbol(), "-", IERC20Metadata(_token1).symbol()),
            "1"
        );
    }
}
