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
     * @notice address of FarmingLPTokenFactory
     */
    address public immutable override flpTokenFactory;

    address internal immutable _implementation;

    /**
     * @notice fee recipient
     */
    address public override feeRecipient;

    mapping(uint256 => address) public override getFlashStrategySushiSwap;

    constructor(
        address _flashProtocol,
        address _flpTokenFactory,
        address _feeRecipient
    ) {
        flashProtocol = _flashProtocol;
        flpTokenFactory = _flpTokenFactory;
        updateFeeRecipient(_feeRecipient);

        FlashStrategySushiSwap strategy = new FlashStrategySushiSwap();
        strategy.initialize(address(0), address(0));
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

        address flpToken = IFarmingLPTokenFactory(flpTokenFactory).getFarmingLPToken(pid);
        if (flpToken == address(0)) flpToken = IFarmingLPTokenFactory(flpTokenFactory).createFarmingLPToken(pid);

        strategy = Clones.cloneDeterministic(_implementation, bytes32(pid));
        FlashStrategySushiSwap(strategy).initialize(flashProtocol, flpToken);

        getFlashStrategySushiSwap[pid] = strategy;

        emit CreateFlashStrategySushiSwap(pid, strategy);
    }
}
