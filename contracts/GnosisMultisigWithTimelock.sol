pragma solidity ^0.6.0;

import "./GnosisMultisig.sol";

contract MultisigWithTimelock is MultiSigWallet {
    event NewDelay(uint256 indexed newDelay);

    uint256 public delay = 2 days;
    mapping(uint256 => uint256) public timelocks;

    constructor(address[] memory _owners, uint256 _required)
        public
        MultiSigWallet(_owners, _required)
    {}

    function setDelay(uint256 _delay) public {
        require(msg.sender == address(this));
        delay = _delay;

        emit NewDelay(delay);
    }

    function addTransaction(
        address destination,
        uint256 value,
        bytes memory data
    ) internal override returns (uint256 transactionId) {
        transactionId = super.addTransaction(destination, value, data);
        timelocks[transactionId] = now + delay;
    }

    function executeTransaction(uint256 transactionId) public override {
        if (timelocks[transactionId] < now) {
            super.executeTransaction(transactionId);
        }
    }
}
