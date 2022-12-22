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

    struct Checkpoint {
        uint256 amount;
        uint256 timestamp;
    }

    uint256 public constant override BONUS_MULTIPLIER = 10;
    uint256 public constant override INITIAL_REWARDS_IN_WEEK = BONUS_MULTIPLIER * 30000e18;

    address public immutable override fSushi;
    address public immutable override flashStrategyFactory;
    uint256 public immutable override startTime;

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
    mapping(uint256 => uint256) public override rewardsInWeek; // time => amount

    /**
     * @notice how much rewards were allocated in total for account in pid
     */
    mapping(uint256 => mapping(address => uint256)) public override allocatedRewards; // pid => account => amount
    /**
     * @notice how much rewards were claimed in total for account in pid
     */
    mapping(uint256 => mapping(address => uint256)) public override claimedRewards; // pid => account => amount

    /**
     * @notice new Checkpoint gets appended whenever any deposit/withdraw happens
     */
    mapping(uint256 => Checkpoint[]) public override checkpoints; // pid => checkpoints
    /**
     * @notice points = ∫A(t)dt, where A(t) is the amount staked at time t
     */
    mapping(uint256 => mapping(uint256 => uint256)) public override points; // pid => time => points
    /**
     * @notice rewardsInWeek is guaranteed to be correct before this week
     */
    mapping(uint256 => uint256) public override lastCheckpoint; // pid => time

    mapping(uint256 => mapping(address => Checkpoint[])) public override userCheckpoints; // pid => account => checkpoints
    mapping(uint256 => mapping(address => mapping(uint256 => uint256))) public override userPoints; // pid => account => time => checkpoints
    mapping(uint256 => mapping(address => uint256)) public override userLastCheckpoint; // pid => account => time

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
        uint256 weekStart = DateUtils.startOfWeek(block.timestamp);
        startTime = weekStart + DateUtils.WEEK;
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
        if (block.timestamp < startTime) revert TooEarly();

        address strategy = IFlashStrategySushiSwapFactory(flashStrategyFactory).getFlashStrategySushiSwap(pid);
        if (strategy == address(0)) revert InvalidPid();

        address fToken = IFlashStrategySushiSwap(strategy).fToken();
        IERC20(fToken).safeTransferFrom(msg.sender, address(this), amount);

        _update(checkpoints[pid], points[pid], amount.toInt256());
        _update(userCheckpoints[pid][beneficiary], userPoints[pid][beneficiary], amount.toInt256());

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

        _update(checkpoints[pid], points[pid], -amount.toInt256());
        _update(userCheckpoints[pid][beneficiary], userPoints[pid][beneficiary], -amount.toInt256());

        userCheckpoint(pid, msg.sender);

        address fToken = IFlashStrategySushiSwap(strategy).fToken();
        IERC20(fToken).safeTransfer(beneficiary, amount);
    }

    /**
     * @dev if this function doesn't get called for 512 weeks (around 9.8 years) this contract breaks
     */
    function _update(
        Checkpoint[] storage _checkpoints,
        mapping(uint256 => uint256) storage _points,
        int256 amount
    ) internal {
        Checkpoint memory last = _getCheckpointAt(_checkpoints, -1);
        Checkpoint memory newCheckpoint = Checkpoint(
            last.amount + (amount < 0 ? -amount : amount).toUint256(),
            block.timestamp
        );
        _checkpoints.push(newCheckpoint);

        uint256 time = last.timestamp;
        uint256 weekStart = DateUtils.startOfWeek(time);
        for (uint256 i; i < 512; ) {
            if (block.timestamp < weekStart + DateUtils.WEEK) {
                _points[weekStart] += last.amount * (block.timestamp - time);
                break;
            }
            _points[weekStart] += last.amount * (weekStart + DateUtils.WEEK - time);

            time = weekStart + DateUtils.WEEK;
            weekStart = time;
            unchecked {
                ++i;
            }
        }
    }

    function claimRewards(uint256 pid) public override {
        uint256 _lastCheckpoint = userCheckpoint(pid, msg.sender);

        uint256 allocated = allocatedRewards[pid][msg.sender];
        uint256 rewards = allocated - claimedRewards[pid][msg.sender];
        if (rewards == 0) revert NoClaimableRewards();

        claimedRewards[pid][msg.sender] = allocated;

        IFSushi(fSushi).mint(msg.sender, rewards);

        emit ClaimRewards(pid, msg.sender, _lastCheckpoint, rewards);
    }

    /**
     * @dev if this function doesn't get called for 512 weeks (around 9.8 years) this contract breaks
     */
    function checkpoint(uint256 pid) public override returns (uint256 _lastCheckpoint) {
        uint256 time = lastCheckpoint[pid];
        if (time == 0) {
            time = startTime;
        }
        // exclusive
        uint256 until = DateUtils.startOfWeek(_getCheckpointAt(checkpoints[pid], -1).timestamp);
        for (uint256 i; i < 512; ) {
            if (until <= time) {
                break;
            }
            _getRewardsInWeek(time);

            time += DateUtils.WEEK;
            unchecked {
                ++i;
            }
        }
        lastCheckpoint[pid] = until;
        return until;
    }

    function _getRewardsInWeek(uint256 time) internal returns (uint256 rewards) {
        if (time == startTime) {
            return INITIAL_REWARDS_IN_WEEK;
        }

        rewards = rewardsInWeek[time];
        if (rewards == 0) {
            address _vault = vault;
            IFSushiVault(_vault).checkpoint();
            // last week's circulating supply becomes the total rewards in this week
            rewards = IFSushi(fSushi).totalSupplyAt(time) - IFSushiVault(_vault).totalAssetsAt(time);
            // 10x bonus is given for week 1
            if (time == startTime + DateUtils.WEEK) {
                rewards /= BONUS_MULTIPLIER;
            }
            rewardsInWeek[time] = rewards;
        }
    }

    function userCheckpoint(uint256 pid, address account) public override returns (uint256) {
        uint256 _lastCheckpoint = checkpoint(pid);

        uint256 time = userLastCheckpoint[pid][account];
        if (time == 0) {
            time = startTime;
        }
        // exclusive
        uint256 until = Math.min(
            _lastCheckpoint,
            DateUtils.startOfWeek(_getCheckpointAt(userCheckpoints[pid][account], -1).timestamp)
        );
        uint256 rewards;
        for (uint256 i; i < 512; ) {
            if (until <= time) {
                break;
            }
            rewards +=
                (rewardsInWeek[time] *
                    IFSushiController(controller).relativeWeightAt(pid, time) *
                    userPoints[pid][account][time]) /
                points[pid][time] /
                1e18;

            time += DateUtils.WEEK;
            unchecked {
                ++i;
            }
        }
        userLastCheckpoint[pid][account] = until;

        uint256 prev = allocatedRewards[pid][account];
        allocatedRewards[pid][account] = prev + rewards;
        emit AllocateRewards(pid, account, until, prev + rewards);

        return until;
    }

    function _getCheckpointAt(Checkpoint[] storage _checkpoints, int256 index)
        internal
        view
        returns (Checkpoint memory)
    {
        uint256 length = _checkpoints.length;
        uint256 _index = index < 0 ? (length - (-index).toUint256()) : index.toUint256();
        if (length <= _index) {
            return Checkpoint(0, startTime);
        } else {
            return _checkpoints[_index];
        }
    }
}
