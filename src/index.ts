export * from './wiseCustomStorage';
export * from './wiseUserSession';
export * from '@stacks/auth';
export * from '@stacks/transactions';
export {SessionData,SessionOptions} from '@stacks/auth/dist/sessionData.js';
export {SessionDataStore} from '@stacks/auth/dist/sessionStore.js';

export const getParameterByName = (name: string, url: string) => {
  name = name.replace(/[\[\]]/g, '\\$&');
  const regex = new RegExp(`[?&]${name}(=([^&#]*)|&|#|$)`);
  const results = regex.exec(url);
  if (!results) {
    return null;
  }
  if (!results[2]) {
    return '';
  }
  return decodeURIComponent(results[2].replace(/\+/g, ' '));
};