// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

/// @dev ABI boundary only; the selected registry's identity and policy need independent review.
interface IGameOperatorRegistry {
    function isAllowlisted(address subject) external view returns (bool);
}

/// @notice Optional Immutable-style registry integration, not a certification of ecosystem approval.
abstract contract OperatorPolicy {
    IGameOperatorRegistry public immutable operatorRegistry;

    error InvalidOperatorRegistry();
    error RestrictedOperator(address subject);

    constructor(address registry) {
        if (registry != address(0)) {
            if (registry.code.length == 0) revert InvalidOperatorRegistry();
            if (!IERC165(registry).supportsInterface(type(IGameOperatorRegistry).interfaceId)) {
                revert InvalidOperatorRegistry();
            }
        }
        operatorRegistry = IGameOperatorRegistry(registry);
    }

    function _checkApprovalParticipants(address actor, address target) internal view {
        _checkRegistrySubject(actor, false);
        _checkRegistrySubject(target, false);
    }

    function _checkTransferParticipants(address actor, address from, address to) internal view {
        _checkRegistrySubject(actor, true);
        _checkRegistrySubject(from, false);
        _checkRegistrySubject(to, false);
    }

    function _checkRegistrySubject(address subject, bool executing) private view {
        if (address(operatorRegistry) == address(0) || subject == address(0)) return;
        // tx.origin is used only to catch mediated calls during construction, never for authority.
        bool needsReview = subject.code.length != 0 || (executing && subject != tx.origin);
        if (needsReview && !operatorRegistry.isAllowlisted(subject)) revert RestrictedOperator(subject);
    }
}
