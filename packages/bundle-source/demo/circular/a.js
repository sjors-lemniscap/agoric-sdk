// eslint-disable-next-line import/no-cycle
import { bar } from './b';

/**
 * @type {import('./b').Bar}
 */
export const foo = 'Foo';
export default bar;
