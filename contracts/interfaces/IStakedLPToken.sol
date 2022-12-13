// SPDX-License-Identifier: WTFPL

pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IStakedLPToken is IERC20 {
    event Stake(uint256 amount, uint256 amountLP, address indexed beneficiary);
    event Unstake(uint256 amount, uint256 amountLP, address indexed beneficiary);
    event ClaimSushi(uint256 amount, address indexed beneficiary);

    function initialize(
        address _router,
        address _masterChef,
        uint256 _pid
    ) external;

    function factory() external view returns (address);

    function router() external view returns (address);

    function masterChef() external view returns (address);

    function sushi() external view returns (address);

    function pid() external view returns (uint256);

    function lpToken() external view returns (address);

    function token0() external view returns (address);

    function token1() external view returns (address);

    function stakedTotalSushi() external view returns (uint256);

    function stakedSushiOf(address account) external view returns (uint256);

    function claimableTotalSushi() external view returns (uint256);

    function claimableSushiOf(address account) external view returns (uint256);

    function approveMax() external;

    function stake(
        uint256 amount,
        address[] calldata path0,
        address[] calldata path1,
        uint256 deadline,
        uint256 amountLPMin,
        address beneficiary
    ) external;

    function unstake(uint256 amount, address beneficiary) external;

    function checkpoint() external;
}
