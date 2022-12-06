// SPDX-License-Identifier: WTFPL

pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";
import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Pair.sol";
import "./interfaces/IStakedLPTokenFactory.sol";
import "./interfaces/IMasterChef.sol";
import "./interfaces/ISushiBar.sol";
import "./base/BaseERC20.sol";

contract StakedLPToken is BaseERC20 {
    using SafeERC20 for IERC20;
    using SafeCast for uint256;
    using SafeCast for int256;

    event Stake(uint256 amount, address beneficiary, address from);
    event Unstake(uint256 amount, address beneficiary, address from);
    event ClaimSushi(uint256 amountSushiBar, uint256 amountSushi, address beneficiary);

    uint128 internal constant POINTS_MULTIPLIER = type(uint128).max;

    address public factory;
    address public masterChef;
    address public sushi;
    address public sushiBar;
    uint256 public pid;
    address public lpToken;
    address public token0;
    address public token1;

    uint256 public balanceSushiBar;
    uint256 public pointsPerShare;
    mapping(address => int256) public pointsCorrection;
    mapping(address => uint256) public claimedSushiBarOf;

    function initialize(uint256 _pid) external initializer {
        factory = msg.sender;
        address _masterChef = IStakedLPTokenFactory(factory).masterChef();
        (address _lpToken, , , ) = IMasterChef(_masterChef).poolInfo(_pid);
        address _token0 = IUniswapV2Pair(_lpToken).token0();
        address _token1 = IUniswapV2Pair(_lpToken).token1();
        masterChef = _masterChef;
        sushi = IMasterChef(_masterChef).sushi();
        sushiBar = IStakedLPTokenFactory(factory).sushiBar();
        pid = _pid;
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

    function claimableSushiOf(address account) external view returns (uint256) {
        return _toAmountSushi(_claimableSushiBarOf(account, true));
    }

    function _toAmountSushi(uint256 amountSushiBar) internal view returns (uint256) {
        address _sushiBar = sushiBar;
        uint256 totalSushiBar = ISushiBar(_sushiBar).totalSupply();
        if (totalSushiBar == 0) return amountSushiBar;
        return (IERC20(sushi).balanceOf(address(_sushiBar)) * amountSushiBar) / totalSushiBar;
    }

    /**
     * @dev Returns the total amount of rewards a given address is able to claim.
     * @param account Address of a reward recipient
     * @return A uint256 representing the rewards `account` can claim
     */
    function claimableSushiBarOf(address account) external view returns (uint256) {
        return _claimableSushiBarOf(account, true);
    }

    function _claimableSushiBarOf(address account, bool pending) internal view returns (uint256) {
        return _cumulativeSushiBarOf(account, pending) - claimedSushiBarOf[account];
    }

    /**
     * @notice View the amount of rewards that an address has earned in total.
     * @dev cumulativeSushiBarOf(account) = claimableSushiBarOf(account) + claimedSushiBarOf(account)
     *  = (pointsPerShare * balanceOf(account) + pointsCorrection[account]) / POINTS_MULTIPLIER
     * @param account The address of a token holder.
     * @return The amount of rewards that `account` has earned in total.
     */
    function cumulativeSushiBarOf(address account) external view returns (uint256) {
        return _cumulativeSushiBarOf(account, true);
    }

    function _cumulativeSushiBarOf(address account, bool pending) internal view returns (uint256) {
        uint256 _pointsPerShare = pointsPerShare;
        if (pending) {
            uint256 pendingSushi = IMasterChef(masterChef).pendingSushi(pid, address(this));
            _pointsPerShare += (_toAmountSushiBar(pendingSushi) * POINTS_MULTIPLIER) / totalSupply;
        }
        return
            ((_pointsPerShare * balanceOf[account]).toInt256() + pointsCorrection[account]).toUint256() /
            POINTS_MULTIPLIER;
    }

    function _toAmountSushiBar(uint256 amountSushi) internal view returns (uint256) {
        address _sushiBar = sushiBar;
        uint256 totalSushiBar = ISushiBar(_sushiBar).totalSupply();
        uint256 balance = IERC20(sushi).balanceOf(_sushiBar);
        if (totalSushiBar == 0 || balance == 0) return amountSushi;
        return (amountSushi * totalSushiBar) / balance;
    }

    function approveMax() public {
        IERC20(lpToken).approve(masterChef, type(uint256).max);
        IERC20(sushi).approve(sushiBar, type(uint256).max);
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

        _claimSushi(beneficiary, from);
        _mint(beneficiary, amount);

        emit Stake(amount, beneficiary, from);
    }

    function unstake(uint256 amount, address beneficiary) external {
        IMasterChef(masterChef).withdraw(pid, amount);
        IERC20(lpToken).safeTransfer(beneficiary, amount);

        _claimSushi(beneficiary, msg.sender);
        _burn(msg.sender, amount);

        emit Unstake(amount, beneficiary, msg.sender);
    }

    function claimSushi(address beneficiary) external {
        IMasterChef(masterChef).deposit(pid, 0);

        _claimSushi(beneficiary, msg.sender);
    }

    function _claimSushi(address beneficiary, address from) internal {
        (address _sushiBar, address _sushi) = (sushiBar, sushi);
        ISushiBar(_sushiBar).enter(IERC20(_sushi).balanceOf(address(this)));

        uint256 balance = IERC20(_sushiBar).balanceOf(address(this));
        uint256 amountSushiBar = balance - balanceSushiBar;
        if (amountSushiBar > 0) {
            pointsPerShare += (amountSushiBar * POINTS_MULTIPLIER) / totalSupply;
        }

        uint256 claimableSushiBar = _claimableSushiBarOf(from, false);
        balanceSushiBar = balance - claimableSushiBar;
        if (claimableSushiBar > 0) {
            claimedSushiBarOf[from] += claimableSushiBar;

            ISushiBar(_sushiBar).leave(claimableSushiBar);

            uint256 amountSushi = IERC20(_sushi).balanceOf(address(this));
            IERC20(_sushi).safeTransfer(beneficiary, amountSushi);

            emit ClaimSushi(claimableSushiBar, amountSushi, beneficiary);
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
