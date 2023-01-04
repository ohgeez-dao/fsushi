// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "./interfaces/IFSushiBar.sol";
import "./interfaces/IFSushi.sol";
import "./libraries/WeightedPriorityQueue.sol";
import "./libraries/DateUtils.sol";

/**
 * @notice FSushiBar is an extension of ERC4626 with the addition of vesting period for locks
 */
contract FSushiBar is ERC4626, IFSushiBar {
    using WeightedPriorityQueue for WeightedPriorityQueue.Heap;
    using Math for uint256;
    using DateUtils for uint256;

    uint256 internal constant MINIMUM_WEEKS = 1;
    uint256 internal constant MAXIMUM_WEEKS = 104; // almost 2 years

    uint256 public immutable override startWeek;

    /**
     * @notice timestamp when users lastly deposited
     */
    mapping(address => uint256) public override lastDeposit; // timestamp

    mapping(address => WeightedPriorityQueue.Heap) internal _locks;

    /**
     * @dev this is guaranteed to be correct up until the last week
     * @return minimum number of staked total assets during the whole week
     */
    mapping(uint256 => uint256) public override lockedTotalBalanceDuring;
    /**
     * @notice lockedTotalBalanceDuring is guaranteed to be correct before this week
     */
    uint256 public override lastCheckpoint; // week
    /**
     * @dev this is guaranteed to be correct up until the last week
     * @return minimum number of staked assets of account during the whole week
     */
    mapping(address => mapping(uint256 => uint256)) public override lockedUserBalanceDuring;
    /**
     * @notice lockedUserBalanceDuring is guaranteed to be correct before this week (exclusive)
     */
    mapping(address => uint256) public override lastUserCheckpoint; // week

    constructor(address fSushi) ERC4626(IERC20(fSushi)) ERC20("Flash SushiBar", "xfSUSHI") {
        uint256 nextWeek = block.timestamp.toWeekNumber() + 1;
        startWeek = nextWeek;
        lastCheckpoint = nextWeek;
    }

    modifier validWeeks(uint256 _weeks) {
        if (_weeks < MINIMUM_WEEKS || _weeks > MAXIMUM_WEEKS) revert InvalidDuration();
        _;
    }

    function maxWithdraw(address owner) public view override(ERC4626, IERC4626) returns (uint256) {
        return _convertToAssets(maxRedeem(owner), Math.Rounding.Down);
    }

    function maxRedeem(address owner) public view override(ERC4626, IERC4626) returns (uint256) {
        return _locks[owner].enqueuedWeightedAmount(block.timestamp);
    }

    function previewDeposit(uint256 assets) public view override(ERC4626, IERC4626) returns (uint256) {
        return previewDeposit(assets, MINIMUM_WEEKS);
    }

    function previewDeposit(uint256 assets, uint256 _weeks) public view override validWeeks(_weeks) returns (uint256) {
        return _convertToShares(assets.mulDiv(_weeks, MAXIMUM_WEEKS), Math.Rounding.Down);
    }

    function previewMint(uint256 shares) public view override(ERC4626, IERC4626) returns (uint256) {
        return previewMint(shares, MINIMUM_WEEKS);
    }

    function previewMint(uint256 shares, uint256 _weeks) public view override validWeeks(_weeks) returns (uint256) {
        return _convertToAssets(shares.mulDiv(MAXIMUM_WEEKS, _weeks), Math.Rounding.Up);
    }

    function checkpointedLockedTotalBalanceDuring(uint256 week) external override returns (uint256) {
        checkpoint();
        return lockedTotalBalanceDuring[week];
    }

    function checkpointedLockedUserBalanceDuring(address account, uint256 week) external override returns (uint256) {
        checkpoint();
        return lockedUserBalanceDuring[account][week];
    }

    /**
     * @dev if this function doesn't get called for 512 weeks (around 9.8 years) this contract breaks
     */
    function checkpoint() public override {
        uint256 from = lastCheckpoint;
        uint256 until = block.timestamp.toWeekNumber();
        if (until <= from) return;

        for (uint256 i; i < 512; ) {
            uint256 week = from + i;
            if (until <= week) break;

            lockedTotalBalanceDuring[week + 1] = lockedTotalBalanceDuring[week];

            unchecked {
                ++i;
            }
        }

        lastCheckpoint = until;
    }

    /**
     * @dev if this function doesn't get called for 512 weeks (around 9.8 years) this contract breaks
     */
    function userCheckpoint(address account) public override {
        checkpoint();

        uint256 from = lastUserCheckpoint[account];
        if (from == 0) {
            from = startWeek;
        }
        uint256 until = block.timestamp.toWeekNumber();
        if (until <= from) return;

        for (uint256 i; i < 512; ) {
            uint256 week = from + i;
            if (until <= week) break;

            lockedUserBalanceDuring[account][week + 1] = lockedUserBalanceDuring[account][week];

            unchecked {
                ++i;
            }
        }

        lastUserCheckpoint[account] = until;
    }

    function depositSigned(
        uint256 assets,
        address receiver,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external override returns (uint256) {
        return depositSigned(assets, MINIMUM_WEEKS, receiver, deadline, v, r, s);
    }

    function depositSigned(
        uint256 assets,
        uint256 _weeks,
        address receiver,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public override returns (uint256) {
        IFSushi(asset()).permit(msg.sender, address(this), assets, deadline, v, r, s);

        return deposit(assets, _weeks, receiver);
    }

    function mintSigned(
        uint256 shares,
        address receiver,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external override returns (uint256) {
        return mintSigned(shares, MINIMUM_WEEKS, receiver, deadline, v, r, s);
    }

    function mintSigned(
        uint256 shares,
        uint256 _weeks,
        address receiver,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public override returns (uint256) {
        IFSushi(asset()).permit(msg.sender, address(this), previewMint(shares), deadline, v, r, s);

        return mint(shares, _weeks, receiver);
    }

    function deposit(uint256 assets, address receiver) public override(ERC4626, IERC4626) returns (uint256) {
        return deposit(assets, MINIMUM_WEEKS, receiver);
    }

    function deposit(
        uint256 assets,
        uint256 _weeks,
        address receiver
    ) public override validWeeks(_weeks) returns (uint256) {
        require(assets <= maxDeposit(receiver), "ERC4626: deposit more than max");

        uint256 shares = previewDeposit(assets, _weeks);
        _deposit(msg.sender, receiver, assets, shares);
        _locks[msg.sender].enqueue(block.timestamp + _weeks * (1 weeks), assets, _weeks);

        return shares;
    }

    function mint(uint256 shares, address receiver) public override(ERC4626, IERC4626) returns (uint256) {
        return mint(shares, MINIMUM_WEEKS, receiver);
    }

    function mint(
        uint256 shares,
        uint256 _weeks,
        address receiver
    ) public override validWeeks(_weeks) returns (uint256) {
        require(shares <= maxMint(receiver), "ERC4626: mint more than max");

        uint256 assets = previewMint(shares, _weeks);
        _deposit(msg.sender, receiver, assets, shares);
        _locks[msg.sender].enqueue(block.timestamp + _weeks * (1 weeks), assets, _weeks);

        return assets;
    }

    function _deposit(
        address caller,
        address receiver,
        uint256 assets,
        uint256 shares
    ) internal override {
        super._deposit(caller, receiver, assets, shares);

        userCheckpoint(msg.sender);

        uint256 week = block.timestamp.toWeekNumber();
        lockedTotalBalanceDuring[week] += assets;
        lockedUserBalanceDuring[msg.sender][week] += assets;
        lastDeposit[caller] = block.timestamp;
    }

    function withdraw(
        uint256 assets,
        address receiver,
        address owner
    ) public override(ERC4626, IERC4626) returns (uint256) {
        uint256 shares = super.withdraw(assets, receiver, owner);
        _locks[owner].dequeueMany(block.timestamp, shares);

        return shares;
    }

    function redeem(
        uint256 shares,
        address receiver,
        address owner
    ) public override(ERC4626, IERC4626) returns (uint256) {
        uint256 assets = super.redeem(shares, receiver, owner);
        _locks[owner].dequeueMany(block.timestamp, shares);

        return assets;
    }

    function _withdraw(
        address caller,
        address receiver,
        address owner,
        uint256 assets,
        uint256 shares
    ) internal override {
        super._withdraw(caller, receiver, owner, assets, shares);

        userCheckpoint(msg.sender);

        uint256 week = block.timestamp.toWeekNumber();
        lockedTotalBalanceDuring[week] -= assets;
        lockedUserBalanceDuring[msg.sender][week] -= assets;
    }
}
