// SPDX-License-Identifier: BSL-1.1

pragma solidity ^0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "./interfaces/ISousChef.sol";
import "./interfaces/IFSushiVault.sol";
import "./interfaces/IFSushiController.sol";
import "./interfaces/IFSushi.sol";
import "./interfaces/IFlashStrategySushiSwapFactory.sol";
import "./interfaces/IFlashStrategySushiSwap.sol";
import "./libraries/DateUtils.sol";

contract SousChef is Ownable, ISousChef {
    using SafeERC20 for IERC20;
    using SafeCast for uint256;
    using SafeCast for int256;
    using DateUtils for uint256;

    struct Checkpoint_ {
        uint256 amount;
        uint256 timestamp;
    }

    uint256 public constant override BONUS_MULTIPLIER = 10;
    uint256 public constant override REWARDS_FOR_INITIAL_WEEK = BONUS_MULTIPLIER * 30000e18;

    address public immutable override fSushi;
    address public immutable override flashStrategyFactory;
    uint256 public immutable override startWeek;

    /**
     * @notice address of IFSushiVault
     */
    address public override vault;

    /**
     * @notice address of IFSushiController
     */
    address public override controller;

    /**
     * @notice how much rewards to be minted at the week
     */
    mapping(uint256 => uint256) public override weeklyRewards; // week => amount
    /**
     * @notice weeklyRewards is guaranteed to be correct before this week
     */
    uint256 internal _lastCheckpoint; // week

    /**
     * @notice new Checkpoint gets appended whenever any deposit/withdraw happens
     */
    mapping(uint256 => Checkpoint_[]) public override checkpoints; // pid => checkpoints
    /**
     * @notice points = ∫A(t)dt, where A(t) is the amount staked at time t
     */
    mapping(uint256 => mapping(uint256 => uint256)) public override points; // pid => week => points
    /**
     * @notice points of pid is guaranteed to be correct before this time's week start
     */
    mapping(uint256 => uint256) public override lastCheckpoint; // pid => timestamp

    /**
     * @notice new Checkpoint gets appended whenever any deposit/withdraw happens from account
     */
    mapping(uint256 => mapping(address => Checkpoint_[])) public override userCheckpoints; // pid => account => checkpoints
    /**
     * @notice points = ∫A(t)dt, where A(t) is the amount staked at time t
     */
    mapping(uint256 => mapping(address => mapping(uint256 => uint256))) public override userPoints; // pid => account => week => points
    /**
     * @notice userPoints of account is guaranteed to be correct before this week
     */
    mapping(uint256 => mapping(address => uint256)) public override userLastCheckpoint; // pid => account => timestamp
    /**
     * @notice how much rewards were claimed in total for account in pid
     */
    mapping(uint256 => mapping(address => uint256)) public override claimedRewards; // pid => account => amount
    /**
     * @notice in the next claim, rewards will be accumulated from this week
     */
    mapping(uint256 => mapping(address => uint256)) public override nextClaimableWeek; // pid => account => week

    constructor(
        address _fSushi,
        address _vault,
        address _controller,
        address _flashStrategyFactory
    ) {
        fSushi = _fSushi;
        vault = _vault;
        controller = _controller;
        flashStrategyFactory = _flashStrategyFactory;
        uint256 week = block.timestamp.toWeekNumber() + 1;
        startWeek = week;
        _lastCheckpoint = week;
        weeklyRewards[week] = REWARDS_FOR_INITIAL_WEEK;
    }

    function checkpointsLength(uint256 pid) external view override returns (uint256) {
        return checkpoints[pid].length;
    }

    function userCheckpointsLength(uint256 pid, address account) external view override returns (uint256) {
        return userCheckpoints[pid][account].length;
    }

    function updateFSushiVault(address _fSushiVault) external override onlyOwner {
        if (_fSushiVault == address(0)) revert InvalidFSushiVault();

        vault = _fSushiVault;

        emit UpdateFSushiVault(_fSushiVault);
    }

    function updateFSushiController(address _fSushiController) external override onlyOwner {
        if (_fSushiController == address(0)) revert InvalidFSushiController();

        controller = _fSushiController;

        emit UpdateFSushiController(_fSushiController);
    }

    function deposit(
        uint256 pid,
        uint256 amount,
        address beneficiary
    ) external override {
        if (block.timestamp.toWeekNumber() < startWeek) revert TooEarly();

        address strategy = IFlashStrategySushiSwapFactory(flashStrategyFactory).getFlashStrategySushiSwap(pid);
        if (strategy == address(0)) revert InvalidPid();

        address fToken = IFlashStrategySushiSwap(strategy).fToken();
        IERC20(fToken).safeTransferFrom(msg.sender, address(this), amount);

        _appendCheckpoint(checkpoints[pid], amount.toInt256());
        _appendCheckpoint(userCheckpoints[pid][msg.sender], amount.toInt256());

        userCheckpoint(pid, msg.sender);

        IFSushi(fSushi).mint(beneficiary, amount);

        emit Deposit(pid, amount, beneficiary);
    }

    function withdraw(
        uint256 pid,
        uint256 amount,
        address beneficiary
    ) external override {
        address strategy = IFlashStrategySushiSwapFactory(flashStrategyFactory).getFlashStrategySushiSwap(pid);
        if (strategy == address(0)) revert InvalidPid();

        _appendCheckpoint(checkpoints[pid], -amount.toInt256());
        _appendCheckpoint(userCheckpoints[pid][beneficiary], -amount.toInt256());

        userCheckpoint(pid, msg.sender);

        address fToken = IFlashStrategySushiSwap(strategy).fToken();
        IERC20(fToken).safeTransfer(beneficiary, amount);

        emit Withdraw(pid, amount, beneficiary);
    }

    function _appendCheckpoint(Checkpoint_[] storage _checkpoints, int256 amount)
        internal
        returns (Checkpoint_ memory last)
    {
        last = _getCheckpointAt(_checkpoints, -1);
        Checkpoint_ memory newCheckpoint = Checkpoint_(
            last.amount + (amount < 0 ? -amount : amount).toUint256(),
            block.timestamp
        );
        _checkpoints.push(newCheckpoint);
    }

    /**
     * @dev if this function doesn't get called for 512 weeks (around 9.8 years) this contract breaks
     */
    function checkpoint(uint256 pid) public override {
        uint256 from = _lastCheckpoint + 1;
        uint256 until = block.timestamp.toWeekNumber();
        for (uint256 i; i < 512; ) {
            uint256 week = from + i;
            if (until < week) break;
            // last week's circulating supply becomes the total rewards in this week
            // (week is already greater than startWeek)
            uint256 rewards = IFSushi(fSushi).checkpointedTotalSupplyDuring(week - 1) -
                IFSushiVault(vault).checkpointedLockedTotalBalanceDuring(week - 1);
            // 10x bonus is given only for the first week
            if (week == startWeek + 1) {
                rewards /= BONUS_MULTIPLIER;
            }
            weeklyRewards[week] = rewards;

            unchecked {
                ++i;
            }
        }
        _lastCheckpoint = until;

        uint256 prevCheckpoint = lastCheckpoint[pid];
        _updatePoints(checkpoints[pid], points[pid], prevCheckpoint);
        if (prevCheckpoint < block.timestamp) {
            lastCheckpoint[pid] = block.timestamp;
        }

        emit Checkpoint(pid);
    }

    function userCheckpoint(uint256 pid, address account) public override {
        checkpoint(pid);

        uint256 prevCheckpoint = userLastCheckpoint[pid][account];
        _updatePoints(userCheckpoints[pid][account], userPoints[pid][account], prevCheckpoint);
        if (prevCheckpoint < block.timestamp) {
            userLastCheckpoint[pid][account] = block.timestamp;
        }

        emit UserCheckpoint(pid, account);
    }

    function _updatePoints(
        Checkpoint_[] storage _checkpoints,
        mapping(uint256 => uint256) storage _points,
        uint256 lastTime
    ) internal {
        if (_checkpoints.length == 0 || lastTime == block.timestamp) return;
        if (lastTime == 0) {
            lastTime = startWeek.toTimestamp();
        }

        uint256 from = lastTime.toWeekNumber();
        Checkpoint_ memory last = _getCheckpointAt(_checkpoints, -1);
        for (uint256 i; i < 512; ) {
            uint256 week = from + i;
            uint256 weekStart = week.toTimestamp();
            uint256 weekEnd = weekStart + WEEK;
            if (block.timestamp <= weekStart) break;
            if (block.timestamp < weekEnd) {
                _points[week] += last.amount * (block.timestamp - Math.max(last.timestamp, weekStart));
                break;
            }
            if (i == 0) {
                _points[week] += last.amount * (weekEnd - lastTime);
            } else {
                _points[week] += last.amount * WEEK;
            }

            unchecked {
                ++i;
            }
        }
    }

    function claimRewards(uint256 pid, address beneficiary) external {
        userCheckpoint(pid, msg.sender);

        uint256 prevWeek = nextClaimableWeek[pid][msg.sender];
        if (prevWeek == block.timestamp) return;
        if (prevWeek == 0) {
            prevWeek = startWeek.toTimestamp();
        }

        Checkpoint_[] storage _checkpoints = userCheckpoints[pid][msg.sender];
        if (_checkpoints.length == 0) return;

        // add week-by-week rewards until the last week
        uint256 rewards;
        uint256 from = prevWeek.toWeekNumber();
        uint256 to = block.timestamp.toWeekNumber(); // exclusive last index
        for (uint256 i; i < 512; ) {
            uint256 week = from + i;
            if (to <= week) break;
            uint256 weight = IFSushiController(controller).relativeWeightAt(pid, week);
            rewards += (weeklyRewards[week] * weight * userPoints[pid][msg.sender][week]) / points[pid][week] / 1e18;

            unchecked {
                ++i;
            }
        }
        nextClaimableWeek[pid][msg.sender] = to;

        if (rewards > 0) {
            claimedRewards[pid][msg.sender] += rewards;
            IFSushi(fSushi).mint(beneficiary, rewards);

            emit ClaimRewards(pid, msg.sender, beneficiary, rewards);
        }
    }

    function _getCheckpointAt(Checkpoint_[] storage _checkpoints, int256 index)
        internal
        view
        returns (Checkpoint_ memory)
    {
        uint256 length = _checkpoints.length;
        uint256 _index = index < 0 ? (length - (-index).toUint256()) : index.toUint256();
        if (length <= _index) {
            return Checkpoint_(0, startWeek);
        } else {
            return _checkpoints[_index];
        }
    }
}
