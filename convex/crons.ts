import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';
const crons = cronJobs();
crons.interval('check-deadlines', { minutes: 1 }, internal.monitor.checkDeadlines, {});
crons.interval('purge-locations', { minutes: 15 }, internal.monitor.purge, {});
export default crons;
