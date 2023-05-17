import { UserSession } from '@stacks/auth';
import {
    PostConditionMode,
    PostCondition,
    AnchorMode,
    ClarityValue,
    StacksTransaction,
} from '@stacks/transactions';
import { StacksNetwork } from '@stacks/network';
import BN from 'bn.js';

export interface TxBase {
    appDetails?: {
        name: string;
        icon: string;
    };
    postConditionMode?: PostConditionMode;
    postConditions?: (string | PostCondition)[];
    network?: StacksNetwork;
    anchorMode?: AnchorMode;
    attachment?: string;
    metadata?: object;
    fee?: number | string;
    /**
     * Provide the Hiro Wallet with a suggested account to sign this transaction with.
     * This is set by default if a `userSession` option is provided.
     */
    stxAddress?: string;
    /** @deprecated `unused - only included for compatibility with @stacks/transactions` */
    senderKey?: string;
    /** @deprecated `unused - only included for compatibility with @stacks/transactions` */
    nonce?: number;
}

export interface SponsoredFinishedTxPayload {
    txRaw: string;
}

export interface SponsoredFinishedTxData extends SponsoredFinishedTxPayload {
    stacksTransaction: StacksTransaction;
}

export interface FinishedTxPayload extends SponsoredFinishedTxPayload {
    txId: string;
}

export interface FinishedTxData extends FinishedTxPayload {
    stacksTransaction: StacksTransaction;
}

export enum TransactionTypes {
    ContractCall = 'contract_call',
    ContractDeploy = 'smart_contract',
    STXTransfer = 'token_transfer',
    SignMessage = 'sign_message',
}

/**
 * Contract Call
 */

export enum ContractCallArgumentType {
    BUFFER = 'buffer',
    UINT = 'uint',
    INT = 'int',
    PRINCIPAL = 'principal',
    BOOL = 'bool',
}

export interface ContractCallBase extends TxBase {
    contractAddress: string;
    contractName: string;
    functionName: string;
    functionArgs: (string | ClarityValue)[];
}

export interface OptionsBase {
    /**
     * @deprecated Authentication is no longer supported through a hosted
     * version. Users must install an extension.
     */
    authOrigin?: string;
    userSession?: UserSession;
}

export type SponsoredFinished = (data: SponsoredFinishedTxData) => void;
export type Finished = (data: FinishedTxData) => void;
export type Canceled = () => void;

export interface SponsoredOptionsBase extends TxBase, OptionsBase {
    sponsored: true;
    onFinish?: SponsoredFinished;
    onCancel?: Canceled;
}

export interface RegularOptionsBase extends TxBase, OptionsBase {
    sponsored?: false;
    onFinish?: Finished;
    onCancel?: Canceled;
}

export type ContractCallRegularOptions = ContractCallBase & RegularOptionsBase;
export type ContractCallSponsoredOptions = ContractCallBase & SponsoredOptionsBase;
export type ContractCallOptions = ContractCallRegularOptions | ContractCallSponsoredOptions;

export interface ContractCallArgument {
    type: ContractCallArgumentType;
    value: string;
}

export interface ContractCallPayload extends ContractCallBase {
    txType: TransactionTypes.ContractCall;
    publicKey: string;
    functionArgs: string[];
    sponsored?: boolean;
}

/**
 * Contract Deploy
 */
export interface ContractDeployBase extends TxBase {
    contractName: string;
    codeBody: string;
}

export type ContractDeployRegularOptions = ContractDeployBase & RegularOptionsBase;
export type ContractDeploySponsoredOptions = ContractDeployBase & SponsoredOptionsBase;
export type ContractDeployOptions = ContractDeployRegularOptions | ContractDeploySponsoredOptions;

export interface ContractDeployPayload extends ContractDeployBase {
    publicKey: string;
    txType: TransactionTypes.ContractDeploy;
    sponsored?: boolean;
}

/**
 * STX Transfer
 */

export interface STXTransferBase extends TxBase {
    recipient: string;
    amount: BN | string;
    memo?: string;
}

export type STXTransferRegularOptions = STXTransferBase & RegularOptionsBase;
export type STXTransferSponsoredOptions = STXTransferBase & SponsoredOptionsBase;
export type STXTransferOptions = STXTransferRegularOptions | STXTransferSponsoredOptions;

export interface STXTransferPayload extends STXTransferBase {
    publicKey: string;
    txType: TransactionTypes.STXTransfer;
    amount: string;
    sponsored?: boolean;
}

/**
 * Transaction Popup
 */

export type TransactionOptions = ContractCallOptions | ContractDeployOptions | STXTransferOptions | SignatureRequestOptions;
export type TransactionPayload = ContractCallPayload | ContractDeployPayload | STXTransferPayload | SignaturePayload;

export interface TransactionPopup {
    token: string;
    options: TransactionOptions;
}
export interface AuthResponsePayload {
    private_key: string;
    username: string | null;
    hubUrl: string;
    associationToken: string;
    blockstackAPIUrl: string | null;
    core_token: string | null;
    email: string | null;
    exp: number;
    iat: number;
    iss: string;
    jti: string;
    version: string;
    profile: any;
    profile_url: string;
    public_keys: string[];
}
export interface FinishedAuthData {
    authResponse: string;
    authResponsePayload: AuthResponsePayload;
    userSession: UserSession;
}
export interface AuthOptions {
    /** The URL you want the user to be redirected to after authentication. */
    redirectTo?: string;
    manifestPath?: string;
    /**
     * This callback is fired after authentication is finished.
     * The callback is called with a single object argument, with three keys:
     * `authResponse`: the raw `authResponse` string that is returned from authentication
     * `authResponsePayload`: an AuthResponsePayload object
     * `userSession`: a UserSession object with `userData` included
     * */
    onFinish?: (payload: FinishedAuthData) => void;
    /** This callback is fired if the user exits before finishing */
    onCancel?: () => void;
    /**
     * @deprecated Authentication is no longer supported through a hosted
     * version. Users must install an extension.
     */
    authOrigin?: string;
    /** If `sendToSignIn` is `true`, then the user will be sent through the sign in flow. */
    sendToSignIn?: boolean;
    userSession?: UserSession;
    appDetails: {
        /** A human-readable name for your application */
        name: string;
        /** A full URL that resolves to an image icon for your application */
        icon: string;
    };
}
export interface CommonSignaturePayload {
    publicKey: string;
    /**
     * Provide the Hiro Wallet with a suggested account to sign this transaction with.
     * This is set by default if a `userSession` option is provided.
     */
    stxAddress?: string;
    appDetails?: AuthOptions['appDetails'];
    network?: StacksNetwork;
    postConditions?: null;
    txType: TransactionTypes;
}
export interface CommonSignatureRequestOptions {
    appDetails?: AuthOptions['appDetails'];
    authOrigin?: string;
    network?: StacksNetwork;
    stxAddress?: string;
    userSession?: UserSession;
    onFinish?: SignatureFinished;
    onCancel?: SignatureCanceled;
}
export interface SignatureData {
    /* Hex encoded DER signature */
    signature: string;
    /* Hex encoded private string taken from privateKey */
    publicKey: string;
}
export type SignatureFinished = (data: SignatureData) => void;
export type SignatureCanceled = () => void;
export interface SignaturePayload extends CommonSignaturePayload {
    message: string;
}
export interface SignatureRequestOptions extends CommonSignatureRequestOptions {
    message: string;
}
