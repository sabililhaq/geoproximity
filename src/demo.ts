import { mountProximity } from './index';

const app = document.getElementById('app');
if (!app) throw new Error('Missing #app');

mountProximity(app, { basePath: '/', sample: true });
