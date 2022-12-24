// SPDX-License-Identifier: BSL-1.1

pragma solidity ^0.8.17;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IAccruedLPTokenFactory.sol";
import "./AccruedLPToken.sol";

contract AccruedLPTokenFactory is Ownable, IAccruedLPTokenFactory {
    address public immutable override router;
    address public immutable override masterChef;
    address internal immutable _implementation;

    address public override yieldVault;
    mapping(uint256 => address) public override getAccruedLPToken;

    constructor(
        address _router,
        address _masterChef,
        address _yieldVault
    ) {
        router = _router;
        masterChef = _masterChef;
        yieldVault = _yieldVault;
        AccruedLPToken token = new AccruedLPToken();
        _implementation = address(token);
    }

    function predictAccruedLPTokenAddress(uint256 pid) external view override returns (address token) {
        token = Clones.predictDeterministicAddress(_implementation, bytes32(pid));
    }

    function updateYieldVault(address vault) external override onlyOwner {
        if (vault == address(0)) revert InvalidAddress();
        yieldVault = vault;

        emit UpdateVault(vault);
    }

    function createAccruedLPToken(uint256 pid) external override returns (address token) {
        if (getAccruedLPToken[pid] != address(0)) revert TokenCreated();

        token = Clones.cloneDeterministic(_implementation, bytes32(pid));
        AccruedLPToken(token).initialize(router, masterChef, pid);

        getAccruedLPToken[pid] = token;

        emit CreateAccruedLPToken(pid, token);
    }
}
