// SPDX-License-Identifier: WTFPL

pragma solidity ^0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "./interfaces/IFSushi.sol";
import "./libraries/DateUtils.sol";

contract FSushi is Ownable, ERC20, IFSushi {
    uint256 public immutable override startTime;

    mapping(uint256 => uint256) public override totalSupplyAt;
    uint256 public override lastCheckpoint;

    constructor() ERC20("Flash Sushi Token", "fSUSHI") {
        uint256 nextWeek = DateUtils.startOfWeek(block.timestamp) + WEEK;
        startTime = nextWeek;
        lastCheckpoint = nextWeek;
    }

    function mint(address to, uint256 amount) external onlyOwner {
        checkpoint();

        _mint(to, amount);
    }

    /**
     * @dev if this function doesn't get called for 512 weeks (around 9.8 years) this contract breaks
     */
    function checkpoint() public {
        uint256 _totalSupply = totalSupply();

        uint256 time = lastCheckpoint + WEEK;
        // inclusive
        uint256 until = DateUtils.startOfWeek(block.timestamp);

        for (uint256 i; i < 512; ) {
            if (time > until) break;

            totalSupplyAt[time] = _totalSupply;

            time += WEEK;
            unchecked {
                ++i;
            }
        }

        lastCheckpoint = until;
    }
}
