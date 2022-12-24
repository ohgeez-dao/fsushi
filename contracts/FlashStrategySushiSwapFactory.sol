// SPDX-License-Identifier: BSL-1.1

pragma solidity ^0.8.17;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IFlashStrategySushiSwapFactory.sol";
import "./FlashStrategySushiSwap.sol";

contract FlashStrategySushiSwapFactory is Ownable, IFlashStrategySushiSwapFactory {
    uint256 public constant MAX_FEE = 100; // 1%

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
     * @notice fee when staking (in bps)
     */
    uint256 public override stakeFeeBPS;
    /**
     * @notice fee when flashStaking (in bps)
     */
    uint256 public override flashStakeFeeBPS;
    /**
     * @notice fee recipient
     */
    address public override feeRecipient;

    mapping(uint256 => address) public override getFlashStrategySushiSwap;

    constructor(
        address _flashProtocol,
        address _alpTokenFactory,
        uint256 _stakeFeeBPS,
        uint256 _flashStakeFeeBPS,
        address _feeRecipient
    ) {
        flashProtocol = _flashProtocol;
        alpTokenFactory = _alpTokenFactory;
        updateStakeFeeBPS(_stakeFeeBPS);
        updateFlashStakeFeeBPS(_flashStakeFeeBPS);
        updateFeeRecipient(_feeRecipient);

        FlashStrategySushiSwap strategy = new FlashStrategySushiSwap();
        _implementation = address(strategy);
    }

    function predictFlashStrategySushiSwapAddress(uint256 pid) external view override returns (address token) {
        token = Clones.predictDeterministicAddress(_implementation, bytes32(pid));
    }

    function updateStakeFeeBPS(uint256 fee) public override onlyOwner {
        if (fee > MAX_FEE) revert InvalidFee();

        stakeFeeBPS = fee;

        emit UpdateStakeFeeBPS(fee);
    }

    function updateFlashStakeFeeBPS(uint256 fee) public override onlyOwner {
        if (fee > MAX_FEE) revert InvalidFee();

        flashStakeFeeBPS = fee;

        emit UpdateFlashStakeFeeBPS(fee);
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
