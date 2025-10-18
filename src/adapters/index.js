// Barrel for adapters. Exposes named adapter objects with small init/create helpers.
import * as obs from './obs.js';
import * as recorder from './recorder.js';

export const obsAdapter = { init: obs.init, create: obs.createOBSAdapter };
export const recorderAdapter = { init: recorder.init, create: recorder.createRecorderAdapter };
