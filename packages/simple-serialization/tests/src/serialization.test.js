import {serialize} from '../../..';

describe('Serialization', () => {
  test('Basic serialization', async () => {
    expect(serialize(undefined)).toEqual({__undefined: true});
    expect(serialize(null)).toBe(null);

    expect(serialize(false)).toBe(false);
    expect(serialize(true)).toBe(true);

    expect(serialize(0)).toBe(0);
    expect(serialize(123.45)).toBe(123.45);
    expect(() => serialize(0 / 0)).toThrow('Cannot serialize a NaN value');

    expect(serialize('')).toBe('');
    expect(serialize('Hello')).toBe('Hello');

    expect(serialize(new Date('2020-01-25T08:40:53.407Z'))).toEqual({
      __class: 'Date',
      value: '2020-01-25T08:40:53.407Z'
    });
    expect(() => serialize(new Date('invalid'))).toThrow('Cannot serialize an invalid date');

    expect(serialize({title: 'Inception', country: undefined, duration: 120})).toEqual({
      title: 'Inception',
      country: {__undefined: true},
      duration: 120
    });

    expect(serialize([1, 2, undefined, 3])).toEqual([1, 2, {__undefined: true}, 3]);

    const movie = {
      title: 'Inception',
      _hidden: true,
      toJSON() {
        return {title: this.title};
      }
    };

    expect(serialize(movie)).toEqual({title: 'Inception'});

    function fun() {}

    expect(serialize(fun)).toEqual({});

    fun.limit = 100;

    expect(serialize(fun)).toEqual({limit: 100});
  });

  test('Custom serialization', async () => {
    class Movie {
      static limit = 100;

      static __serialize() {
        return {__Class: 'Movie', ...this};
      }

      __serialize() {
        return {__class: 'Movie', ...this};
      }
    }

    function objectHandler(object) {
      if (typeof object.__serialize === 'function') {
        return object.__serialize();
      }
    }

    expect(serialize(Movie, {objectHandler})).toEqual({__Class: 'Movie', limit: 100});

    const movie = new Movie();
    movie.title = 'Inception';

    expect(serialize(movie, {objectHandler})).toEqual({__class: 'Movie', title: 'Inception'});
    expect(serialize({currentMovie: movie}, {objectHandler})).toEqual({
      currentMovie: {
        __class: 'Movie',
        title: 'Inception'
      }
    });
  });
});