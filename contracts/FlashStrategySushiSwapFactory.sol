// SPDX-License-Identifier: BSL-1.1

pragma solidity ^0.8.17;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IFlashStrategySushiSwapFactory.sol";
import "./FlashStrategySushiSwap.sol";

contract FlashStrategySushiSwapFactory is Ownable, IFlashStrategySushiSwapFactory {
    /**
     * @notice address of FlashProtocol
     */
    address public immutable override flashProtocol;
    /**
     * @notice address of AccruedLPTokenFactory
     */
    address public immutable override alpTokenFactory;

    address internal immutable _implementation;

    /**
     * @notice fee recipient
     */
    address public override feeRecipient;

    mapping(uint256 => address) public override getFlashStrategySushiSwap;

    constructor(
        address _flashProtocol,
        address _alpTokenFactory,
        address _feeRecipient
    ) {
        flashProtocol = _flashProtocol;
        alpTokenFactory = _alpTokenFactory;
        updateFeeRecipient(_feeRecipient);

        FlashStrategySushiSwap strategy = new FlashStrategySushiSwap();
        _implementation = address(strategy);
    }

    function predictFlashStrategySushiSwapAddress(uint256 pid) external view override returns (address token) {
        token = Clones.predictDeterministicAddress(_implementation, bytes32(pid));
    }

    function updateFeeRecipient(address _feeRecipient) public override onlyOwner {
        if (_feeRecipient == address(0)) revert InvalidFeeRecipient();

        feeRecipient = _feeRecipient;

        emit UpdateFeeRecipient(_feeRecipient);
    }

    function createFlashStrategySushiSwap(uint256 pid) external override returns (address strategy) {
        if (getFlashStrategySushiSwap[pid] != address(0)) revert FlashStrategySushiSwapCreated();

        strategy = Clones.cloneDeterministic(_implementation, bytes32(pid));
        FlashStrategySushiSwap(strategy).initialize(flashProtocol, alpTokenFactory, pid);

        getFlashStrategySushiSwap[pid] = strategy;

        emit CreateFlashStrategySushiSwap(pid, strategy);
    }
}
