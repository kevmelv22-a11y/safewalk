import { httpRouter } from 'convex/server';
import { auth } from './auth';
import { webhook } from './billing';
const http = httpRouter();
auth.addHttpRoutes(http);
http.route({ path: '/revenuecat/webhook', method: 'POST', handler: webhook });
export default http;
