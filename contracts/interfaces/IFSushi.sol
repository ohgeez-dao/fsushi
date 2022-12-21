// SPDX-License-Identifier: WTFPL

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

interface IFSushi is IERC20Metadata {
    function mint(address to, uint256 amount) external;

    function burn(address from, uint256 amount) external;
}
