import Lisa from '@listenai/lisa_core';
import docs from './docs';

export default (core: typeof Lisa) => {
  docs(core);
}
