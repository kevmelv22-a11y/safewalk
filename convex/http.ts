import { httpRouter } from 'convex/server';
import { auth } from './auth';
import { webhook } from './billing';
import { blobProxy, corsPreflight, uploadProxy } from './recordings';
import { emailConfirm, emailStop, publicLocation, publicPage, publicRecording, publicRecordingPlayer, publicSubscribe, publicUnlock } from './tracking';

const http = httpRouter();
auth.addHttpRoutes(http);
http.route({ path: '/revenuecat/webhook', method: 'POST', handler: webhook });
// Publieke tracking (token in query — geen lat/lng in URL)
http.route({ path: '/track/live', method: 'GET', handler: publicPage });
http.route({ path: '/track/location', method: 'GET', handler: publicLocation });
http.route({ path: '/track/recording', method: 'GET', handler: publicRecording });
http.route({ path: '/track/recording-play', method: 'GET', handler: publicRecordingPlayer });
// Meekijkpagina 2.0: toegangscode en e-mailmeldingen voor kijkers zonder app (same-origin POST, geen CORS nodig).
http.route({ path: '/track/unlock', method: 'POST', handler: publicUnlock });
http.route({ path: '/track/subscribe', method: 'POST', handler: publicSubscribe });
http.route({ path: '/track/email-confirm', method: 'GET', handler: emailConfirm });
http.route({ path: '/track/email-confirm', method: 'POST', handler: emailConfirm });
http.route({ path: '/track/email-stop', method: 'GET', handler: emailStop });
http.route({ path: '/track/email-stop', method: 'POST', handler: emailStop });
// Opnames: geauthenticeerde proxy (Bearer). Geen client-zichtbare storage-URL of ongebonden storageId.
http.route({ path: '/recordings/upload', method: 'POST', handler: uploadProxy });
http.route({ path: '/recordings/upload', method: 'OPTIONS', handler: corsPreflight });
http.route({ path: '/recordings/blob', method: 'GET', handler: blobProxy });
http.route({ path: '/recordings/blob', method: 'OPTIONS', handler: corsPreflight });
export default http;
