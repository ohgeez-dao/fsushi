// SPDX-License-Identifier: WTFPL

pragma solidity ^0.8.17;

import "@openzeppelin/contracts/interfaces/IERC4626.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Pair.sol";
import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Router02.sol";
import "./interfaces/IStakedLPToken.sol";
import "./interfaces/IStakedLPTokenFactory.sol";
import "./interfaces/IMasterChef.sol";
import "./libraries/UniswapV2Utils.sol";
import "./base/BaseERC20.sol";

contract StakedLPToken is BaseERC20, ReentrancyGuard, IStakedLPToken {
    using SafeERC20 for IERC20;
    using SafeCast for uint256;
    using SafeCast for int256;

    error InvalidPath();
    error InsufficientYield();
    error InsufficientAmount();

    uint128 internal constant POINTS_MULTIPLIER = type(uint128).max;

    address public override factory;
    address public override router;
    address public override masterChef;
    uint256 public override pid;
    address public override sushi;
    address public override lpToken;
    address public override token0;
    address public override token1;

    uint256 internal _balanceLP;
    uint256 internal _pointsPerShare;
    mapping(address => int256) internal _pointsCorrection;
    mapping(address => uint256) public _claimedYieldSharesOf;

    function initialize(
        address _router,
        address _masterChef,
        uint256 _pid
    ) external override initializer {
        factory = msg.sender;
        (address _lpToken, , , ) = IMasterChef(_masterChef).poolInfo(_pid);
        address _token0 = IUniswapV2Pair(_lpToken).token0();
        address _token1 = IUniswapV2Pair(_lpToken).token1();
        router = _router;
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
     * @return Sum of (shares in SUSHI) + (claimable total SUSHI)
     */
    function totalSupply() public view override(BaseERC20, IERC20) returns (uint256) {
        return totalShares() + claimableTotalYield();
    }

    /**
     * @return Sum of (shares in SUSHI by staked account) + (SUSHI claimable by account)
     */
    function balanceOf(address account) external view override(BaseERC20, IERC20) returns (uint256) {
        return sharesOf(account) + claimableYieldOf(account);
    }

    /**
     * @return total shares in SUSHI currently being staked
     */
    function totalShares() public view override returns (uint256) {
        return _totalSupply;
    }

    /**
     * @return shares in SUSHI currently being staked by account
     */
    function sharesOf(address account) public view override returns (uint256) {
        return _balanceOf[account];
    }

    /**
     * @dev Returns the total amount of SUSHI if every holder wants to claim at once
     * @return A uint256 representing the total SUSHI
     */
    function claimableTotalYield() public view override returns (uint256) {
        address yieldVault = IStakedLPTokenFactory(factory).yieldVault();
        uint256 pendingSushi = IMasterChef(masterChef).pendingSushi(pid, address(this));
        return pendingSushi + IERC4626(yieldVault).convertToAssets(IERC4626(yieldVault).balanceOf(address(this)));
    }

    /**
     * @dev Returns the amount of SUSHI a given address is able to claim.
     * @param account Address of a reward recipient
     * @return A uint256 representing the SUSHI `account` can claim
     */
    function claimableYieldOf(address account) public view override returns (uint256) {
        address yieldVault = IStakedLPTokenFactory(factory).yieldVault();
        return IERC4626(yieldVault).convertToAssets((_claimableYieldSharesOf(account, true)));
    }

    /**
     * @dev Shares are used to record reward debt for account. SUSHI will accumulate so we don't record SUSHI amount.
     * @param account Address of a reward recipient
     * @param pending if true, it adds the amount of MasterChef.pendingSushi()
     * @return A uint256 representing the SUSHI `account` can claim
     */
    function _claimableYieldSharesOf(address account, bool pending) internal view returns (uint256) {
        return _cumulativeYieldSharesOf(account, pending) - _claimedYieldSharesOf[account];
    }

    /**
     * @notice View the amount of shares that an address has earned in total.
     * @dev cumulativeYieldSharesOf(account) = claimableYieldSharesOf(account) + claimedYieldSharesOf(account)
     *  = (pointsPerShare * sharesOf(account) + pointsCorrection[account]) / POINTS_MULTIPLIER
     * @param account The address of a token holder.
     * @return The amount of SUSHI that `account` has earned in total.
     */
    function _cumulativeYieldSharesOf(address account, bool pending) internal view returns (uint256) {
        uint256 pointsPerShare = _pointsPerShare;
        if (pending) {
            uint256 pendingSushi = IMasterChef(masterChef).pendingSushi(pid, address(this));
            address yieldVault = IStakedLPTokenFactory(factory).yieldVault();
            uint256 total = totalShares();
            if (total > 0) {
                pointsPerShare += (IERC4626(yieldVault).convertToShares(pendingSushi) * POINTS_MULTIPLIER) / total;
            }
        }
        return
            ((pointsPerShare * sharesOf(account)).toInt256() + _pointsCorrection[account]).toUint256() /
            POINTS_MULTIPLIER;
    }

    function approveMax() public override {
        IERC20(lpToken).approve(masterChef, type(uint256).max);
        IERC20(sushi).approve(IStakedLPTokenFactory(factory).yieldVault(), type(uint256).max);
        IERC20(token0).approve(router, type(uint256).max);
        IERC20(token1).approve(router, type(uint256).max);
    }

    /**
     * @dev amount of sushi that LPs converted to is added to sharesOf(account) and SLP is minted
     *  user signature is needed for IUniswapV2Pair.permit()
     */
    function stakeSigned(
        uint256 amountLP,
        address[] calldata path0,
        address[] calldata path1,
        uint256 amountMin,
        address beneficiary,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external override nonReentrant {
        IUniswapV2Pair(lpToken).permit(msg.sender, address(this), amountLP, deadline, v, r, s);
        _stake(amountLP, path0, path1, amountMin, beneficiary);
    }

    /**
     * @dev amount of sushi that LPs converted to is added to sharesOf(account) and SLP is minted
     */
    function stake(
        uint256 amountLP,
        address[] calldata path0,
        address[] calldata path1,
        uint256 amountMin,
        address beneficiary,
        uint256 deadline
    ) external override nonReentrant {
        if (block.timestamp > deadline) revert Expired();
        _stake(amountLP, path0, path1, amountMin, beneficiary);
    }

    function _stake(
        uint256 amountLP,
        address[] calldata path0,
        address[] calldata path1,
        uint256 amountMin,
        address beneficiary
    ) internal {
        if (path0[0] != token0 || path0[path0.length - 1] != sushi) revert InvalidPath();
        if (path1[0] != token1 || path1[path1.length - 1] != sushi) revert InvalidPath();

        IERC20(lpToken).safeTransferFrom(msg.sender, address(this), amountLP);

        uint256 total = IUniswapV2Pair(lpToken).totalSupply();
        (uint256 reserve0, uint256 reserve1, ) = IUniswapV2Pair(lpToken).getReserves();
        uint256 amount = UniswapV2Utils.quote(router, (reserve0 * amountLP) / total, path0) +
            UniswapV2Utils.quote(router, (reserve1 * amountLP) / total, path1);

        if (amount < amountMin) revert InsufficientAmount();

        IMasterChef(masterChef).deposit(pid, amountLP);
        _depositSushi();

        _mint(beneficiary, amount);

        emit Stake(amount, amountLP, beneficiary);
    }

    /**
     * @dev amount is added to sharesOf(account) and same amount of SLP is minted
     *  provided SUSHI is swapped then added as liquidity which results in LP tokens staked
     */
    function stakeWithSushi(
        uint256 amount,
        address[] calldata path0,
        address[] calldata path1,
        uint256 amountLPMin,
        address beneficiary,
        uint256 deadline
    ) external override {
        if (path0[0] != sushi || path0[path0.length - 1] != token0) revert InvalidPath();
        if (path1[0] != sushi || path1[path1.length - 1] != token1) revert InvalidPath();

        IERC20(sushi).safeTransferFrom(msg.sender, address(this), amount);
        uint256 amountLP = UniswapV2Utils.addLiquidityWithSingleToken(router, amount, path0, path1, deadline);
        if (amountLP < amountLPMin) revert InsufficientAmount();

        IMasterChef(masterChef).deposit(pid, amountLP);
        _depositSushi();

        _mint(beneficiary, amount);
        _balanceLP += amountLP;

        emit Stake(amount, amountLP, beneficiary);
    }

    /**
     * @dev when unstaking, the user's share of LP tokens are returned and pro-rata SUSHI yield is return as well
     */
    function unstake(uint256 amount, address beneficiary) external override nonReentrant {
        uint256 amountLP = (amount * _balanceLP) / totalSupply();
        IMasterChef(masterChef).withdraw(pid, amountLP);
        _claimSushi(amount, beneficiary);

        IERC20(lpToken).safeTransfer(beneficiary, amountLP);

        _burn(msg.sender, amount);
        _balanceLP -= amountLP;

        emit Unstake(amount, amountLP, beneficiary);
    }

    function _claimSushi(uint256 amount, address beneficiary) internal returns (uint256 amountClaimed) {
        _depositSushi();

        uint256 value = (amount * totalShares()) / totalSupply();
        uint256 valueMax = sharesOf(msg.sender);
        if (value > valueMax) revert InsufficientAmount();

        address yieldVault = IStakedLPTokenFactory(factory).yieldVault();
        uint256 claimableShares = _claimableYieldSharesOf(msg.sender, false);
        uint256 claimableYield = IERC4626(yieldVault).convertToAssets(claimableShares);
        if (claimableYield == 0) revert InsufficientYield();

        uint256 shares = (claimableShares * value) / valueMax;
        _claimedYieldSharesOf[msg.sender] += shares;

        amountClaimed = IERC4626(yieldVault).withdraw(
            (claimableYield * value) / valueMax,
            address(this),
            address(this)
        );
        IERC20(sushi).safeTransfer(beneficiary, amountClaimed);

        emit ClaimSushi(amountClaimed, beneficiary);
    }

    /**
     * @dev claims pending SUSHI from MasterChef and add it to the balance
     */
    function checkpoint() external override nonReentrant {
        IMasterChef(masterChef).deposit(pid, 0);
        _depositSushi();
    }

    function _depositSushi() internal {
        uint256 balance = IERC20(sushi).balanceOf(address(this));
        if (balance > 0) {
            address yieldVault = IStakedLPTokenFactory(factory).yieldVault();
            IERC4626(yieldVault).deposit(balance, address(this));

            uint256 total = totalShares();
            if (total > 0) {
                _pointsPerShare += (balance * POINTS_MULTIPLIER) / total;
            }
        }
    }

    function _transfer(
        address from,
        address to,
        uint256 amount
    ) internal override {
        uint256 value = _toValue(amount);
        super._transfer(from, to, value);
        int256 _magCorrection = (_pointsPerShare * value).toInt256();
        _pointsCorrection[from] += _magCorrection;
        _pointsCorrection[to] += _magCorrection;
    }

    function _mint(address account, uint256 amount) internal override {
        super._mint(account, amount);
        _correctPoints(account, -int256(amount));
    }

    function _burn(address account, uint256 amount) internal override {
        uint256 value = _toValue(amount);
        super._burn(account, value);
        _correctPoints(account, int256(value));
    }

    function _correctPoints(address account, int256 amount) internal {
        _pointsCorrection[account] += amount * int256(_pointsPerShare);
    }

    function _toValue(uint256 balance) internal view returns (uint256) {
        return (balance * totalShares()) / totalSupply();
    }
}
