// SPDX-License-Identifier: WTFPL

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
     * @notice how much rewards were allocated in total for account in pid
     */
    mapping(uint256 => mapping(address => uint256)) public override userAllocatedRewards; // pid => account => amount
    /**
     * @notice allocatedRewards of account is guaranteed to be correct before this week
     */
    mapping(uint256 => mapping(address => uint256)) public override userLastCheckpoint; // pid => account => week
    /**
     * @notice how much rewards were claimed in total for account in pid
     */
    mapping(uint256 => mapping(address => uint256)) public override userClaimedRewards; // pid => account => amount

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

    function claimRewards(uint256 pid, address beneficiary) public override {
        userCheckpoint(pid, msg.sender);

        uint256 allocated = userAllocatedRewards[pid][msg.sender];
        uint256 rewards = allocated - userClaimedRewards[pid][msg.sender];
        if (rewards == 0) revert NoClaimableRewards();

        userClaimedRewards[pid][msg.sender] = allocated;

        IFSushi(fSushi).mint(beneficiary, rewards);

        emit ClaimRewards(pid, msg.sender, beneficiary, rewards);
    }

    /**
     * @dev if this function doesn't get called for 512 weeks (around 9.8 years) this contract breaks
     */
    function checkpoint(uint256 pid) public override {
        uint256 from = _lastCheckpoint;
        // exclusive last index
        uint256 until = block.timestamp.toWeekNumber();
        for (uint256 i; i < 512; ) {
            uint256 week = from + i;
            if (until <= week) {
                break;
            }
            uint256 rewards;
            if (week == startWeek) {
                rewards = REWARDS_FOR_INITIAL_WEEK;
            } else {
                address _vault = vault;
                IFSushiVault(_vault).checkpoint();
                // last week's circulating supply becomes the total rewards in this week
                rewards = IFSushi(fSushi).totalSupplyAt(week) - IFSushiVault(_vault).totalAssetsAt(week);
                // 10x bonus is given for the first week
                if (week == startWeek + 1) {
                    rewards /= BONUS_MULTIPLIER;
                }
            }
            weeklyRewards[week] = rewards;

            unchecked {
                ++i;
            }
        }
        _lastCheckpoint = until;

        _updatePoints(pid);

        emit Checkpoint(pid, until);
    }

    function _updatePoints(uint256 pid) internal {
        Checkpoint_[] storage _checkpoints = checkpoints[pid];
        if (_checkpoints.length == 0) {
            lastCheckpoint[pid] = block.timestamp;
            return;
        }

        uint256 lastTime = lastCheckpoint[pid];
        if (lastTime == block.timestamp) return;
        if (_checkpoints.length == 0) {
            lastTime = startWeek.toTimestamp();
        }

        uint256 from = lastTime.toWeekNumber();
        Checkpoint_ memory last = _getCheckpointAt(_checkpoints, -1);
        if (_checkpoints.length == 1) {
            points[pid][from] += (block.timestamp - lastTime) * last.amount;
            lastCheckpoint[pid] = block.timestamp;
            return;
        }

        uint256 amount = _getCheckpointAt(_checkpoints, -2).amount;
        for (uint256 i; i < 512; ) {
            uint256 week = from + i;
            uint256 weekStart = week.toTimestamp();
            uint256 weekEnd = weekStart + WEEK;
            if (block.timestamp <= weekStart) break;
            if (block.timestamp < weekEnd) {
                points[pid][week] += amount * (block.timestamp - Math.max(last.timestamp, weekStart));
                break;
            }
            if (i == 0) {
                points[pid][week] += amount * (weekEnd - lastTime);
            } else {
                points[pid][week] += amount * WEEK;
            }

            unchecked {
                ++i;
            }
        }

        lastCheckpoint[pid] = block.timestamp;
    }

    function userCheckpoint(uint256 pid, address account) public override {
        checkpoint(pid);

        Checkpoint_[] storage _checkpoints = userCheckpoints[pid][account];
        if (_checkpoints.length == 0) return;

        uint256 lastWeek = userLastCheckpoint[pid][account];
        if (lastWeek == block.timestamp) return;
        if (lastWeek == 0) {
            lastWeek = startWeek.toTimestamp();
        }

        uint256 rewards;
        uint256 from = lastWeek.toWeekNumber();
        // exclusive last index
        uint256 to = block.timestamp.toWeekNumber();
        Checkpoint_ memory last = _getCheckpointAt(_checkpoints, -1);
        for (uint256 i; i < 512; ) {
            uint256 week = from + i;
            if (to <= week) break;
            uint256 userPoints;
            if (i == 0) {
                userPoints = last.amount * ((week + 1).toTimestamp() - last.timestamp);
                if (_checkpoints.length >= 2) {
                    userPoints += _getCheckpointAt(_checkpoints, -2).amount * (last.timestamp - week.toTimestamp());
                }
            } else {
                userPoints = last.amount * WEEK;
            }
            uint256 weight = IFSushiController(controller).relativeWeightAt(pid, week);
            rewards += (weeklyRewards[week] * weight * userPoints) / points[pid][week] / 1e18;

            unchecked {
                ++i;
            }
        }

        userLastCheckpoint[pid][account] = to;
        emit UserCheckpoint(pid, account, to);

        uint256 prev = userAllocatedRewards[pid][account];
        userAllocatedRewards[pid][account] = prev + rewards;
        emit AllocateRewards(pid, account, prev + rewards);
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
