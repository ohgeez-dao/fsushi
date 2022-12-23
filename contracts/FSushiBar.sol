// SPDX-License-Identifier: WTFPL

pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import "./interfaces/IFSushiBar.sol";
import "./libraries/DateUtils.sol";

contract FSushiBar is ERC4626, IFSushiBar {
    using DateUtils for uint256;

    struct Checkpoint {
        uint256 amount;
        uint256 timestamp;
    }

    uint256 public immutable override startWeek;

    /**
     * @return minimum number of staked total assets during the whole week
     */
    mapping(uint256 => uint256) public override minimumTotalAssetsDuring;
    /**
     * @notice minimumTotalAssetsDuring is guaranteed to be correct before this week
     */
    uint256 public override lastCheckpoint; // week

    constructor(address fSushi) ERC4626(IERC20(fSushi)) ERC20("Flash SushiBar", "xfSUSHI") {
        uint256 nextWeek = block.timestamp.toWeekNumber() + 1;
        startWeek = nextWeek;
        lastCheckpoint = nextWeek;
    }

    function checkpointedMinimumTotalAssetsDuring(uint256 week) external override returns (uint256) {
        checkpoint();
        return minimumTotalAssetsDuring[week];
    }

    /**
     * @dev if this function doesn't get called for 512 weeks (around 9.8 years) this contract breaks
     */
    function checkpoint() public override {
        uint256 from = lastCheckpoint;
        uint256 until = block.timestamp.toWeekNumber();

        for (uint256 i; i < 512; ) {
            uint256 week = from + i;
            if (week == until) {
                uint256 prev = minimumTotalAssetsDuring[week];
                uint256 current = totalAssets();
                if (prev == 0 || current < prev) {
                    minimumTotalAssetsDuring[week] = current;
                }
                break;
            }
            if (startWeek < week) {
                minimumTotalAssetsDuring[week] = minimumTotalAssetsDuring[week - 1];
            }

            unchecked {
                ++i;
            }
        }

        lastCheckpoint = until;
    }

    function _deposit(
        address caller,
        address receiver,
        uint256 assets,
        uint256 shares
    ) internal override {
        super._deposit(caller, receiver, assets, shares);

        checkpoint();
    }

    /**
     * @dev Withdraw/redeem common workflow.
     */
    function _withdraw(
        address caller,
        address receiver,
        address owner,
        uint256 assets,
        uint256 shares
    ) internal override {
        super._withdraw(caller, receiver, owner, assets, shares);

        checkpoint();
    }
}
