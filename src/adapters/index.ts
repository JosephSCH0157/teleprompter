import * as obs from './obs';
import * as recorder from './recorder';

export interface AdapterInit {
  (): Promise<void> | void;
}

export interface AdapterFactory<T> {
  (): T;
}

export const obsAdapter: {
  init: AdapterInit;
  create: AdapterFactory<unknown>;
} = {
  init: obs.init,
  create: obs.createOBSAdapter,
};

export const recorderAdapter: {
  init: AdapterInit;
  create: AdapterFactory<unknown>;
} = {
  init: recorder.init,
  create: recorder.createRecorderAdapter,
};
