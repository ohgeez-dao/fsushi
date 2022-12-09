// SPDX-License-Identifier: WTFPL

pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";
import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Pair.sol";
import "./interfaces/IStakedLPToken.sol";
import "./interfaces/IStakedLPTokenFactory.sol";
import "./interfaces/IMasterChef.sol";
import "./interfaces/IStakedLPTokenStrategy.sol";
import "./base/BaseERC20.sol";

contract StakedLPToken is BaseERC20, IStakedLPToken {
    using SafeERC20 for IERC20;
    using SafeCast for uint256;
    using SafeCast for int256;

    error InsufficientSushi();

    uint128 internal constant POINTS_MULTIPLIER = type(uint128).max;

    address public override factory;
    address public override masterChef;
    uint256 public override pid;
    address public override sushi;
    address public override lpToken;
    address public override token0;
    address public override token1;

    uint256 internal _pointsPerShare;
    mapping(address => int256) internal _pointsCorrection;
    mapping(address => uint256) public _claimedSharesOf;

    function initialize(uint256 _pid) external override initializer {
        factory = msg.sender;
        address _masterChef = IStakedLPTokenFactory(factory).masterChef();
        (address _lpToken, , , ) = IMasterChef(_masterChef).poolInfo(_pid);
        address _token0 = IUniswapV2Pair(_lpToken).token0();
        address _token1 = IUniswapV2Pair(_lpToken).token1();
        masterChef = _masterChef;
        pid = _pid;
        sushi = IMasterChef(_masterChef).sushi();
        lpToken = _lpToken;
        token0 = _token0;
        token1 = _token1;

        BaseERC20_initialize(
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
     * @dev Returns the total amount of rewards if every holder wants to claim at once
     * @return A uint256 representing the total rewards
     */
    function claimableTotalSushi() external view override returns (uint256) {
        address strategy = IStakedLPTokenFactory(factory).strategy();
        uint256 pendingSushi = IMasterChef(masterChef).pendingSushi(pid, address(this));
        return pendingSushi + IStakedLPTokenStrategy(strategy).claimableRewardsOf(address(this));
    }

    /**
     * @dev Returns the amount of rewards a given address is able to claim.
     * @param account Address of a reward recipient
     * @return A uint256 representing the rewards `account` can claim
     */
    function claimableSushiOf(address account) external view override returns (uint256) {
        address strategy = IStakedLPTokenFactory(factory).strategy();
        return IStakedLPTokenStrategy(strategy).toAssets((_claimableSharesOf(account, true)));
    }

    function _claimableSharesOf(address account, bool pending) internal view returns (uint256) {
        return _cumulativeSharesOf(account, pending) - _claimedSharesOf[account];
    }

    /**
     * @notice View the amount of rewards that an address has earned in total.
     * @dev cumulativeSharesOf(account) = claimableSharesOf(account) + claimedSharesOf(account)
     *  = (pointsPerShare * balanceOf(account) + pointsCorrection[account]) / POINTS_MULTIPLIER
     * @param account The address of a token holder.
     * @return The amount of rewards that `account` has earned in total.
     */
    function _cumulativeSharesOf(address account, bool pending) internal view returns (uint256) {
        uint256 pointsPerShare = _pointsPerShare;
        if (pending) {
            uint256 pendingSushi = IMasterChef(masterChef).pendingSushi(pid, address(this));
            address strategy = IStakedLPTokenFactory(factory).strategy();
            if (totalSupply > 0) {
                pointsPerShare +=
                    (IStakedLPTokenStrategy(strategy).toShares(pendingSushi) * POINTS_MULTIPLIER) /
                    totalSupply;
            }
        }
        return
            ((pointsPerShare * balanceOf[account]).toInt256() + _pointsCorrection[account]).toUint256() /
            POINTS_MULTIPLIER;
    }

    function approveMax() public override {
        IERC20(lpToken).approve(masterChef, type(uint256).max);
        IERC20(sushi).approve(IStakedLPTokenFactory(factory).strategy(), type(uint256).max);
    }

    function stake(uint256 amount, address beneficiary) external override {
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
    ) external override {
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

        uint256 balanceSushi = IERC20(sushi).balanceOf(address(this));
        if (balanceSushi > 0) {
            _depositSushi(balanceSushi);
        }

        _mint(beneficiary, amount);

        emit Stake(amount, beneficiary, from);
    }

    function unstake(
        uint256 amount,
        uint256 amountSushiDesired,
        address beneficiary
    ) external override {
        IMasterChef(masterChef).withdraw(pid, amount);
        IERC20(lpToken).safeTransfer(beneficiary, amount);

        _claimSushi(amountSushiDesired, beneficiary);

        _burn(msg.sender, amount);

        emit Unstake(amount, beneficiary, msg.sender);
    }

    function claimSushi(address beneficiary) external override returns (uint256 amountClaimed) {
        return claimSushi(type(uint256).max, beneficiary);
    }

    function claimSushi(uint256 amountSushiDesired, address beneficiary)
        public
        override
        returns (uint256 amountClaimed)
    {
        IMasterChef(masterChef).deposit(pid, 0);

        return _claimSushi(amountSushiDesired, beneficiary);
    }

    function _claimSushi(uint256 amountSushiDesired, address beneficiary) internal returns (uint256 amountClaimed) {
        uint256 balanceSushi = IERC20(sushi).balanceOf(address(this));
        if (balanceSushi > 0) {
            _depositSushi(balanceSushi);
        }

        if (amountSushiDesired > 0) {
            address strategy = IStakedLPTokenFactory(factory).strategy();
            uint256 claimableShares = _claimableSharesOf(msg.sender, false);
            uint256 claimableSushi = IStakedLPTokenStrategy(strategy).toAssets(claimableShares);
            if (claimableSushi == 0) revert InsufficientSushi();

            uint256 shares = amountSushiDesired == type(uint256).max
                ? claimableShares
                : (amountSushiDesired * claimableShares) / claimableSushi;
            if (shares > claimableShares) revert InsufficientSushi();

            _claimedSharesOf[msg.sender] += shares;

            amountClaimed = IStakedLPTokenStrategy(strategy).withdraw(shares, address(this));
            IERC20(sushi).safeTransfer(beneficiary, amountClaimed);

            emit ClaimSushi(amountClaimed, beneficiary);
        }
    }

    function _depositSushi(uint256 amountSushi) internal {
        address strategy = IStakedLPTokenFactory(factory).strategy();
        uint256 amountShares = IStakedLPTokenStrategy(strategy).deposit(amountSushi, address(this));
        if (totalSupply > 0) {
            _pointsPerShare += (amountShares * POINTS_MULTIPLIER) / totalSupply;
        }
    }

    function _transfer(
        address from,
        address to,
        uint256 amount
    ) internal override {
        super._transfer(from, to, amount);
        int256 _magCorrection = (_pointsPerShare * amount).toInt256();
        _pointsCorrection[from] += _magCorrection;
        _pointsCorrection[to] += _magCorrection;
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
        _pointsCorrection[account] += amount * int256(_pointsPerShare);
    }
}
