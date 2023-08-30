import Claim from "../claim/claim.js"

export interface IssueClaimOperation extends StateTransitionOperation {
    type: "issueClaim",
    claim: Claim
}

export interface RevokeClaimOperation extends StateTransitionOperation {
    type: "revokeClaim",
    claimHash: bigint
}

export interface AddAuthOperation extends StateTransitionOperation {
    type: "addAuth",
    publicKeyX: bigint,
    publicKeyY: bigint,
    publicKeyType: PublicKeyType
}

export interface RevokeAuthOperation extends StateTransitionOperation {
    type: "revokeAuth",
    publicKeyX: bigint
}

export interface StateTransitionOperation {
    type: string
}

export enum PublicKeyType {
    EDDSA = 1,
    ECDSA = 3,
    None = 0
}