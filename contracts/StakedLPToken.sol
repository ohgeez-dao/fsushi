// SPDX-License-Identifier: WTFPL

pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";
import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Pair.sol";
import "./interfaces/IStakedLPTokenFactory.sol";
import "./interfaces/IMasterChef.sol";
import "./base/BaseERC20.sol";

contract StakedLPToken is BaseERC20 {
    using SafeERC20 for IERC20;
    using SafeCast for uint256;
    using SafeCast for int256;

    event Stake(uint256 amount, address beneficiary, address from);
    event Unstake(uint256 amount, address beneficiary, address from);
    event ClaimRewards(uint256 amount, address beneficiary);

    uint128 internal constant POINTS_MULTIPLIER = type(uint128).max;

    address public factory;
    address public masterChef;
    address public sushi;
    uint256 public pid;
    address public lpToken;
    address public token0;
    address public token1;

    uint256 public balanceSushi;
    uint256 public pointsPerShare;
    mapping(address => int256) public pointsCorrection;
    mapping(address => uint256) public claimedRewards;

    function initialize(uint256 _pid) external initializer {
        factory = msg.sender;
        address _masterChef = IStakedLPTokenFactory(factory).masterChef();
        (address _lpToken, , , ) = IMasterChef(_masterChef).poolInfo(_pid);
        address _token0 = IUniswapV2Pair(_lpToken).token0();
        address _token1 = IUniswapV2Pair(_lpToken).token1();
        masterChef = _masterChef;
        sushi = IMasterChef(_masterChef).sushi();
        pid = _pid;
        lpToken = _lpToken;
        token0 = _token0;
        token1 = _token1;

        ERC20Permit_initialize(
            string.concat(
                "Staked LP Token (",
                IERC20Metadata(_token0).name(),
                "-",
                IERC20Metadata(_token1).name(),
                ")"
            ),
            string.concat("SLP:", IERC20Metadata(_token0).symbol(), "-", IERC20Metadata(_token1).symbol()),
            "1"
        );
        approveMax();
    }

    /**
     * @dev Returns the total amount of rewards a given address is able to claim.
     * @param account Address of a reward recipient
     * @return A uint256 representing the rewards `account` can claim
     */
    function claimableRewardsOf(address account) external view returns (uint256) {
        return _claimableRewardsOf(account, true);
    }

    function _claimableRewardsOf(address account, bool pending) internal view returns (uint256) {
        return _cumulativeRewardsOf(account, pending) - claimedRewards[account];
    }

    /**
     * @notice View the amount of rewards that an address has earned in total.
     * @dev cumulativeRewardsOf(account) = claimableRewardsOf(account) + claimnRewardsOf(account)
     *  = (pointsPerShare * balanceOf(account) + pointsCorrection[account]) / POINTS_MULTIPLIER
     * @param account The address of a token holder.
     * @return The amount of rewards that `account` has earned in total.
     */
    function cumulativeRewardsOf(address account) external view returns (uint256) {
        return _cumulativeRewardsOf(account, true);
    }

    function _cumulativeRewardsOf(address account, bool pending) internal view returns (uint256) {
        uint256 _pointsPerShare = pointsPerShare;
        if (pending)
            _pointsPerShare +=
                (IMasterChef(masterChef).pendingSushi(pid, address(this)) * POINTS_MULTIPLIER) /
                totalSupply;
        return
            ((_pointsPerShare * balanceOf[account]).toInt256() + pointsCorrection[account]).toUint256() /
            POINTS_MULTIPLIER;
    }

    function approveMax() public {
        IERC20(lpToken).approve(masterChef, type(uint256).max);
    }

    function stake(uint256 amount, address beneficiary) external {
        _stake(amount, beneficiary, msg.sender);
    }

    function stakeSigned(
        uint256 amount,
        address beneficiary,
        address from,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        IUniswapV2Pair(lpToken).permit(from, address(this), amount, deadline, v, r, s);
        _stake(amount, beneficiary, from);
    }

    function _stake(
        uint256 amount,
        address beneficiary,
        address from
    ) internal {
        IERC20(lpToken).safeTransferFrom(from, address(this), amount);
        IMasterChef(masterChef).deposit(pid, amount);

        _claimRewards(beneficiary, from);
        _mint(beneficiary, amount);

        emit Stake(amount, beneficiary, from);
    }

    function unstake(uint256 amount, address beneficiary) external {
        IMasterChef(masterChef).withdraw(pid, amount);
        IERC20(lpToken).safeTransfer(beneficiary, amount);

        _claimRewards(beneficiary, msg.sender);
        _burn(msg.sender, amount);

        emit Unstake(amount, beneficiary, msg.sender);
    }

    function claimRewards(address beneficiary) external {
        IMasterChef(masterChef).deposit(pid, 0);

        _claimRewards(beneficiary, msg.sender);
    }

    function _claimRewards(address beneficiary, address from) internal {
        uint256 _balance = IERC20(sushi).balanceOf(address(this));
        uint256 amountRewards = _balance - balanceSushi;
        if (amountRewards > 0) {
            pointsPerShare += (amountRewards * POINTS_MULTIPLIER) / totalSupply;
        }

        uint256 claimable = _claimableRewardsOf(from, false);
        balanceSushi = _balance - claimable;
        if (claimable > 0) {
            claimedRewards[from] += claimable;
            IERC20(sushi).safeTransfer(beneficiary, claimable);
            emit ClaimRewards(claimable, beneficiary);
        }
    }

    function _transfer(
        address from,
        address to,
        uint256 amount
    ) internal override {
        super._transfer(from, to, amount);
        int256 _magCorrection = (pointsPerShare * amount).toInt256();
        pointsCorrection[from] += _magCorrection;
        pointsCorrection[to] += _magCorrection;
    }

    function _mint(address account, uint256 amount) internal override {
        super._mint(account, amount);
        _correctPoints(account, -int256(amount));
    }

    function _burn(address account, uint256 amount) internal override {
        super._burn(account, amount);
        _correctPoints(account, int256(amount));
    }

    function _correctPoints(address account, int256 amount) internal {
        pointsCorrection[account] += amount * int256(pointsPerShare);
    }
}
