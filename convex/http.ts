import { httpRouter } from 'convex/server';
import { auth } from './auth';
import { webhook } from './billing';
import { blobProxy, corsPreflight, uploadProxy } from './recordings';
import { publicLocation, publicPage, publicRecording, publicRecordingPlayer } from './tracking';

const http = httpRouter();
auth.addHttpRoutes(http);
http.route({ path: '/revenuecat/webhook', method: 'POST', handler: webhook });
// Publieke tracking (token in query — geen lat/lng in URL)
http.route({ path: '/track/live', method: 'GET', handler: publicPage });
http.route({ path: '/track/location', method: 'GET', handler: publicLocation });
http.route({ path: '/track/recording', method: 'GET', handler: publicRecording });
http.route({ path: '/track/recording-play', method: 'GET', handler: publicRecordingPlayer });
// Opnames: geauthenticeerde proxy (Bearer). Geen client-zichtbare storage-URL of ongebonden storageId.
http.route({ path: '/recordings/upload', method: 'POST', handler: uploadProxy });
http.route({ path: '/recordings/upload', method: 'OPTIONS', handler: corsPreflight });
http.route({ path: '/recordings/blob', method: 'GET', handler: blobProxy });
http.route({ path: '/recordings/blob', method: 'OPTIONS', handler: corsPreflight });
export default http;
