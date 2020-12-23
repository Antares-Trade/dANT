pragma solidity ^0.6.0;

import "./GnosisMultisigWithTimelock.sol";

contract ManualMinter is MultisigWithTimelock {
    constructor(address[] memory _owners, uint256 _required)
        public
        MultisigWithTimelock(_owners, _required)
    {}
}
