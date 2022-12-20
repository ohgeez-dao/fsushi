// SPDX-License-Identifier: WTFPL

pragma solidity ^0.8.0;

interface IFlashMasterChefFactory {
    error InvalidFee();
    error InvalidFeeRecipient();
    error AlreadyCreated();

    event UpdateStakeFeeBPS(uint256 fee);
    event UpdateFlashStakeFeeBPS(uint256 fee);
    event UpdateFeeRecipient(address feeRecipient);
    event CreateFlashMasterChef(uint256 pid, address chef);

    function flashProtocol() external view returns (address);

    function slpTokenFactory() external view returns (address);

    function stakeFeeBPS() external view returns (uint256);

    function flashStakeFeeBPS() external view returns (uint256);

    function feeRecipient() external view returns (address);

    function getFlashMasterChef(uint256 pid) external view returns (address);

    function predictFlashMasterChefAddress(uint256 pid) external view returns (address token);

    function updateStakeFeeBPS(uint256 fee) external;

    function updateFlashStakeFeeBPS(uint256 fee) external;

    function updateFeeRecipient(address _feeRecipient) external;

    function createFlashMasterChef(uint256 pid) external returns (address token);
}
