// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

// TEST ONLY: unrestricted controls and settlement deliberately exclude production authorization.
import {ERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {IERC1155Receiver} from "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import {IGameOperatorRegistry} from "../OperatorPolicy.sol";

contract SyntheticOperatorRegistry is ERC165, IGameOperatorRegistry {
    mapping(address => bool) public members;
    bool public unavailable;
    function setAllowed(address member, bool allowed) external { members[member] = allowed; }
    function setUnavailable(bool value) external { unavailable = value; }
    function isAllowlisted(address member) external view returns (bool) {
        require(!unavailable, "test registry unavailable");
        return members[member];
    }
    function supportsInterface(bytes4 id) public view override returns (bool) {
        return id == type(IGameOperatorRegistry).interfaceId || super.supportsInterface(id);
    }
}

contract ContractProbe is ERC165, IERC721Receiver, IERC1155Receiver {
    address private _target;
    bytes private _reentry;
    bool public reentryAttempted;
    bool public reentrySucceeded;
    bool public rejectDelivery;
    bool public rejectPayment;

    function configure(address target, bytes calldata reentry, bool rejectDelivery_, bool rejectPayment_) external {
        _target = target;
        _reentry = reentry;
        rejectDelivery = rejectDelivery_;
        rejectPayment = rejectPayment_;
        reentryAttempted = false;
        reentrySucceeded = false;
    }
    function execute(address target, bytes calldata input) external returns (bytes memory output) {
        bool success;
        (success, output) = target.call(input);
        if (!success) assembly ("memory-safe") { revert(add(output, 32), mload(output)) }
    }
    function _received() private {
        require(!rejectDelivery, "test receiver rejects delivery");
        if (_target != address(0) && !reentryAttempted) {
            reentryAttempted = true;
            (reentrySucceeded,) = _target.call(_reentry);
        }
    }
    function onERC721Received(address, address, uint256, bytes calldata) external returns (bytes4) {
        _received();
        return IERC721Receiver.onERC721Received.selector;
    }
    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external returns (bytes4) {
        _received();
        return IERC1155Receiver.onERC1155Received.selector;
    }
    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata) external returns (bytes4) {
        _received();
        return IERC1155Receiver.onERC1155BatchReceived.selector;
    }
    function supportsInterface(bytes4 id) public view override(ERC165, IERC165) returns (bool) {
        return id == type(IERC1155Receiver).interfaceId || id == type(IERC721Receiver).interfaceId || super.supportsInterface(id);
    }
    receive() external payable { require(!rejectPayment, "test seller rejects payment"); }
}

/// @dev Demonstrates EVM rollback only. Has no listing, pricing, order, fee or production exchange policy.
contract TestOnlyAtomicSale {
    function buy721(address collection, address seller, uint256 tokenId) external payable {
        IERC721(collection).safeTransferFrom(seller, msg.sender, tokenId);
        (bool paid,) = payable(seller).call{value: msg.value}("");
        require(paid, "test payment failed");
    }
}
