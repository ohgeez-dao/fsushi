// SPDX-License-Identifier: WTFPL

pragma solidity ^0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "./interfaces/IFSushi.sol";
import "./libraries/DateUtils.sol";

contract FSushi is Ownable, ERC20, IFSushi {
    using DateUtils for uint256;

    uint256 public immutable override startWeek;

    /**
     * @return minimum number of minted total supply during the whole week
     */
    mapping(uint256 => uint256) public override totalSupplyDuring;
    /**
     * @notice totalSupplyDuring is guaranteed to be correct before this week
     */
    uint256 public override lastCheckpoint;

    constructor() ERC20("Flash Sushi Token", "fSUSHI") {
        uint256 nextWeek = block.timestamp.toWeekNumber() + 1;
        startWeek = nextWeek;
        lastCheckpoint = nextWeek;
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);

        checkpoint();
    }

    function checkpointedTotalSupplyDuring(uint256 week) external override returns (uint256) {
        checkpoint();
        return totalSupplyDuring[week];
    }

    /**
     * @dev if this function doesn't get called for 512 weeks (around 9.8 years) this contract breaks
     */
    function checkpoint() public {
        uint256 from = lastCheckpoint;
        uint256 until = block.timestamp.toWeekNumber();

        for (uint256 i; i < 512; ) {
            uint256 week = from + i;
            if (week == until) {
                uint256 prev = totalSupplyDuring[week];
                uint256 current = totalSupply();
                if (current > prev) {
                    totalSupplyDuring[week] = current;
                }
                break;
            }
            if (startWeek < week) {
                totalSupplyDuring[week] = totalSupplyDuring[week - 1];
            }

            unchecked {
                ++i;
            }
        }

        lastCheckpoint = until;
    }
}
