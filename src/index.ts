import { installBoot } from './boot/boot';
// Install early boot hooks and scheduler
installBoot();

// The compiled bundle (./dist/index.js) will import other modules and
// eventually assign window.__tpRealCore or resolve the _initCore waiter.
