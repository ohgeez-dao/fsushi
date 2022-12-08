// SPDX-License-Identifier: WTFPL

pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Router01.sol";
import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Pair.sol";
import "./interfaces/IFlashStrategy.sol";
import "./interfaces/IFlashFToken.sol";
import "./interfaces/IStakedLPTokenFactory.sol";
import "./interfaces/IStakedLPToken.sol";

contract FlashMasterChef is IFlashStrategy, ReentrancyGuard {
    using SafeERC20 for IERC20;

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
     * @notice address of UniswapV2Router
     */
    address public immutable router;
    /**
     * @notice address of Wrapped ETH
     */
    address public immutable weth;
    /**
     * @notice address of StakedLPTokenFactory
     */
    address public immutable factory;

    /**
     * @notice address of SUSHI token
     */
    address internal immutable _sushi;
    /**
     * @notice address of StakedLPToken
     */
    address internal immutable _slpToken;
    /**
     * @notice address of UniswapV2Pair
     */
    address internal immutable _lpToken;
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
        address _factory,
        uint256 _pid
    ) {
        if (_flashProtocol == address(0)) revert InvalidFlashProtocol();
        if (_vault == address(0)) revert InvalidVault();
        if (_router == address(0)) revert InvalidRouter();

        address _weth = IUniswapV2Router01(_router).WETH();
        address slpToken = IStakedLPTokenFactory(_factory).tokens(_pid);
        if (slpToken == address(0)) slpToken = IStakedLPTokenFactory(_factory).createStakedLPToken(_pid);

        flashProtocol = _flashProtocol;
        feeBPS = _feeBPS;
        vault = _vault;
        router = _router;
        weth = _weth;
        factory = _factory;
        _sushi = IStakedLPToken(slpToken).sushi();
        _lpToken = IStakedLPToken(slpToken).lpToken();
        _slpToken = slpToken;

        approveMax();
    }

    modifier onlyAuthorised() {
        if (msg.sender != flashProtocol && msg.sender != address(this)) revert Forbidden();
        _;
    }

    /**
     * @return amount of principal tokens that are currently deposited
     */
    function getPrincipalBalance() external view override returns (uint256) {
        return _balancePrincipal;
    }

    /**
     * @return amount of yield tokens that can be rewarded in SUSHI
     */
    function getYieldBalance() public view override returns (uint256) {
        return IStakedLPToken(_slpToken).claimableTotalSushi();
    }

    /**
     * @return address of LP Token
     */
    function getPrincipalAddress() external view override returns (address) {
        return _slpToken;
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
     * @return amountSushi how many SUSHI rewards should be returned if _amount fERC20 tokens are burned
     */
    function quoteBurnFToken(uint256 _amount) public view override returns (uint256 amountSushi) {
        uint256 totalSupply = IERC20(fToken).totalSupply();
        if (totalSupply == 0) revert InsufficientTotalSupply();

        if (_amount > totalSupply) _amount = totalSupply;

        return (IStakedLPToken(_slpToken).claimableTotalSushi() * _amount) / totalSupply;
    }

    function getMaxStakeDuration() external pure override returns (uint256) {
        return 4 * 365 days;
    }

    function approveMax() public {
        IERC20(_lpToken).approve(_slpToken, type(uint256).max);
    }

    /**
     * @dev called by flashProtocol
     */
    function setFTokenAddress(address _fTokenAddress) external override {
        if (msg.sender != flashProtocol) revert Forbidden();
        fToken = _fTokenAddress;
    }

    /**
     * @notice This function will be called whenever a user stakes via the Flash Protocol.
     * @dev The Strategy owner can choose to implement a fee but the resulting "locked" principal the user should expect
     *  after the stake has ended must be returned.
     */
    function depositPrincipal(uint256 _amount) external override onlyAuthorised returns (uint256) {
        _balancePrincipal += _amount;
        return _amount;
    }

    /**
     * @notice This function should withdraw principal from the underlying strategy.
     */
    function withdrawPrincipal(uint256 _amount) external override onlyAuthorised {
        IERC20(_slpToken).safeTransfer(msg.sender, _amount);
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
        uint256 amountYield = quoteBurnFToken(_amount);
        if (amountYield == 0 || amountYield < _minimumReturned) revert InsufficientAmount();

        IFlashFToken(fToken).burnFrom(msg.sender, _amount);
        IStakedLPToken(_slpToken).unstake(_amount, _yieldTo); // TODO: claim only certain amount of sushi

        emit BurnedFToken(msg.sender, _amount, amountYield);

        return amountYield;
    }
}
