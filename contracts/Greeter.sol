// SPDX-License-Identifier: WTFPL

pragma solidity 0.8.17;

import "hardhat/console.sol";

/**
 * @notice Sample contract
 */
contract Greeter {
    string greeting;

    constructor(string memory _greeting) {
        console.log("Deploying a Greeter with greeting:", _greeting);
        greeting = _greeting;
    }

    /**
     * @return a greeting message
     */
    function greet() public view returns (string memory) {
        return greeting;
    }

    /**
     * @notice change greeting message
     * @param _greeting new message
     */
    function setGreeting(string memory _greeting) public {
        console.log("Changing greeting from '%s' to '%s'", greeting, _greeting);
        greeting = _greeting;
    }
}
