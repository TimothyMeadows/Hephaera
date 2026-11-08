// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {ERC1155Supply} from "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Supply.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {AccessControlDefaultAdminRules} from "@openzeppelin/contracts/access/extensions/AccessControlDefaultAdminRules.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {OperatorPolicy} from "./OperatorPolicy.sol";

/// @notice Original bounded multi-token example with fixed definitions and lifetime issuance limits.
contract GameItems1155 is ERC1155Supply, ERC2981, AccessControlDefaultAdminRules, ReentrancyGuard, OperatorPolicy {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    uint256 public constant MAX_BATCH = 128;
    mapping(uint256 id => uint256 cap) public lifetimeCap;
    mapping(uint256 id => uint256 issued) public mintedEver;

    error InvalidCollectionConfiguration();
    error InvalidBatch();
    error LifetimeCapExceeded(uint256 id);

    constructor(
        string memory uri_, address admin, address minter, uint256[] memory ids,
        uint256[] memory caps, address royaltyReceiver, uint96 royaltyBps, address registry
    ) ERC1155(uri_) AccessControlDefaultAdminRules(2 days, admin) OperatorPolicy(registry) {
        if (minter == address(0) || minter == admin) revert InvalidCollectionConfiguration();
        if (ids.length == 0 || ids.length > MAX_BATCH || ids.length != caps.length) revert InvalidBatch();
        for (uint256 i; i < ids.length; ++i) {
            if (caps[i] == 0 || lifetimeCap[ids[i]] != 0) revert InvalidCollectionConfiguration();
            lifetimeCap[ids[i]] = caps[i];
        }
        _grantRole(MINTER_ROLE, minter);
        _setDefaultRoyalty(royaltyReceiver, royaltyBps);
    }

    function mint(address to, uint256 id, uint256 quantity, bytes calldata data) external onlyRole(MINTER_ROLE) nonReentrant {
        _reserveIssuance(id, quantity);
        _mint(to, id, quantity, data);
    }

    function mintBatch(address to, uint256[] calldata ids, uint256[] calldata quantities, bytes calldata data)
        external onlyRole(MINTER_ROLE) nonReentrant
    {
        if (ids.length == 0 || ids.length > MAX_BATCH || ids.length != quantities.length) revert InvalidBatch();
        // Increment each occurrence before any receiver callback; duplicate IDs consume the same cap.
        for (uint256 i; i < ids.length; ++i) _reserveIssuance(ids[i], quantities[i]);
        _mintBatch(to, ids, quantities, data);
    }

    /// @notice Holders destroy their own units; collection-wide transfer approval is not burn authority.
    function burn(uint256 id, uint256 quantity) external { _burn(_msgSender(), id, quantity); }

    function _reserveIssuance(uint256 id, uint256 quantity) private {
        uint256 cap = lifetimeCap[id];
        if (quantity == 0 || cap == 0 || quantity > cap - mintedEver[id]) revert LifetimeCapExceeded(id);
        mintedEver[id] += quantity;
    }

    function _update(address from, address to, uint256[] memory ids, uint256[] memory values) internal override {
        if (ids.length > MAX_BATCH) revert InvalidBatch();
        _checkTransferParticipants(_msgSender(), from, to);
        super._update(from, to, ids, values);
    }

    function _setApprovalForAll(address owner_, address operator, bool approved) internal override {
        if (approved) _checkApprovalParticipants(_msgSender(), operator);
        super._setApprovalForAll(owner_, operator, approved);
    }

    function supportsInterface(bytes4 id) public view override(ERC1155, ERC2981, AccessControlDefaultAdminRules) returns (bool) {
        return super.supportsInterface(id);
    }
}
