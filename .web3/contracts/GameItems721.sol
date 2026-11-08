// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {AccessControlDefaultAdminRules} from "@openzeppelin/contracts/access/extensions/AccessControlDefaultAdminRules.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {OperatorPolicy} from "./OperatorPolicy.sol";

/// @notice Original bounded collection example; adapt and independently review before deployment.
contract GameItems721 is ERC721, ERC2981, AccessControlDefaultAdminRules, ReentrancyGuard, OperatorPolicy {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    uint256 public immutable lifetimeCap;
    uint256 public totalMinted;
    uint256 public circulatingSupply;
    string private _metadataBase;

    error InvalidCollectionConfiguration();
    error LifetimeCapExceeded();
    error HolderOnlyBurn();

    constructor(
        string memory name_, string memory symbol_, string memory metadataBase_,
        address admin, address minter, uint256 cap, address royaltyReceiver,
        uint96 royaltyBps, address registry
    ) ERC721(name_, symbol_) AccessControlDefaultAdminRules(2 days, admin) OperatorPolicy(registry) {
        if (cap == 0 || minter == address(0) || minter == admin) revert InvalidCollectionConfiguration();
        lifetimeCap = cap;
        _metadataBase = metadataBase_;
        _grantRole(MINTER_ROLE, minter);
        _setDefaultRoyalty(royaltyReceiver, royaltyBps);
    }

    /// @dev Burn never replenishes lifetime capacity. IDs start at one and are never reused.
    function mint(address to) external onlyRole(MINTER_ROLE) nonReentrant returns (uint256 tokenId) {
        if (totalMinted == lifetimeCap) revert LifetimeCapExceeded();
        tokenId = ++totalMinted;
        _safeMint(to, tokenId);
    }

    /// @notice Only the current holder may destroy this identity; transfer approvals do not grant burns.
    function burn(uint256 tokenId) external {
        if (ownerOf(tokenId) != _msgSender()) revert HolderOnlyBurn();
        _burn(tokenId);
    }

    function _baseURI() internal view override returns (string memory) { return _metadataBase; }

    function _update(address to, uint256 tokenId, address auth) internal override returns (address previous) {
        address from = _ownerOf(tokenId);
        _checkTransferParticipants(_msgSender(), from, to);
        previous = super._update(to, tokenId, auth);
        if (from == address(0)) ++circulatingSupply;
        if (to == address(0)) --circulatingSupply;
    }

    function _approve(address to, uint256 tokenId, address auth, bool emitEvent) internal override {
        // Clearing approvals must remain possible after a registry delists an operator or fails.
        if (to != address(0)) _checkApprovalParticipants(_msgSender(), to);
        super._approve(to, tokenId, auth, emitEvent);
    }

    function _setApprovalForAll(address owner_, address operator, bool approved) internal override {
        if (approved) _checkApprovalParticipants(_msgSender(), operator);
        super._setApprovalForAll(owner_, operator, approved);
    }

    function supportsInterface(bytes4 id) public view override(ERC721, ERC2981, AccessControlDefaultAdminRules) returns (bool) {
        return super.supportsInterface(id);
    }
}
