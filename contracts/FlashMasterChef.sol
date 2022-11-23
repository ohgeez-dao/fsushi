// SPDX-License-Identifier: WTFPL

pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Router01.sol";
import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Pair.sol";
import "./interfaces/IFlashStrategy.sol";
import "./interfaces/IFlashFToken.sol";
import "./interfaces/IMasterChef.sol";
import "./libraries/RouterUtils.sol";

contract FlashMasterChef is IFlashStrategy, ReentrancyGuard {
    using SafeERC20 for IERC20;

    error UnsupportedPair();
    error Forbidden();
    error InvalidFlashProtocol();
    error InvalidVault();
    error InvalidRouter();
    error InsufficientAmount();
    error InsufficientTotalSupply();

    /**
     * @notice address of FlashProtocol
     */
    address public immutable flashProtocol;
    /**
     * @notice fee in bps
     */
    uint256 public immutable feeBPS;
    /**
     * @notice fee vault
     */
    address public immutable vault;
    /**
     * @notice address of UniswapV2Factory
     */
    address public immutable router;
    /**
     * @notice address of MasterChef
     */
    address public immutable masterChef;
    /**
     * @notice pool ID
     */
    uint256 public immutable pid;
    /**
     * @notice address of Wrapped ETH
     */
    address public immutable weth;
    /**
     * @notice address of LP Token that principal is one of two tokens (the other must be weth)
     */
    address public immutable lpToken;

    address internal immutable _sushi;
    address internal immutable _principal;
    uint256 internal _balancePrincipal;

    /**
     * @notice address of fERC20 for this strategy
     */
    address public fToken;

    constructor(
        address _flashProtocol,
        uint256 _feeBPS,
        address _vault,
        address _router,
        address _masterChef,
        uint256 _pid
    ) {
        if (_flashProtocol == address(0)) revert InvalidFlashProtocol();
        if (_vault == address(0)) revert InvalidVault();
        if (_router == address(0)) revert InvalidRouter();

        address _weth = IUniswapV2Router01(_router).WETH();
        (address _lpToken, , , ) = IMasterChef(_masterChef).poolInfo(_pid);
        address token0 = IUniswapV2Pair(_lpToken).token0();
        address token1 = IUniswapV2Pair(_lpToken).token1();
        if (token0 != _weth && token1 != _weth) revert UnsupportedPair();

        flashProtocol = _flashProtocol;
        feeBPS = _feeBPS;
        vault = _vault;
        router = _router;
        masterChef = _masterChef;
        pid = _pid;
        weth = _weth;
        lpToken = _lpToken;
        _sushi = IMasterChef(_masterChef).sushi();
        _principal = token1 == _weth ? token0 : token1;
    }

    modifier onlyAuthorised() {
        if (msg.sender != flashProtocol && msg.sender != address(this)) revert Forbidden();
        _;
    }

    /**
     * @dev called by flashProtocol
     */
    function setFTokenAddress(address _fTokenAddress) external override {
        if (msg.sender != flashProtocol) revert Forbidden();
        fToken = _fTokenAddress;
    }

    /**
     * @return amount of principal tokens that are currently deposited
     */
    function getPrincipalBalance() external view override returns (uint256) {
        return _balancePrincipal;
    }

    /**
     * @return amount of yield tokens that can be rewarded
     */
    function getYieldBalance() public view override returns (uint256) {
        uint256 balanceSushi = IERC20(_sushi).balanceOf(address(this));
        uint256 amountSushi = IMasterChef(masterChef).pendingSushi(pid, address(this));
        return RouterUtils.quote(router, weth, _sushi, _principal, (balanceSushi + amountSushi));
    }

    /**
     * @return address of LP Token
     */
    function getPrincipalAddress() external view override returns (address) {
        return _principal;
    }

    /**
     * @dev called by flashProtocol
     * @return amountFToken how many fTokens should be minted for a given _amount and _duration (in seconds)
     */
    function quoteMintFToken(uint256 _amount, uint256 _duration) external pure override returns (uint256 amountFToken) {
        // 1 ERC20 for 365 DAYS = 1 fERC20
        // 1 second = 0.000000031709792000
        uint256 amountToMint = (_amount * (_duration * 31709792000)) / (10**18);

        if (amountToMint == 0) revert InsufficientAmount();

        return amountToMint;
    }

    /**
     * @return amountPrincipal how many principal tokens should be returned if _amount fERC20 tokens are burned
     */
    function quoteBurnFToken(uint256 _amount) public view override returns (uint256 amountPrincipal) {
        // TODO: burn lp and then calculate amount of principal
        uint256 totalSupply = IERC20(fToken).totalSupply();
        if (totalSupply == 0) revert InsufficientTotalSupply();

        if (_amount > totalSupply) {
            _amount = totalSupply;
        }

        return (getYieldBalance() * _amount) / totalSupply;
    }

    function getMaxStakeDuration() external pure override returns (uint256) {
        return 4 * 365 days;
    }

    /**
     * @notice This function will be called whenever a user stakes via the Flash Protocol.
     * @dev The Strategy owner can choose to implement a fee but the resulting "locked" principal the user should expect
     *  after the stake has ended must be returned.
     */
    function depositPrincipal(uint256 _amount) external override onlyAuthorised returns (uint256) {
        _balancePrincipal += _amount;

        uint256 amountLP = RouterUtils.mintLPTokens(router, weth, _principal, _amount);

        IERC20(lpToken).approve(masterChef, amountLP);
        IMasterChef(masterChef).deposit(pid, amountLP);

        return _amount;
    }

    /**
     * @notice This function should withdraw principal from the underlying strategy.
     */
    function withdrawPrincipal(uint256 _amount) external override onlyAuthorised {
        (uint256 amountLPTotal, ) = IMasterChef(masterChef).userInfo(pid, address(this));
        uint256 amountLP = (_amount * amountLPTotal) / _balancePrincipal;
        IMasterChef(masterChef).withdraw(pid, amountLP);

        uint256 balanceSushi = IERC20(_sushi).balanceOf(address(this));
        uint256 amountSushi = (_amount * balanceSushi) / _balancePrincipal;
        uint256 amountPrincipal = RouterUtils.swap(router, weth, _sushi, _principal, amountSushi);

        IERC20(_principal).safeTransfer(msg.sender, _amount + amountPrincipal);
        _balancePrincipal -= _amount;
    }

    /**
     * @notice This is the function the user will be calling when performing a FlashBurn.
     * @dev It is responsible for burning the fToken supplied by the user and returning yield to the user.
     */
    function burnFToken(
        uint256 _amount,
        uint256 _minimumReturned,
        address _yieldTo
    ) external override nonReentrant returns (uint256) {
        (uint256 amountLPTotal, ) = IMasterChef(masterChef).userInfo(pid, address(this));
        uint256 amountLP = (_amount * amountLPTotal) / _balancePrincipal;
        IMasterChef(masterChef).withdraw(pid, amountLP);

        // TODO: check if it's correct
        uint256 amountPrincipal = RouterUtils.burnLPTokens(router, weth, _principal, amountLP);
        if (amountPrincipal < _minimumReturned || amountPrincipal == 0) revert InsufficientAmount();

        IFlashFToken(fToken).burnFrom(msg.sender, _amount);

        uint256 fee = (amountPrincipal * feeBPS) / 10000;
        if (fee > 0) IERC20(_principal).safeTransfer(vault, fee);
        IERC20(_principal).safeTransfer(_yieldTo, amountPrincipal - fee);

        emit BurnedFToken(msg.sender, _amount, amountPrincipal);

        return amountPrincipal;
    }
}
