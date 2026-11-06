import { httpRouter } from 'convex/server';
import { auth } from './auth';
import { webhook } from './billing';
import { publicLocation, publicPage, publicRecording, publicRecordingPlayer } from './tracking';

const http = httpRouter();
auth.addHttpRoutes(http);
http.route({ path: '/revenuecat/webhook', method: 'POST', handler: webhook });
// Publieke tracking (token in query — geen lat/lng in URL)
http.route({ path: '/track/live', method: 'GET', handler: publicPage });
http.route({ path: '/track/location', method: 'GET', handler: publicLocation });
http.route({ path: '/track/recording', method: 'GET', handler: publicRecording });
http.route({ path: '/track/recording-play', method: 'GET', handler: publicRecordingPlayer });
export default http;
