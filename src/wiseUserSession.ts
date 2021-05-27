import {
    DEFAULT_PROFILE,
    getAddressFromDID,
    NAME_LOOKUP_PATH,
    UserData,
    UserSession,
    verifyAuthResponse,
} from '@stacks/auth';
import * as authMessages from '@stacks/auth/dist/messages.js';
import {
  LoginFailedError,
  isLaterVersion,
  BLOCKSTACK_DEFAULT_GAIA_HUB_URL,
  fetchPrivate,
} from '@stacks/common';
import {
  StacksMainnet,
} from '@stacks/network';
import {
  decodeToken,
} from 'jsontokens';
import {
  hexStringToECPair,

  encryptContent,
  decryptContent,
  EncryptContentOptions,
} from '@stacks/encryption';
import {
  extractProfile,
} from '@stacks/profile';


export class WiseUserSession extends UserSession {
  // @ts-ignore
  async generateAndStoreTransitKey() {
    const sessionData = await this.store.getSessionData();
    const transitKey = authMessages.generateTransitKey();
    sessionData.transitKey = transitKey;
    await this.store.setSessionData(sessionData);
    return transitKey;
  }

  // @ts-ignore
  async isUserSignedIn() {
    return !!(await this.store.getSessionData()).userData;
  }

  async handlePendingSignIn(
    authResponseToken: string = this.getAuthResponseToken(),
  ): Promise<UserData> {
    const sessionData = await this.store.getSessionData();

    if (sessionData.userData) {
      throw new LoginFailedError('Existing user session found.');
    }

    const {
      transitKey,
    } = sessionData;

    // let nameLookupURL;
    let coreNode = this.appConfig && this.appConfig.coreNode;
    if (!coreNode) {
      const network = new StacksMainnet();
      coreNode = network.bnsLookupUrl;
    }

    const tokenPayload = decodeToken(authResponseToken).payload;

    if (typeof tokenPayload === 'string') {
      throw new Error('Unexpected token payload type of string');
    }

    // Section below is removed since the config was never persisted and therefore useless

    // if (isLaterVersion(tokenPayload.version as string, '1.3.0')
    //    && tokenPayload.blockstackAPIUrl !== null && tokenPayload.blockstackAPIUrl !== undefined) {
    //   // override globally
    //   Logger.info(`Overriding ${config.network.blockstackAPIUrl} `
    //     + `with ${tokenPayload.blockstackAPIUrl}`)
    //   // TODO: this config is never saved so the user node preference
    //   // is not respected in later sessions..
    //   config.network.blockstackAPIUrl = tokenPayload.blockstackAPIUrl as string
    //   coreNode = tokenPayload.blockstackAPIUrl as string
    // }

    const nameLookupURL = `${coreNode}${NAME_LOOKUP_PATH}`;
    const fallbackLookupURLs = [
      `https://stacks-node-api.stacks.co${NAME_LOOKUP_PATH}`,
      `https://registrar.stacks.co${NAME_LOOKUP_PATH}`,
    ].filter(url => url !== nameLookupURL);
    const isValid = await verifyAuthResponse(authResponseToken, nameLookupURL, fallbackLookupURLs);
    if (!isValid) {
      throw new LoginFailedError('Invalid authentication response.');
    }

    // TODO: real version handling
    let appPrivateKey: string = tokenPayload.private_key as string;
    let coreSessionToken: string = tokenPayload.core_token as string;
    if (isLaterVersion(tokenPayload.version as string, '1.1.0')) {
      if (transitKey !== undefined && transitKey != null) {
        if (tokenPayload.private_key !== undefined && tokenPayload.private_key !== null) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
            appPrivateKey = (await authMessages.decryptPrivateKey(
              transitKey,
              tokenPayload.private_key as string,
            )) as string;
          } catch (e) {
            console.warn('Failed decryption of appPrivateKey, will try to use as given');
            try {
              hexStringToECPair(tokenPayload.private_key as string);
            } catch (ecPairError) {
              throw new LoginFailedError(
                'Failed decrypting appPrivateKey. Usually means'
                                + ' that the transit key has changed during login.',
              );
            }
          }
        }
        if (coreSessionToken !== undefined && coreSessionToken !== null) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
            coreSessionToken = (await authMessages.decryptPrivateKey(
              transitKey,
              coreSessionToken,
            )) as string;
          } catch (e) {
            console.warn('Failed decryption of coreSessionToken, will try to use as given');
          }
        }
      } else {
        throw new LoginFailedError(
          'Authenticating with protocol > 1.1.0 requires transit' + ' key, and none found.',
        );
      }
    }
    let hubUrl = BLOCKSTACK_DEFAULT_GAIA_HUB_URL;
    let gaiaAssociationToken: string;
    if (
      isLaterVersion(tokenPayload.version as string, '1.2.0')
            && tokenPayload.hubUrl !== null
            && tokenPayload.hubUrl !== undefined
    ) {
      hubUrl = tokenPayload.hubUrl as string;
    }
    if (
      isLaterVersion(tokenPayload.version as string, '1.3.0')
            && tokenPayload.associationToken !== null
            && tokenPayload.associationToken !== undefined
    ) {
      gaiaAssociationToken = tokenPayload.associationToken as string;
    }

    const userData: UserData = {
      username: tokenPayload.username as string,
      profile: tokenPayload.profile,
      email: tokenPayload.email as string,
      decentralizedID: tokenPayload.iss,
      identityAddress: getAddressFromDID(tokenPayload.iss),
      appPrivateKey,
      coreSessionToken,
      authResponseToken,
      hubUrl,
      coreNode: tokenPayload.blockstackAPIUrl as string,
      // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
      // @ts-ignore
      gaiaAssociationToken,
    };
    const profileURL = tokenPayload.profile_url as string;
    if (!userData.profile && profileURL) {
      const response = await fetchPrivate(profileURL);
      if (!response.ok) {
        // return blank profile if we fail to fetch
        userData.profile = {
          ...DEFAULT_PROFILE,
        };
      } else {
        const responseText = await response.text();
        const wrappedProfile = JSON.parse(responseText);
        userData.profile = extractProfile(wrappedProfile[0].token);
      }
    } else {
      userData.profile = tokenPayload.profile;
    }

    sessionData.userData = userData;
    await this.store.setSessionData(sessionData);

    return userData;
  }

  // @ts-ignore
  async loadUserData() {
    const {
      userData,
    } = await this.store.getSessionData();
    if (!userData) {
      throw new Error('No user data found. Did the user sign in?');
    }
    return userData;
  }

  async encryptContent(content: string | Buffer, options?: EncryptContentOptions): Promise<string> {
    const opts = {
      ...options,
    };
    if (!opts.privateKey) {
      opts.privateKey = (await this.loadUserData()).appPrivateKey;
    }
    return encryptContent(content, opts);
  }

  async decryptContent(
    content: string,
    options?: { privateKey?: string },
  ): Promise<Buffer | string> {
    const opts = {
      ...options,
    };
    if (!opts.privateKey) {
      opts.privateKey = (await this.loadUserData()).appPrivateKey;
    }
    return decryptContent(content, opts);
  }

  async signUserOut() {
    await this.store.deleteSessionData();
  }
  async generateAuthURL() {
    const transitKey = await this.generateAndStoreTransitKey();
    const token = await this.makeAuthRequest(transitKey, this.appConfig.redirectURI(), this.appConfig.manifestURI(), this.appConfig.scopes, this.appConfig.appDomain);
    return `https://wiseapp.id/download?token=${token}`;
  }
}
