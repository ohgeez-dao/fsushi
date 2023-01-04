// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/interfaces/IERC4626.sol";
import "./IFSushiRestaurant.sol";

interface IFSushiBar is IERC4626, IFSushiRestaurant {
    error InvalidDuration();

    function previewDeposit(uint256 assets, uint256 _weeks) external view returns (uint256);

    function previewMint(uint256 shares, uint256 _weeks) external view returns (uint256);

    function depositSigned(
        uint256 assets,
        address receiver,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external returns (uint256);

    function depositSigned(
        uint256 assets,
        uint256 _weeks,
        address receiver,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external returns (uint256);

    function mintSigned(
        uint256 shares,
        address receiver,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external returns (uint256);

    function mintSigned(
        uint256 shares,
        uint256 _weeks,
        address receiver,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external returns (uint256);

    function deposit(
        uint256 assets,
        uint256 _weeks,
        address receiver
    ) external returns (uint256);

    function mint(
        uint256 shares,
        uint256 _weeks,
        address receiver
    ) external returns (uint256);
}
