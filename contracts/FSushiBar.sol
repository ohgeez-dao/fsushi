// SPDX-License-Identifier: WTFPL

pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import "./interfaces/IFSushiBar.sol";
import "./libraries/DateUtils.sol";

contract FSushiBar is ERC4626, IFSushiBar {
    struct Checkpoint {
        uint256 amount;
        uint256 timestamp;
    }

    uint256 public constant override MINIMUM_PERIOD = WEEK;
    uint256 public immutable override startTime;

    mapping(uint256 => uint256) public override totalAssetsAt;
    uint256 public override lastCheckpoint;

    constructor(address fSushi) ERC4626(IERC20(fSushi)) ERC20("Flash SushiBar", "xfSUSHI") {
        uint256 nextWeek = DateUtils.startOfWeek(block.timestamp) + WEEK;
        startTime = nextWeek;
        lastCheckpoint = nextWeek;
    }

    /**
     * @dev if this function doesn't get called for 512 weeks (around 9.8 years) this contract breaks
     */
    function checkpoint() public override {
        uint256 _totalAssets = totalAssets();

        uint256 time = lastCheckpoint + WEEK;
        // inclusive
        uint256 until = DateUtils.startOfWeek(block.timestamp);

        for (uint256 i; i < 512; ) {
            if (time > until) break;

            totalAssetsAt[time] = _totalAssets;

            time += WEEK;
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
        checkpoint();

        super._deposit(caller, receiver, assets, shares);
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
        checkpoint();

        super._withdraw(caller, receiver, owner, assets, shares);
    }
}
