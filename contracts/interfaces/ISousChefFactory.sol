// SPDX-License-Identifier: WTFPL

pragma solidity ^0.8.0;

interface ISousChefFactory {
    error InvalidFee();
    error InvalidFeeRecipient();
    error SousChefCreated();

    event UpdateStakeFeeBPS(uint256 fee);
    event UpdateFlashStakeFeeBPS(uint256 fee);
    event UpdateFeeRecipient(address feeRecipient);
    event CreateSousChef(uint256 pid, address chef);

    function flashProtocol() external view returns (address);

    function alpTokenFactory() external view returns (address);

    function stakeFeeBPS() external view returns (uint256);

    function flashStakeFeeBPS() external view returns (uint256);

    function feeRecipient() external view returns (address);

    function getSousChef(uint256 pid) external view returns (address);

    function predictSousChefAddress(uint256 pid) external view returns (address token);

    function updateStakeFeeBPS(uint256 fee) external;

    function updateFlashStakeFeeBPS(uint256 fee) external;

    function updateFeeRecipient(address _feeRecipient) external;

    function createSousChef(uint256 pid) external returns (address token);
}
