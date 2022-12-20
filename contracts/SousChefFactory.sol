// SPDX-License-Identifier: WTFPL

pragma solidity ^0.8.17;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/ISousChefFactory.sol";
import "./SousChef.sol";

contract SousChefFactory is Ownable, ISousChefFactory {
    uint256 public constant MAX_FEE = 100; // 1%

    /**
     * @notice address of FlashProtocol
     */
    address public immutable override flashProtocol;
    /**
     * @notice address of StakedLPTokenFactory
     */
    address public immutable override slpTokenFactory;

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

    mapping(uint256 => address) public override getSousChef;

    constructor(
        address _flashProtocol,
        address _slpTokenFactory,
        uint256 _stakeFeeBPS,
        uint256 _flashStakeFeeBPS,
        address _feeRecipient
    ) {
        flashProtocol = _flashProtocol;
        slpTokenFactory = _slpTokenFactory;
        updateStakeFeeBPS(_stakeFeeBPS);
        updateFlashStakeFeeBPS(_flashStakeFeeBPS);
        updateFeeRecipient(_feeRecipient);

        SousChef chef = new SousChef();
        _implementation = address(chef);
    }

    function predictSousChefAddress(uint256 pid) external view override returns (address token) {
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

    function createSousChef(uint256 pid) external override returns (address chef) {
        if (getSousChef[pid] != address(0)) revert SousChefCreated();

        chef = Clones.cloneDeterministic(_implementation, bytes32(pid));
        SousChef(chef).initialize(flashProtocol, slpTokenFactory, pid);

        getSousChef[pid] = chef;

        emit CreateSousChef(pid, chef);
    }
}
