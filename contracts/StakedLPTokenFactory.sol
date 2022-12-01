// SPDX-License-Identifier: WTFPL

pragma solidity ^0.8.17;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "./interfaces/IStakedLPTokenFactory.sol";
import "./StakedLPToken.sol";

contract StakedLPTokenFactory is IStakedLPTokenFactory {
    error TokenCreated();

    address public immutable override masterChef;
    address internal immutable implementation;

    mapping(uint256 => address) public tokens;

    constructor(address _masterChef) {
        masterChef = _masterChef;
        StakedLPToken token = new StakedLPToken();
        implementation = address(token);
    }

    function predictStakedLPTokenAddress(uint256 pid) external view override returns (address token) {
        token = Clones.predictDeterministicAddress(implementation, bytes32(pid));
    }

    function createStakedLPToken(uint256 pid) external override returns (address token) {
        if (tokens[pid] != address(0)) revert TokenCreated();

        token = Clones.cloneDeterministic(implementation, bytes32(pid));
        StakedLPToken(token).initialize(pid);

        tokens[pid] = token;

        emit CreateStakedLPToken(pid, token);
    }
}
