// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract DecentralizedBank {

    // =================================
    // STORAGE
    // =================================

    // เก็บยอดเงินของแต่ละ Wallet
    mapping(address => uint256) private balances;


    // =================================
    // EVENTS
    // =================================

    event Deposit(
        address indexed user,
        uint256 amount,
        uint256 timestamp
    );

    event Withdraw(
        address indexed user,
        uint256 amount,
        uint256 timestamp
    );


    // =================================
    // DEPOSIT
    // =================================

    function deposit() public payable {

        require(msg.value > 0, "Amount must be greater than zero");

        balances[msg.sender] += msg.value;

        emit Deposit(
            msg.sender,
            msg.value,
            block.timestamp
        );
    }


    // =================================
    // WITHDRAW
    // =================================

    function withdraw(uint256 amount) public {

        require(amount > 0, "Amount must be greater than zero");

        require(
            balances[msg.sender] >= amount,
            "Insufficient balance"
        );

        // Update balance before transfer
        balances[msg.sender] -= amount;

        // Transfer ETH
        (bool success, ) = payable(msg.sender).call{
            value: amount
        }("");

        require(success, "Transfer failed");

        emit Withdraw(
            msg.sender,
            amount,
            block.timestamp
        );
    }


    // =================================
    // CHECK BALANCE
    // =================================

    function checkBalance() public view returns (uint256) {

        return balances[msg.sender];

    }


    // =================================
    // GET USER BALANCE
    // =================================

    function getBalance(address user) public view returns (uint256) {

        return balances[user];

    }


    // =================================
    // CONTRACT BALANCE
    // =================================

    function getContractBalance() public view returns (uint256) {

        return address(this).balance;

    }

}