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
  const [pendingAuthentication, setPendingAuthentication] = useState<boolean>(false);

  const createSession = useCallback(async () => {
    // Method to check if the user is already authenticated.
    const signedIn = await userSession.isUserSignedIn();
    if (signedIn) {
      // Method to retrieve the user's profile data
      const sessionData = await userSession.loadUserData();
      console.warn('Use is logged in with session data', sessionData);
    } else {
      console.warn('User is not logged In');
    }
  }, []);
   const resumeAuthentication = useCallback(
           (linkingUrl: string) => {
              Linking.canOpenURL(linkingUrl)
                      .then(supported => {
                         if (supported) {
                            setPendingAuth(true);
                            const authResponse = getParameterByName('authResponse', linkingUrl);
                            setLoading();
                            userSession
                                    .handlePendingSignIn(authResponse || '')
                                    .then(() => {
                                       createSession();
                                       setPendingAuth(false);
                                    })
                                    .catch(() => {
                                       setFailure();
                                       setPendingAuth(false);
                                    });
                         }
                      })
                      .catch(() => {
                         setFailure();
                         setPendingAuth(false);
                      });
           },
           [createSession],
   );
  useEffect(() => {
    createSession();
    // setup listener for url changes.
    const subscription = DeviceEventEmitter.addListener('url', ({ url: linkingUrl }) => {
      if (e.url && !pendingAuthentication) {
         resumeAuthentication(linkingUrl);
      }
    });
    return () => subscription.remove();
  }, []);
  
   useEffect(() => {
      const getUrlAsync = async () => {
         // Get the deep link used to open the app for first time
         const initialUrl = await Linking.getInitialURL();
         resumeAuthentication(initialUrl || '');
      };

      getUrlAsync();
   }, []);
   
  const signIn = useCallback(async () => {
    // Method to generate generate the authentication request payload.
     const url = await userSession.generateAuthURL();
    // This part where you communicate with WISE to authenticate.
     Linking.openURL(url);
  }, []);
  
  const signOut = useCallback(async () => {
    await userSession.signUserOut();
  }, []);

  return {
    signIn,
    signOut,
  };
};
```
6. Make a `manifest.json` file on your hosting domain.

```json5
{
    short_name: "Pravica",
    name: "Pravica",
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

8. To enable routing back to your app from WISE you have to configure the universal links for (IOS) and app links for (Android).

Create a folder on your hosting domain root with the name `.well-known` to put the universal links for (IOS) and app links for (Android) configuration files.

1- For IOS:
- create a file with the name ‘apple-app-site-association’:
```
{
    "applinks": {
        "apps": [],
        "details": [
            {
                "appID": "MXLF5SQD6Q.io.pravica",
                "paths": [ "*" ]
            }
        ]
    }
}
```
- Replace `MXLF5SQD6Q` with your `Team ID` you can get it from https://developer.apple.com.
- Replace `io.pravica` with your `Bundle Identifier`.

- Then Add the Associated Domains Entitlement to Your App.

   To set up the entitlement in your app, open the target’s Signing & Capabilities tab in Xcode and add the Associated Domains capability and fill in the domain of your site with the prefix `applinks`:
    
    ![img.png](img.png)

For Reference: https://developer.apple.com/documentation/Xcode/supporting-associated-domains.


2- For Android:
- create a file with the name `assetlinks.json`:
```json5
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "io.pravica",
    "sha256_cert_fingerprints": ["DB:1C:4B:5C:BA:2D:DD:6E:56:47:87:93:FA:D0:7E:BF:4B:15:DF:71:99:19:73:8E:3F:2F:54:F0:C8:8B:FC:C4"]
  }
}]
```
- Replace `io.pravica` with your `Bundle Identifier`.
- Replace `sha256_cert_fingerprints` with your fingerprint. The SHA256 fingerprints of your app’s signing certificate. You can use the following command to generate the fingerprint via the Java keytool.
```shell
keytool -list -v -keystore my-release-key.keystore
```
- To enable link handling verification for your app, set android:autoVerify="true" in any one of the web URL intent filters in your app manifest that include the android.intent.action.VIEW intent action and android.intent.category.BROWSABLE intent category, as shown in the following manifest code snippet:
```xml
<activity ...>

    <intent-filter android:autoVerify="true">
        <action android:name="android.intent.action.VIEW" />
        <category android:name="android.intent.category.DEFAULT" />
        <category android:name="android.intent.category.BROWSABLE" />
        <data android:scheme="https" android:host="app.pravica.io"/>
    </intent-filter>

</activity>
```
- Replace `app.pravica.io` with your domain URL.

For Reference: https://developer.android.com/training/app-links/verify-site-associations.
