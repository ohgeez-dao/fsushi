// SPDX-License-Identifier: WTFPL

pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IStakedLPToken is IERC20 {
    event Stake(uint256 amount, address indexed beneficiary, address indexed from);
    event Unstake(uint256 amount, address indexed beneficiary, address indexed from);
    event ClaimSushi(uint256 amount, address indexed beneficiary);

    function initialize(uint256 _pid) external;

    function factory() external view returns (address);

    function masterChef() external view returns (address);

    function sushi() external view returns (address);

    function pid() external view returns (uint256);

    function lpToken() external view returns (address);

    function token0() external view returns (address);

    function token1() external view returns (address);

    function claimableTotalSushi() external view returns (uint256);

    function claimableSushiOf(address account) external view returns (uint256);

    function approveMax() external;

    function stake(uint256 amount, address beneficiary) external;

    function stakeSigned(
        uint256 amount,
        address beneficiary,
        address from,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    function unstake(
        uint256 amount,
        uint256 amountSushiDesired,
        address beneficiary
    ) external;

    function claimSushi(address beneficiary) external returns (uint256 amountSushiClaimed);

    function claimSushi(uint256 amountSushiDesired, address beneficiary) external returns (uint256 amountSushiClaimed);
}
