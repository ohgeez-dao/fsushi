// SPDX-License-Identifier: BSL-1.1

pragma solidity ^0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "./interfaces/ISousChef.sol";
import "./interfaces/IFSushiVault.sol";
import "./interfaces/IFSushiKitchen.sol";
import "./interfaces/IFSushi.sol";
import "./interfaces/IFlashStrategySushiSwapFactory.sol";
import "./interfaces/IFlashStrategySushiSwap.sol";
import "./libraries/DateUtils.sol";

contract SousChef is Ownable, ISousChef {
    using SafeERC20 for IERC20;
    using SafeCast for uint256;
    using SafeCast for int256;
    using DateUtils for uint256;

    uint256 internal constant TOKENLESS_PRODUCTION = 40;

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
     * @notice address of IFSushiKitchen
     */
    address public override kitchen;

    /**
     * @notice how much rewards to be minted at the week
     */
    mapping(uint256 => uint256) public override weeklyRewards; // week => amount
    /**
     * @notice weeklyRewards is guaranteed to be correct before this week
     */
    uint256 internal _lastCheckpoint; // week

    mapping(uint256 => uint256) public override totalSupply; // pid => amount
    mapping(uint256 => uint256) public override workingSupply; // pid => amount
    /**
     * @notice points = ∫W(t)dt, where W(t) is the working supply at the week
     */
    mapping(uint256 => mapping(uint256 => uint256)) public override points; // pid => week => points
    /**
     * @notice points of pid is guaranteed to be correct before this time's week start
     */
    mapping(uint256 => uint256) public override lastCheckpoint; // pid => timestamp

    mapping(uint256 => mapping(address => uint256)) public override balanceOf; // pid => account => amount
    mapping(uint256 => mapping(address => uint256)) public override workingBalanceOf; // pid => account => amount
    /**
     * @notice userPoints = ∫w(t)dt, where a(t) is the working balance of account at the week
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
        address _kitchen,
        address _flashStrategyFactory
    ) {
        fSushi = _fSushi;
        vault = _vault;
        kitchen = _kitchen;
        flashStrategyFactory = _flashStrategyFactory;
        uint256 week = block.timestamp.toWeekNumber() + 1;
        startWeek = week;
        _lastCheckpoint = week;
        weeklyRewards[week] = REWARDS_FOR_INITIAL_WEEK;
    }

    function updateFSushiVault(address _fSushiVault) external override onlyOwner {
        if (_fSushiVault == address(0)) revert InvalidFSushiVault();

        vault = _fSushiVault;

        emit UpdateFSushiVault(_fSushiVault);
    }

    function updateFSushiKitchen(address _fSushiKitchen) external override onlyOwner {
        if (_fSushiKitchen == address(0)) revert InvalidFSushiKitchen();

        kitchen = _fSushiKitchen;

        emit UpdateFSushiKitchen(_fSushiKitchen);
    }

    function deposit(
        uint256 pid,
        uint256 amount,
        address beneficiary
    ) external override {
        if (block.timestamp.toWeekNumber() < startWeek) revert TooEarly();

        address strategy = IFlashStrategySushiSwapFactory(flashStrategyFactory).getFlashStrategySushiSwap(pid);
        if (strategy == address(0)) revert InvalidPid();

        if (amount > 0) {
            address fToken = IFlashStrategySushiSwap(strategy).fToken();
            IERC20(fToken).safeTransferFrom(msg.sender, address(this), amount);

            _userCheckpoint(pid, msg.sender);

            uint256 _balance = balanceOf[pid][msg.sender] + amount;
            balanceOf[pid][msg.sender] = _balance;
            uint256 _totalSupply = totalSupply[pid] + amount;
            totalSupply[pid] = _totalSupply;

            _updateWorkingBalance(pid, msg.sender, _balance, _totalSupply);

            IFSushi(fSushi).mint(beneficiary, amount);
        }

        emit Deposit(pid, amount, beneficiary);
    }

    function withdraw(
        uint256 pid,
        uint256 amount,
        address beneficiary
    ) external override {
        address strategy = IFlashStrategySushiSwapFactory(flashStrategyFactory).getFlashStrategySushiSwap(pid);
        if (strategy == address(0)) revert InvalidPid();

        if (amount > 0) {
            uint256 _balance = balanceOf[pid][msg.sender] - amount;
            balanceOf[pid][msg.sender] = _balance;
            uint256 _totalSupply = totalSupply[pid] - amount;
            totalSupply[pid] = _totalSupply;

            _updateWorkingBalance(pid, msg.sender, _balance, _totalSupply);

            address fToken = IFlashStrategySushiSwap(strategy).fToken();
            IERC20(fToken).safeTransfer(beneficiary, amount);
        }

        emit Withdraw(pid, amount, beneficiary);
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
            uint256 circulatingSupply = IFSushi(fSushi).checkpointedTotalSupplyDuring(week - 1) -
                IFSushiVault(vault).checkpointedLockedTotalBalanceDuring(week - 1);
            // emission rate decreases 1% every week
            uint256 rewards = (circulatingSupply * 99) / 100;
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
        _updatePoints(points[pid], workingSupply[pid], prevCheckpoint);
        if (prevCheckpoint < block.timestamp) {
            lastCheckpoint[pid] = block.timestamp;
        }

        emit Checkpoint(pid);
    }

    function userCheckpoint(uint256 pid, address account) external override {
        _userCheckpoint(pid, account);
        _updateWorkingBalance(pid, account, balanceOf[pid][account], totalSupply[pid]);
    }

    function _userCheckpoint(uint256 pid, address account) internal {
        checkpoint(pid);

        uint256 prevCheckpoint = userLastCheckpoint[pid][account];
        _updatePoints(userPoints[pid][account], workingBalanceOf[pid][account], prevCheckpoint);
        if (prevCheckpoint < block.timestamp) {
            userLastCheckpoint[pid][account] = block.timestamp;
        }

        emit UserCheckpoint(pid, account);
    }

    function _updatePoints(
        mapping(uint256 => uint256) storage _points,
        uint256 workingBalance,
        uint256 lastTime
    ) internal {
        if (workingBalance == 0) return;

        if (lastTime == 0) {
            lastTime = startWeek.toTimestamp();
        }

        uint256 from = lastTime.toWeekNumber();
        for (uint256 i; i < 512; ) {
            uint256 week = from + i;
            uint256 weekStart = week.toTimestamp();
            uint256 weekEnd = weekStart + WEEK;
            if (block.timestamp <= weekStart) break;
            if (block.timestamp < weekEnd) {
                _points[week] += workingBalance * (block.timestamp - Math.max(lastTime, weekStart));
                break;
            }
            if (i == 0) {
                _points[week] += workingBalance * (weekEnd - lastTime);
            } else {
                _points[week] += workingBalance * WEEK;
            }

            unchecked {
                ++i;
            }
        }
    }

    function _updateWorkingBalance(
        uint256 pid,
        address account,
        uint256 balance,
        uint256 supply
    ) internal {
        address _vault = vault;
        IFSushiVault(_vault).userCheckpoint(account);

        uint256 week = block.timestamp.toWeekNumber();
        uint256 lockedBalance = IFSushiVault(_vault).lockedUserBalanceDuring(account, week - 1);
        uint256 lockedTotal = IFSushiVault(_vault).lockedTotalBalanceDuring(week - 1);

        uint256 workingBalance = (balance * TOKENLESS_PRODUCTION) / 100;
        if (lockedTotal > 0) {
            workingBalance += (((supply * lockedBalance) / lockedTotal) * (100 - TOKENLESS_PRODUCTION)) / 100;
        }

        workingBalance = Math.min(workingBalance, balance);

        uint256 prevBalance = workingBalanceOf[pid][account];
        workingBalanceOf[pid][account] = workingBalance;

        uint256 _workingSupply = workingSupply[pid] + workingBalance - prevBalance;
        workingSupply[pid] = _workingSupply;

        emit UpdateWorkingBalance(pid, account, workingBalance, _workingSupply);
    }

    function claimRewards(uint256 pid, address beneficiary) external {
        _userCheckpoint(pid, msg.sender);

        uint256 prevWeek = nextClaimableWeek[pid][msg.sender];
        if (prevWeek == block.timestamp) return;
        if (prevWeek == 0) {
            prevWeek = startWeek.toTimestamp();
        }

        address _kitchen = kitchen;
        IFSushiKitchen(_kitchen).checkpoint(pid);

        // add week-by-week rewards until the last week
        uint256 totalRewards;
        uint256 from = prevWeek.toWeekNumber();
        uint256 to = block.timestamp.toWeekNumber(); // exclusive last index
        for (uint256 i; i < 512; ) {
            uint256 week = from + i;
            if (to <= week) break;
            uint256 weight = IFSushiKitchen(_kitchen).relativeWeightAt(pid, week.toTimestamp());
            uint256 rewards = (weeklyRewards[week] * weight * userPoints[pid][msg.sender][week]) /
                points[pid][week] /
                1e18;
            totalRewards += rewards;

            unchecked {
                ++i;
            }
        }
        nextClaimableWeek[pid][msg.sender] = to;

        if (totalRewards > 0) {
            claimedRewards[pid][msg.sender] += totalRewards;
            IFSushi(fSushi).mint(beneficiary, totalRewards);

            emit ClaimRewards(pid, msg.sender, beneficiary, totalRewards);
        }
    }
}
