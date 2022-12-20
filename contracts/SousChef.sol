// SPDX-License-Identifier: WTFPL

pragma solidity ^0.8.17;

import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/ISousChef.sol";
import "./interfaces/ISousChefFactory.sol";
import "./interfaces/IFlashFToken.sol";
import "./interfaces/IStakedLPTokenFactory.sol";
import "./interfaces/IStakedLPToken.sol";
import "./interfaces/IFeeVault.sol";

contract SousChef is Initializable, ReentrancyGuard, ISousChef {
    using SafeERC20 for IERC20;

    error Forbidden();
    error InvalidFlashProtocol();
    error InvalidVault();
    error AmountTooLow();
    error InsufficientYield();
    error InsufficientTotalSupply();

    address public override factory;

    /**
     * @notice address of FlashProtocol
     */
    address public override flashProtocol;

    /**
     * @notice address of SUSHI token
     */
    address public override sushi;
    /**
     * @notice address of StakedLPToken
     */
    address public override slpToken;

    uint256 internal _balancePrincipal;

    /**
     * @notice address of fERC20 for this strategy
     */
    address public override fToken;

    function initialize(
        address _flashProtocol,
        address _slpTokenFactory,
        uint256 _pid
    ) external override initializer {
        if (_flashProtocol == address(0)) revert InvalidFlashProtocol();

        address _slpToken = IStakedLPTokenFactory(_slpTokenFactory).getStakedLPToken(_pid);
        if (_slpToken == address(0)) _slpToken = IStakedLPTokenFactory(_slpTokenFactory).createStakedLPToken(_pid);

        factory = msg.sender;
        flashProtocol = _flashProtocol;
        sushi = IStakedLPToken(_slpToken).sushi();
        slpToken = _slpToken;
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
        return IStakedLPToken(slpToken).withdrawableYieldOf(address(this));
    }

    /**
     * @return address of LP Token
     */
    function getPrincipalAddress() external view override returns (address) {
        return slpToken;
    }

    /**
     * @dev called by flashProtocol
     * @return amountFToken how many fTokens should be minted for a given _amount and _duration (in seconds)
     */
    function quoteMintFToken(uint256 _amount, uint256 _duration) external pure override returns (uint256 amountFToken) {
        // 1 fToken per 1 year
        uint256 amountToMint = (_amount * _duration) / 365 days;

        if (amountToMint == 0) revert AmountTooLow();

        return amountToMint;
    }

    /**
     * @return how many SLP rewards should be returned if _amount fERC20 tokens are burned
     */
    function quoteBurnFToken(uint256 _amount) public view override returns (uint256) {
        uint256 totalSupply = IERC20(fToken).totalSupply();
        if (totalSupply == 0) revert InsufficientTotalSupply();

        if (_amount > totalSupply) {
            _amount = totalSupply;
        }

        return (getYieldBalance() * _amount) / totalSupply;
    }

    function getMaxStakeDuration() public pure override returns (uint256) {
        return 4 * 365 days;
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
        address _slpToken = slpToken;
        IStakedLPToken(_slpToken).checkpoint();

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
        uint256 yield = quoteBurnFToken(_amount);
        if (yield == 0 || yield < _minimumReturned) revert InsufficientYield();

        IFlashFToken(fToken).burnFrom(msg.sender, _amount);

        address _slpToken = slpToken;
        IStakedLPToken(_slpToken).unstake(yield, address(this));

        address lpToken = IStakedLPToken(_slpToken).lpToken();
        uint256 balanceLPToken = IERC20(lpToken).balanceOf(address(this));
        _transfer(lpToken, _yieldTo, balanceLPToken);

        address _sushi = sushi;
        uint256 balanceSushi = IERC20(_sushi).balanceOf(address(this));
        _transfer(_sushi, _yieldTo, balanceSushi);

        emit BurnedFToken(msg.sender, _amount, yield);

        return yield;
    }

    function _transfer(
        address token,
        address to,
        uint256 amount
    ) internal {
        address feeRecipient = ISousChefFactory(factory).feeRecipient();
        uint256 fee = (amount * ISousChefFactory(factory).flashStakeFeeBPS()) / 10000;
        IERC20(token).safeTransfer(to, amount - fee);

        IERC20(token).safeTransfer(feeRecipient, fee);
        if (feeRecipient.code.length > 0) {
            try IFeeVault(feeRecipient).checkpoint(token) {} catch {}
        }
    }
}