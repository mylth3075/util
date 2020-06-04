import {hello} from './hello';

describe('hello (TS)', () => {
  test('hello()', () => {
    expect(hello()).toBe('Hello, World!');

    expect(hello('universe')).toBe('Hello, Universe!');
  });

  test('@decorate', () => {
    function decorate(_target: any, _name: string, descriptor: any) {
      expect(typeof descriptor).toBe('undefined');
    }

    // @ts-ignore
    class Test {
      // @ts-ignore
      @decorate static attribute: string;
    }
  });
});
