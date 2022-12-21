// SPDX-License-Identifier: WTFPL

pragma solidity ^0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract FSushi is Ownable, ERC20("Flash Sushi Token", "fSUSHI") {
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
