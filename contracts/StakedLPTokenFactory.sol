// SPDX-License-Identifier: WTFPL

pragma solidity ^0.8.17;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "./interfaces/IStakedLPTokenFactory.sol";
import "./StakedLPToken.sol";

contract StakedLPTokenFactory is IStakedLPTokenFactory {
    bytes32 public immutable override salt;
    address public immutable override masterChef;
    address internal immutable implementation;

    mapping(uint256 => address) public tokens;

    constructor(bytes32 _salt, address _masterChef) {
        salt = _salt;
        masterChef = _masterChef;
        StakedLPToken token = new StakedLPToken();
        implementation = address(token);
    }

    function createStakedLPToken(uint256 pid) external override returns (address token) {
        token = Clones.cloneDeterministic(implementation, salt);
        StakedLPToken(token).initialize(pid);

        tokens[pid] = token;

        emit CreateStakedLPToken(pid, token);
    }
}
