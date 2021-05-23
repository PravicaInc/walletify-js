# wise-js

Construct and decode authentication requests for Stacks apps.

This package provides the auth logic used by the [WISE App](https://wiseapp.id). If you're looking to integrate WISE authentication into your react-native app, wise-js provides a simple API using Stacks.
if you're not familiar with Stacks, You should first take a look into [Stacks Authentication](https://docs.stacks.co/build-apps/guides/authentication). 

![Wise](https://wiseapp.id/images/logo.png)

## Installation

```bash
npm i --save wise-js
```
or 

```bash
yarn add wise-js
```

## Usage

1. For react-native use this guide to install [react-native-crypto](https://www.npmjs.com/package/react-native-crypto).
   
   The `react-native-crypto` is A port of node's crypto module to React Native.

2. Include the app config into your app, and change the `appDomain` to your domain.
```javascript
import {
  AppConfig,
} from 'wise-js';

const appDomain = 'https://example.com';
const manifestURIPath = '/manifest.json';
const scopes = ['store_write', 'publish_data'];
const appConfig = new AppConfig(scopes, appDomain, undefined, manifestURIPath);
```
The app domain is the URL to your website/app. This is how the Stacks authentication system identifies apps and determines what credentials to provide. Changing the `appDomain` is equivalent to changing the app.

`scopes` where you set the basic permissions for your app to read and store user data. If your app will allow users to share data with other users, you will need an additional `publish_data` permission.

`manifestURIPath` is the location of your app manifest file. This file contains information about your app that is shown to the user during authentication.


3. Make a sessionStore class to customize where your authentication data is located. for example,
   this is the sessionStore class that implements [@react-native-async-storage/async-storage](https://www.npmjs.com/package/@react-native-async-storage/async-storage).
```javascript
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  SessionData,
  SessionOptions,
  SessionDataStore,
} from 'wise-js';

const LOCALSTORAGE_SESSION_KEY = 'wise-session';

export class AsyncStorageStore extends SessionDataStore {
  key: string;

  constructor(sessionOptions?: SessionOptions) {
    super(sessionOptions);
    if (
      sessionOptions
            && sessionOptions.storeOptions
            && sessionOptions.storeOptions.localStorageKey
            && typeof sessionOptions.storeOptions.localStorageKey === 'string'
    ) {
      this.key = sessionOptions.storeOptions.localStorageKey;
    } else {
      this.key = LOCALSTORAGE_SESSION_KEY;
    }
    this.init();
  }

  async init() {
    const data = await this.getData(this.key);
    if (!data) {
      const sessionData = new SessionData({});
      this.setSessionData(sessionData);
    }
  }

  async getData(key: string) {
    return AsyncStorage.getItem(key);
  }

  async getSessionData(): Promise<SessionData> {
    const data = await AsyncStorage.getItem(this.key);
    if (!data) {
      console.log('No session data was found in localStorage');
      return {};
    }
    // @ts-ignore
    const dataJSON = JSON.parse(data);
    return SessionData.fromJSON(dataJSON);
  }

  async setSessionData(session: SessionData) {
    await AsyncStorage.setItem(this.key, session.toString());
  }

  async deleteSessionData() {
    await AsyncStorage.removeItem(this.key);
    await this.setSessionData(new SessionData({}));
  }
}
```
**Important Note**: Don't forget to install `@react-native-async-storage/async-storage`

4. Use the `sessionStorage` and `appConfig` to create your `userSession`;
```javascript
import {
  WiseUserSession,
} from 'wise-js';

const userSession = new WiseUserSession({
    appConfig,
    sessionStore,
});
```
We will also initiate a `UserSession` object using the previous configurations.

5. Use the `userSession` to initiate authentication flow.
```javascript
import {
  useCallback,
  useEffect,
  useState,
} from 'react';
import {
  Alert,
  DeviceEventEmitter,
  Linking,
  Platform,
} from 'react-native';
import {
  getParameterByName,
} from 'wise-js';

export const useAuthentication = () => {
  const [userData, setUserData] = useState<IUser | undefined>(undefined);
  const [pendingAuthentication, setPendingAuthentication] = useState<boolean>(false);

  const createSession = useCallback(async () => {
    // Method to check if the user is already authenticated.
    const signedIn = await userSession.isUserSignedIn();
    if (signedIn) {
      // Method to retrieve the user's profile data
      const session = await userSession.loadUserData();
      console.warn('Use is logged in with session data', session);
    } else {
      console.warn('User is not logged In');
    }
  }, []);

  useEffect(() => {
    createSession();
    const subscription = DeviceEventEmitter.addListener('url', (e: any) => {
      if (e.url && !pendingAuthentication) {
        setPendingAuthentication(true);
        const authResponse = getParameterByName('authResponse', e.url);
        // Method to determine if there is an incoming authentication response. If detected, the userSession.handlePendingSignIn method will process the response and provide a userData object containing the user's identity, BNS username and profile information.
        // After WISE has processed your app's request, and the user has granted permission, the resulting response will be passed back to your app via deep link, more to come below.
        userSession.handlePendingSignIn(authResponse).then(
          async () => {
            await createSession();
            setPendingAuthentication(false);
          },
        );
      }
    });
    return () => subscription.remove();
  }, []);
  const signIn = useCallback(async () => {
    // Method to generate generate the authentication request payload.
     const token = await userSession.generateAuthToken();
    // This part where you communicate with WISE to authenticate.
    Linking.openURL(`${Platform.OS === 'ios' ? 'wiseapp:/' : 'https://wiseapp.id/download'}/?token=${token}`)
      .catch(() => {
        Alert.alert('Attention!', 'It seems that you don\'t have WISE dApp already installed');
      });
  }, []);
  
  const signOut = useCallback(async () => {
    await userSession.signUserOut();
  }, []);

  return {
    signIn,
    signOut,
    userData,
    setUserData,
  };
};
```
6. Make a `manifest.json` file on your hosting domain.

**Important Note**: Make sure that you change the `appURLScheme` to your app deepLinking URLScheme, `bundleID` to your IOS App Bundle ID and `packageName` to your Android App Package name.
```json5
{
    short_name: "Pravica",
    name: "Pravica",
    appURLScheme: "pravica",
    bundleID: "io.pravica",
    packageName: "io.pravica",
    icons: [
        {
            src: "https://app.pravica.io/new-logo.png",
            sizes: "64x64 32x32 24x24 16x16",
            type: "image/png"
        }
    ],
    start_url: "https://app.pravica.io",
    display: "standalone",
    theme_color: "#000000",
    background_color: "#2679ff"
}
```

`bundleID` and `packageName` are used to connect your published app identifier with your domain, to avoid malicious apps to steal user's appPrivateKey.

`appURLScheme` is used to redirect user back from WISE to your app with the authResponse.

7. To initiate [Stacks Gaia](https://docs.stacks.co/build-apps/guides/data-storage) client with your app.
```javascript
import {
   WiseCustomStorage,
} from 'wise-js';

export const wiseStorage = new WiseCustomStorage({
  userSession,
});
```
Gaia storage provides a way for users to save both public and private data off-chain while retaining complete control over it.