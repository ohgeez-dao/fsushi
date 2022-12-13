// SPDX-License-Identifier: WTFPL

pragma solidity ^0.8.17;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IStakedLPTokenFactory.sol";
import "./StakedLPToken.sol";

contract StakedLPTokenFactory is Ownable, IStakedLPTokenFactory {
    error InvalidAddress();
    error TokenCreated();

    address public immutable override router;
    address public immutable override masterChef;
    address internal immutable _implementation;

    address public override strategy;
    mapping(uint256 => address) public override tokens;

    constructor(
        address _router,
        address _masterChef,
        address _strategy
    ) {
        router = _router;
        masterChef = _masterChef;
        strategy = _strategy;
        StakedLPToken token = new StakedLPToken();
        _implementation = address(token);
    }

    function predictStakedLPTokenAddress(uint256 pid) external view override returns (address token) {
        token = Clones.predictDeterministicAddress(_implementation, bytes32(pid));
    }

    function updateStrategy(address _strategy) external override onlyOwner {
        if (_strategy == address(0)) revert InvalidAddress();
        strategy = _strategy;
    }

    function createStakedLPToken(uint256 pid) external override returns (address token) {
        if (tokens[pid] != address(0)) revert TokenCreated();

        token = Clones.cloneDeterministic(_implementation, bytes32(pid));
        StakedLPToken(token).initialize(router, masterChef, pid);

        tokens[pid] = token;

        emit CreateStakedLPToken(pid, token);
    }
}
