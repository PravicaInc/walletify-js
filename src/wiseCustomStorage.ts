import {
  connectToGaiaHub,
  GaiaHubConfig,
  PutFileOptions,
  Storage,
  uploadToGaiaHub,
} from '@stacks/storage';
import {
  FileContentLoader,
} from './contentFileLoader';
import {
  BLOCKSTACK_DEFAULT_GAIA_HUB_URL,
  megabytesToBytes,
  GaiaHubError,
  fetchPrivate,
} from '@stacks/common';

import {
  eciesGetJsonStringLength,
  getPublicKeyFromPrivate,
  signECDSA,
} from '@stacks/encryption';
import {getBlockstackErrorFromResponse} from "@stacks/storage/src/hub";

const SIGNATURE_FILE_SUFFIX = '.sig';
export class WiseCustomStorage extends Storage {
  async putFile(
    path: string,
    content: string | Buffer | ArrayBufferView | Blob,
    options?: PutFileOptions,
  ): Promise<string> {
    const defaults: PutFileOptions = {
      encrypt: true,
      sign: false,
      cipherTextEncoding: 'hex',
      dangerouslyIgnoreEtag: false,
    };
    const opt = {
      ...defaults, ...options,
    };

    const gaiaHubConfig = await this.getOrSetLocalGaiaHubConnection();
    const maxUploadBytes = megabytesToBytes(gaiaHubConfig.max_file_upload_size_megabytes!);
    const hasMaxUpload = maxUploadBytes > 0;

    const contentLoader = new FileContentLoader(content, opt.contentType!);
    let {
      contentType,
    } = contentLoader;

    // When not encrypting the content length can be checked immediately.
    if (!opt.encrypt && hasMaxUpload && contentLoader.contentByteLength > maxUploadBytes) {
      const sizeErrMsg = `The max file upload size for this hub is ${maxUploadBytes} bytes, the given content is ${contentLoader.contentByteLength} bytes`;
      const sizeErr = new Error(sizeErrMsg);
      console.error(sizeErr);
      throw sizeErr;
    }

    // When encrypting, the content length must be calculated. Certain types like `Blob`s must
    // be loaded into memory.
    if (opt.encrypt && hasMaxUpload) {
      const encryptedSize = eciesGetJsonStringLength({
        contentLength: contentLoader.contentByteLength,
        wasString: contentLoader.wasString,
        sign: !!opt.sign,
        cipherTextEncoding: opt.cipherTextEncoding!,
      });
      if (encryptedSize > maxUploadBytes) {
        const sizeErrMsg = `The max file upload size for this hub is ${maxUploadBytes} bytes, the given content is ${encryptedSize} bytes after encryption`;
        const sizeErr = new Error(sizeErrMsg);
        console.error(sizeErr);
        throw sizeErr;
      }
    }

    let etag: string;
    let newFile = true;
    const sessionData = await this.userSession.store.getSessionData();

    if (!opt.dangerouslyIgnoreEtag) {
      if (sessionData.etags?.[path]) {
        newFile = false;
        etag = sessionData.etags?.[path];
      }
    }

    let uploadFn: (hubConfig: GaiaHubConfig) => Promise<string>;

    // In the case of signing, but *not* encrypting, we perform two uploads.
    if (!opt.encrypt && opt.sign) {
      const contentData = await contentLoader.load();
      let privateKey: string;
      if (typeof opt.sign === 'string') {
        privateKey = opt.sign;
      } else {
        privateKey = await this.userSession.loadUserData().appPrivateKey;
      }
      const signatureObject = signECDSA(privateKey, contentData);
      const signatureContent = JSON.stringify(signatureObject);

      uploadFn = async (hubConfig: GaiaHubConfig) => {
        const writeResponse = (
          await Promise.all([
            uploadToGaiaHub(
              path,
              contentData,
              hubConfig,
              contentType,
              newFile,
              etag,
              opt.dangerouslyIgnoreEtag,
            ),
            uploadToGaiaHub(
              `${path}${SIGNATURE_FILE_SUFFIX}`,
              signatureContent,
              hubConfig,
              'application/json',
            ),
          ])
        )[0];
        if (!opt.dangerouslyIgnoreEtag && writeResponse.etag) {
          sessionData.etags![path] = writeResponse.etag;
          await this.userSession.store.setSessionData(sessionData);
        }
        return writeResponse.publicURL;
      };
    } else {
      // In all other cases, we only need one upload.
      let contentForUpload: string | Buffer | Blob;
      if (!opt.encrypt && !opt.sign) {
        // If content does not need encrypted or signed, it can be passed directly
        // to the fetch request without loading into memory.
        contentForUpload = contentLoader.content;
      } else {
        // Use the `encrypt` key, otherwise the `sign` key, if neither are specified
        // then use the current user's app public key.
        let publicKey: string;
        if (typeof opt.encrypt === 'string') {
          publicKey = opt.encrypt;
        } else if (typeof opt.sign === 'string') {
          publicKey = getPublicKeyFromPrivate(opt.sign);
        } else {
          publicKey = getPublicKeyFromPrivate(await this.userSession.loadUserData().appPrivateKey);
        }
        const contentData = await contentLoader.load();
        contentForUpload = await this.userSession.encryptContent(contentData, {
          publicKey,
          wasString: contentLoader.wasString,
          cipherTextEncoding: opt.cipherTextEncoding,
          sign: opt.sign,
        });
        contentType = 'application/json';
      }

      uploadFn = async (hubConfig: GaiaHubConfig) => {
        const writeResponse = await uploadToGaiaHub(
          path,
          contentForUpload,
          hubConfig,
          contentType,
          newFile,
          etag,
          opt.dangerouslyIgnoreEtag,
        );
        if (writeResponse.etag) {
          sessionData.etags![path] = writeResponse.etag;
          await this.userSession.store.setSessionData(sessionData);
        }
        return writeResponse.publicURL;
      };
    }

    try {
      return await uploadFn(gaiaHubConfig);
    } catch (error) {
      // If the upload fails on first attempt, it could be due to a recoverable
      // error which may succeed by refreshing the config and retrying.
      if (isRecoverableGaiaError(error)) {
        console.error(error);
        console.error('Possible recoverable error during Gaia upload, retrying...');
        const freshHubConfig = await this.setLocalGaiaHubConnection();
        return await uploadFn(freshHubConfig);
      }
      throw error;
    }
  }

  async getOrSetLocalGaiaHubConnection(): Promise<GaiaHubConfig> {
    const sessionData = await this.userSession.store.getSessionData();
    const {
      userData,
    } = sessionData;
    if (!userData) {
      throw new Error('Missing userData');
    }
    const hubConfig = userData.gaiaHubConfig;
    if (hubConfig) {
      return Promise.resolve(hubConfig);
    }
    return this.setLocalGaiaHubConnection();
  }

  async setLocalGaiaHubConnection(): Promise<GaiaHubConfig> {
    const userData = await this.userSession.loadUserData();

    if (!userData) {
      throw new Error('Missing userData');
    }

    if (!userData.hubUrl) {
      userData.hubUrl = BLOCKSTACK_DEFAULT_GAIA_HUB_URL;
    }

    const gaiaConfig = await connectToGaiaHub(
      userData.hubUrl,
      userData.appPrivateKey,
      userData.gaiaAssociationToken,
    );

    userData.gaiaHubConfig = gaiaConfig;

    const sessionData = await this.userSession.store.getSessionData();
    sessionData.userData!.gaiaHubConfig = gaiaConfig;
    await this.userSession.store.setSessionData(sessionData);

    return gaiaConfig;
  }
  async getFileContents(
      path: string,
      app: string,
      username: string | undefined,
      zoneFileLookupURL: string | undefined,
      forceText: boolean
  ): Promise<string | ArrayBuffer | null> {
    const opts = { app, username, zoneFileLookupURL };
    const readUrl = await this.getFileUrl(path, opts);
    const response = await fetchPrivate(readUrl);
    if (!response.ok) {
      throw await getBlockstackErrorFromResponse(response, `getFile ${path} failed.`, null);
    }
    let contentType = response.headers.get('Content-Type');
    if (typeof contentType === 'string') {
      contentType = contentType.toLowerCase();
    }

    const etag = response.headers.get('ETag');
    if (etag) {
      const sessionData = await this.userSession.store.getSessionData();
      sessionData.etags![path] = etag;
      await this.userSession.store.setSessionData(sessionData);
    }
    if (
        forceText ||
        contentType === null ||
        contentType.startsWith('text') ||
        contentType.startsWith('application/json')
    ) {
      return response.text();
    } else {
      return response.arrayBuffer();
    }
  }
}
function isRecoverableGaiaError(error: GaiaHubError): boolean {
  if (!error || !error.hubError || !error.hubError.statusCode) {
    return false;
  }
  const {
    statusCode,
  } = error.hubError;
  // 401 Unauthorized: possible expired, but renewable auth token.
  if (statusCode === 401) {
    return true;
  }
  // 409 Conflict: possible concurrent writes to a file.
  if (statusCode === 409) {
    return true;
  }
  // 500s: possible server-side transient error
  if (statusCode >= 500 && statusCode <= 599) {
    return true;
  }
  return false;
}
